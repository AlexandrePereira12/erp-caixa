"""Contas a pagar.

Regras que valem em todo o módulo:
- Toda operação que altera o título trava a linha dele (`FOR UPDATE`) e relê o estado sob a trava:
  duas baixas simultâneas nunca pagam mais que o saldo (o perdedor recebe 409).
- O pagamento NÃO movimenta o caixa: é registro financeiro/gerencial. Pagar fornecedor com o
  dinheiro da gaveta continua sendo a sangria do caixa (decisão em docs/decisoes/0007).
- "Vencido" não é gravado: é calculado com o vencimento e o dia de hoje no fuso da empresa.
- Não há outra trava no caminho (nem caixa, nem estoque), então não há ordem de travas a respeitar.
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.errors import AppError, conflito, nao_encontrado
from app.core.pagination import Paginacao
from app.core.tempo import hoje_da_empresa
from app.modules.cash import service as caixa_service
from app.modules.cash.models import FormaPagamento
from app.modules.finance.models import CategoriaFinanceira
from app.modules.finance.schemas import PessoaResumo
from app.modules.payables.models import TituloPagar, TituloPagarBaixa
from app.modules.payables.schemas import (
    BaixaPagarIn,
    BaixaPagarOut,
    CancelarTituloPagarIn,
    CategoriaFinanceiraResumo,
    EstornarBaixaPagarIn,
    ResumoPagarOut,
    TituloPagarDetalheOut,
    TituloPagarEditarIn,
    TituloPagarIn,
    TituloPagarOut,
)
from app.modules.people import service as pessoas
from app.modules.people.models import Pessoa
from app.modules.users.models import Usuario

MODULO = "contas_pagar"
RECURSO = "titulo_pagar"

# --- situação ----------------------------------------------------------------------------------


def situacao_de(status: str, vencimento: date, hoje: date) -> str:
    """aberto + vencimento anterior a hoje = vencido; aberto + vencimento de hoje em diante = a vencer."""
    if status != "aberto":
        return status
    return "vencido" if vencimento < hoje else "a_vencer"


# --- acesso e trava ----------------------------------------------------------------------------


def _titulo(db: Session, titulo_id: int, travar: bool = False) -> TituloPagar:
    q = select(TituloPagar).where(TituloPagar.id == titulo_id, TituloPagar.deleted_at.is_(None))
    if travar:
        q = q.with_for_update().execution_options(populate_existing=True)
    t = db.scalar(q)
    if t is None:
        raise nao_encontrado("Conta a pagar")
    return t


def _estado(t: TituloPagar) -> dict[str, Any]:
    """Estado para a auditoria. O número da nota/boleto sai como `numero_documento`: a chave
    `documento` é mascarada pela auditoria (CPF/CNPJ) e esconderia justamente o que se quer ver."""
    dados = snapshot(t)
    dados["numero_documento"] = dados.pop("documento")
    return dados


def _validar_categoria(db: Session, categoria_id: int) -> None:
    c = db.get(CategoriaFinanceira, categoria_id)
    if c is None or c.deleted_at is not None:
        raise AppError(422, "categoria_invalida", "Categoria financeira não encontrada.")
    if c.tipo != "despesa":
        raise AppError(
            422,
            "categoria_invalida",
            f"A categoria {c.nome} é de receita: escolha uma categoria de despesa.",
        )
    if not c.ativa:
        raise AppError(422, "categoria_invalida", f"A categoria {c.nome} está inativa.")


def _texto_ou_none(valor: str | None) -> str | None:
    """Texto opcional vazio ou só com espaços vira NULL."""
    if valor is None:
        return None
    return valor.strip() or None


# --- montagem das saídas (poucas consultas, sem N+1) --------------------------------------------


def _nomes(db: Session, titulos: list[TituloPagar]) -> tuple[dict[int, str], dict[int, str]]:
    pessoa_ids = {t.pessoa_id for t in titulos if t.pessoa_id is not None}
    categoria_ids = {t.categoria_id for t in titulos if t.categoria_id is not None}
    fornecedores = (
        dict(db.execute(select(Pessoa.id, Pessoa.nome).where(Pessoa.id.in_(pessoa_ids))).all())
        if pessoa_ids
        else {}
    )
    categorias = (
        dict(
            db.execute(
                select(CategoriaFinanceira.id, CategoriaFinanceira.nome).where(
                    CategoriaFinanceira.id.in_(categoria_ids)
                )
            ).all()
        )
        if categoria_ids
        else {}
    )
    return fornecedores, categorias


def _estornadas(t: TituloPagar) -> set[int]:
    return {b.estorno_de_id for b in t.baixas if b.estorno_de_id is not None}


def _pago_em(t: TituloPagar) -> date | None:
    if t.status != "pago":
        return None
    vigentes = [b.data_pagamento for b in t.baixas if b.valor > 0 and b.id not in _estornadas(t)]
    return max(vigentes) if vigentes else None


def _resumo_do_titulo(
    t: TituloPagar,
    hoje: date,
    fornecedores: dict[int, str],
    categorias: dict[int, str],
) -> dict[str, Any]:
    aberto = t.status == "aberto"
    return {
        "id": t.id,
        "fornecedor": (
            PessoaResumo(id=t.pessoa_id, nome=fornecedores[t.pessoa_id])
            if t.pessoa_id is not None
            else None
        ),
        "categoria": (
            CategoriaFinanceiraResumo(id=t.categoria_id, nome=categorias[t.categoria_id])
            if t.categoria_id is not None
            else None
        ),
        "descricao": t.descricao,
        "documento": t.documento,
        "observacao": t.observacao,
        "valor_original": t.valor_original,
        "valor_pago": t.valor_pago,
        "saldo": t.valor_original - t.valor_pago,
        "vencimento": t.vencimento,
        "status": t.status,
        "situacao": situacao_de(t.status, t.vencimento, hoje),
        "dias_para_vencer": (t.vencimento - hoje).days if aberto else None,
        "pago_em": _pago_em(t),
        "cancelado_motivo": t.cancelado_motivo,
        "created_at": t.created_at,
    }


def _montar_lista(db: Session, titulos: list[TituloPagar], hoje: date) -> list[TituloPagarOut]:
    fornecedores, categorias = _nomes(db, titulos)
    return [TituloPagarOut(**_resumo_do_titulo(t, hoje, fornecedores, categorias)) for t in titulos]


def _montar_detalhe(db: Session, t: TituloPagar, hoje: date) -> TituloPagarDetalheOut:
    fornecedores, categorias = _nomes(db, [t])
    formas = (
        {
            f.id: f.nome
            for f in db.scalars(
                select(FormaPagamento).where(
                    FormaPagamento.id.in_({b.forma_pagamento_id for b in t.baixas})
                )
            )
        }
        if t.baixas
        else {}
    )
    autores = {b.created_by for b in t.baixas if b.created_by}
    nomes = (
        {u.id: u.nome for u in db.scalars(select(Usuario).where(Usuario.id.in_(autores)))}
        if autores
        else {}
    )
    estornadas = _estornadas(t)
    return TituloPagarDetalheOut(
        **_resumo_do_titulo(t, hoje, fornecedores, categorias),
        baixas=[
            BaixaPagarOut(
                id=b.id,
                valor=b.valor,
                forma_pagamento_id=b.forma_pagamento_id,
                forma=formas[b.forma_pagamento_id],
                data_pagamento=b.data_pagamento,
                estorno_de_id=b.estorno_de_id,
                estornada=b.id in estornadas,
                observacao=b.observacao,
                created_at=b.created_at,
                usuario_nome=nomes.get(b.created_by),
            )
            for b in t.baixas
        ],
    )


# --- consultas ---------------------------------------------------------------------------------


def listar(
    db: Session,
    pag: Paginacao,
    situacao: str,
    pessoa_id: int | None,
    categoria_id: int | None,
    vencimento_de: date | None,
    vencimento_ate: date | None,
    q: str | None,
) -> tuple[list[TituloPagarOut], int]:
    if vencimento_de and vencimento_ate and vencimento_de > vencimento_ate:
        raise AppError(422, "periodo_invalido", "A data inicial é maior que a final.")
    hoje = hoje_da_empresa(db)
    filtros = [TituloPagar.deleted_at.is_(None)]
    if situacao in ("aberto", "vencido", "a_vencer"):
        filtros.append(TituloPagar.status == "aberto")
        if situacao == "vencido":
            filtros.append(TituloPagar.vencimento < hoje)
        elif situacao == "a_vencer":
            filtros.append(TituloPagar.vencimento >= hoje)
    elif situacao in ("pago", "cancelado"):
        filtros.append(TituloPagar.status == situacao)
    if pessoa_id is not None:
        filtros.append(TituloPagar.pessoa_id == pessoa_id)
    if categoria_id is not None:
        filtros.append(TituloPagar.categoria_id == categoria_id)
    if vencimento_de is not None:
        filtros.append(TituloPagar.vencimento >= vencimento_de)
    if vencimento_ate is not None:
        filtros.append(TituloPagar.vencimento <= vencimento_ate)
    if q and q.strip():
        termo = f"%{q.strip()}%"
        filtros.append(
            or_(
                TituloPagar.descricao.ilike(termo),
                TituloPagar.documento.ilike(termo),
                TituloPagar.pessoa_id.in_(
                    select(Pessoa.id).where(
                        or_(Pessoa.nome.ilike(termo), Pessoa.nome_fantasia.ilike(termo))
                    )
                ),
            )
        )
    total = db.scalar(select(func.count()).select_from(TituloPagar).where(*filtros)) or 0
    titulos = db.scalars(
        select(TituloPagar)
        .where(*filtros)
        .order_by(TituloPagar.vencimento, TituloPagar.id)
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return _montar_lista(db, list(titulos), hoje), total


def obter(db: Session, titulo_id: int) -> TituloPagarDetalheOut:
    return _montar_detalhe(db, _titulo(db, titulo_id), hoje_da_empresa(db))


def resumo(db: Session) -> ResumoPagarOut:
    hoje = hoje_da_empresa(db)
    saldo = TituloPagar.valor_original - TituloPagar.valor_pago
    vencido = TituloPagar.vencimento < hoje
    proximos = TituloPagar.vencimento.between(hoje, hoje + timedelta(days=7))
    (aberto, aberto_qtd, atrasado, atrasado_qtd, proximo, proximo_qtd) = db.execute(
        select(
            func.coalesce(func.sum(saldo), 0),
            func.count(),
            func.coalesce(func.sum(saldo).filter(vencido), 0),
            func.count().filter(vencido),
            func.coalesce(func.sum(saldo).filter(proximos), 0),
            func.count().filter(proximos),
        ).where(TituloPagar.status == "aberto", TituloPagar.deleted_at.is_(None))
    ).one()

    mes_de = hoje.replace(day=1)
    mes_ate = hoje.replace(day=calendar.monthrange(hoje.year, hoje.month)[1])
    # Estorno herda a data da baixa original: pago líquido e contagem de pagamentos vigentes.
    pago, pago_qtd = db.execute(
        select(
            func.coalesce(func.sum(TituloPagarBaixa.valor), 0),
            func.coalesce(func.sum(case((TituloPagarBaixa.valor > 0, 1), else_=-1)), 0),
        )
        .join(TituloPagar, TituloPagar.id == TituloPagarBaixa.titulo_id)
        .where(
            TituloPagar.deleted_at.is_(None),
            TituloPagarBaixa.data_pagamento >= mes_de,
            TituloPagarBaixa.data_pagamento <= mes_ate,
        )
    ).one()
    return ResumoPagarOut(
        data_referencia=hoje,
        em_aberto=aberto,
        em_aberto_qtd=aberto_qtd,
        vencido=atrasado,
        vencido_qtd=atrasado_qtd,
        a_vencer_7_dias=proximo,
        a_vencer_7_dias_qtd=proximo_qtd,
        pago_no_mes=pago,
        pago_no_mes_qtd=int(pago_qtd),
        mes_de=mes_de,
        mes_ate=mes_ate,
    )


# --- criação e edição --------------------------------------------------------------------------


def criar(db: Session, dados: TituloPagarIn) -> TituloPagarDetalheOut:
    if dados.pessoa_id is not None:
        pessoas.exigir_fornecedor(db, dados.pessoa_id)
    if dados.categoria_id is not None:
        _validar_categoria(db, dados.categoria_id)
    t = TituloPagar(
        pessoa_id=dados.pessoa_id,
        categoria_id=dados.categoria_id,
        descricao=dados.descricao,
        documento=_texto_ou_none(dados.documento),
        valor_original=dados.valor_original,
        valor_pago=Decimal(0),
        vencimento=dados.vencimento,
        status="aberto",
        observacao=_texto_ou_none(dados.observacao),
    )
    db.add(t)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        MODULO,
        RECURSO,
        t.id,
        f"Conta a pagar #{t.id} lançada: {t.descricao}, {t.valor_original:f} "
        f"com vencimento em {t.vencimento:%d/%m/%Y}.",
        depois=_estado(t),
    )
    db.commit()
    db.refresh(t)
    return _montar_detalhe(db, t, hoje_da_empresa(db))


def editar(db: Session, titulo_id: int, dados: TituloPagarEditarIn) -> TituloPagarDetalheOut:
    t = _titulo(db, titulo_id, travar=True)
    if t.status == "cancelado":
        raise conflito("titulo_cancelado", "A conta a pagar está cancelada e não pode ser editada.")
    antes = _estado(t)
    enviados = dados.model_fields_set

    for campo, rotulo in (
        ("descricao", "A descrição"),
        ("vencimento", "O vencimento"),
        ("valor_original", "O valor"),
    ):
        if campo in enviados and getattr(dados, campo) is None:
            raise AppError(422, "validacao", f"{rotulo} não pode ficar vazio.")

    if "valor_original" in enviados and dados.valor_original != t.valor_original:
        # Qualquer pagamento lançado trava o valor, mesmo já estornado: o histórico da conta
        # (pagamentos e estornos) foi feito sobre aquele valor. Corrigir = cancelar e lançar outra.
        if db.scalar(
            select(TituloPagarBaixa.id).where(TituloPagarBaixa.titulo_id == t.id).limit(1)
        ):
            raise conflito(
                "titulo_com_baixas",
                "O valor só muda enquanto a conta não tem nenhum pagamento lançado (nem estornado): "
                "cancele esta conta e lance outra com o valor certo.",
            )
        t.valor_original = dados.valor_original
    if "descricao" in enviados:
        t.descricao = dados.descricao
    if "vencimento" in enviados:
        t.vencimento = dados.vencimento
    # Fornecedor e categoria só são revalidados quando mudam: uma conta cujo fornecedor foi
    # desativado depois continua editável nos demais campos.
    if "pessoa_id" in enviados and dados.pessoa_id != t.pessoa_id:
        if dados.pessoa_id is not None:
            pessoas.exigir_fornecedor(db, dados.pessoa_id)
        t.pessoa_id = dados.pessoa_id
    if "categoria_id" in enviados and dados.categoria_id != t.categoria_id:
        if dados.categoria_id is not None:
            _validar_categoria(db, dados.categoria_id)
        t.categoria_id = dados.categoria_id
    if "documento" in enviados:
        t.documento = _texto_ou_none(dados.documento)
    if "observacao" in enviados:
        t.observacao = _texto_ou_none(dados.observacao)

    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        MODULO,
        RECURSO,
        t.id,
        f"Conta a pagar #{t.id} atualizada.",
        antes=antes,
        depois=_estado(t),
    )
    db.commit()
    db.refresh(t)
    return _montar_detalhe(db, t, hoje_da_empresa(db))


def cancelar(db: Session, titulo_id: int, dados: CancelarTituloPagarIn) -> TituloPagarDetalheOut:
    t = _titulo(db, titulo_id, travar=True)
    if t.status == "cancelado":
        raise conflito("titulo_cancelado", "A conta a pagar já está cancelada.")
    if t.status == "pago":
        raise conflito(
            "titulo_pago", "A conta já está paga: estorne os pagamentos antes de cancelar."
        )
    if t.valor_pago > 0:
        raise conflito(
            "titulo_com_baixas",
            "Há pagamentos lançados nesta conta: estorne-os antes de cancelar.",
        )
    t.status = "cancelado"
    t.cancelado_motivo = dados.motivo
    db.flush()
    registrar(
        db,
        Acao.CANCELAMENTO,
        MODULO,
        RECURSO,
        t.id,
        f"Conta a pagar #{t.id} ({t.descricao}) cancelada: {dados.motivo}",
        antes={"status": "aberto"},
        depois={"status": "cancelado", "cancelado_motivo": dados.motivo},
    )
    db.commit()
    db.refresh(t)
    return _montar_detalhe(db, t, hoje_da_empresa(db))


# --- baixas ------------------------------------------------------------------------------------


def baixar(db: Session, titulo_id: int, dados: BaixaPagarIn) -> TituloPagarDetalheOut:
    t = _titulo(db, titulo_id, travar=True)
    hoje = hoje_da_empresa(db)
    if dados.chave and db.scalar(
        select(TituloPagarBaixa.id).where(
            TituloPagarBaixa.titulo_id == t.id, TituloPagarBaixa.chave_idempotencia == dados.chave
        )
    ):
        return _montar_detalhe(db, t, hoje)  # mesma tentativa reenviada: já foi lançada
    if t.status != "aberto":
        raise conflito("titulo_nao_aberto", f"A conta a pagar está {t.status}.")
    forma = caixa_service.obter_forma(db, dados.forma_pagamento_id)
    if not forma.ativa or forma.tipo == "fiado":
        raise AppError(
            422,
            "forma_invalida",
            "Escolha uma forma de pagamento ativa que não seja fiado.",
        )
    dia = dados.data_pagamento or hoje
    if dia > hoje:
        raise AppError(
            422,
            "data_futura",
            "A data do pagamento não pode ser futura: lance o pagamento no dia em que ele ocorrer.",
        )
    saldo = t.valor_original - t.valor_pago
    if dados.valor > saldo:
        raise conflito(
            "valor_acima_do_saldo",
            f"O valor passa do saldo da conta ({saldo:f}).",
        )

    antes = {"valor_pago": t.valor_pago, "status": t.status}
    baixa = TituloPagarBaixa(
        titulo_id=t.id,
        valor=dados.valor,
        forma_pagamento_id=forma.id,
        data_pagamento=dia,
        observacao=_texto_ou_none(dados.observacao),
        chave_idempotencia=dados.chave,
    )
    db.add(baixa)
    db.flush()
    t.valor_pago = t.valor_pago + dados.valor
    if t.valor_pago == t.valor_original:
        t.status = "pago"
    db.flush()
    registrar(
        db,
        Acao.PAGAMENTO,
        MODULO,
        RECURSO,
        t.id,
        f"Pagamento de {dados.valor:f} da conta a pagar #{t.id} ({t.descricao}) "
        f"em {forma.nome}, dia {dia:%d/%m/%Y}.",
        antes=antes,
        depois={
            "valor_pago": t.valor_pago,
            "status": t.status,
            "baixa_id": baixa.id,
            "data_pagamento": dia,
        },
    )
    db.commit()
    db.refresh(t)
    return _montar_detalhe(db, t, hoje)


def estornar_baixa(
    db: Session, titulo_id: int, baixa_id: int, dados: EstornarBaixaPagarIn
) -> TituloPagarDetalheOut:
    t = _titulo(db, titulo_id, travar=True)
    baixa = db.scalar(
        select(TituloPagarBaixa).where(
            TituloPagarBaixa.id == baixa_id, TituloPagarBaixa.titulo_id == t.id
        )
    )
    if baixa is None:
        raise nao_encontrado("Pagamento")
    if baixa.valor < 0:
        raise AppError(
            422, "baixa_invalida", "Só um pagamento pode ser estornado, não o estorno de outro."
        )
    # Lido sob a trava do título: dois estornos simultâneos da mesma baixa nunca passam juntos
    # (e o índice único em estorno_de_id é a garantia final no banco).
    if db.scalar(select(TituloPagarBaixa.id).where(TituloPagarBaixa.estorno_de_id == baixa.id)):
        raise conflito("baixa_ja_estornada", f"O pagamento #{baixa.id} já foi estornado.")
    if t.status == "cancelado":
        raise conflito("titulo_cancelado", "A conta a pagar está cancelada.")

    forma = caixa_service.obter_forma(db, baixa.forma_pagamento_id)
    antes = {"valor_pago": t.valor_pago, "status": t.status}
    reversao = TituloPagarBaixa(
        titulo_id=t.id,
        valor=-baixa.valor,
        forma_pagamento_id=baixa.forma_pagamento_id,
        data_pagamento=baixa.data_pagamento,
        estorno_de_id=baixa.id,
        observacao=f"Estorno: {dados.motivo}",
    )
    db.add(reversao)
    db.flush()
    t.valor_pago = t.valor_pago - baixa.valor
    t.status = "aberto"
    db.flush()
    registrar(
        db,
        Acao.ESTORNO,
        MODULO,
        RECURSO,
        t.id,
        f"Pagamento #{baixa.id} de {baixa.valor:f} ({forma.nome}) da conta a pagar #{t.id} "
        f"({t.descricao}) estornado: {dados.motivo}",
        antes=antes,
        depois={
            "valor_pago": t.valor_pago,
            "status": t.status,
            "baixa_id": reversao.id,
            "estorno_de_id": baixa.id,
        },
    )
    db.commit()
    db.refresh(t)
    return _montar_detalhe(db, t, hoje_da_empresa(db))
