from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado
from app.core.pagination import Paginacao
from app.modules.cash import service as caixa_service
from app.modules.cash.models import FormaPagamento
from app.modules.finance.models import CategoriaFinanceira, TituloReceber, TituloReceberBaixa
from app.modules.finance.schemas import (
    BaixaIn,
    BaixaOut,
    CategoriaFinanceiraEditarIn,
    CategoriaFinanceiraIn,
    HistoricoComanda,
    HistoricoOut,
    HistoricoPagamento,
    PessoaResumo,
    SaldoAbertoOut,
    TituloOut,
)
from app.modules.payables.models import TituloPagar
from app.modules.people.models import Pessoa
from app.modules.sales.models import Venda, VendaPagamento
from app.modules.users.models import Usuario

# --- títulos -----------------------------------------------------------------------------------


def _titulo(db: Session, titulo_id: int, travar: bool = False) -> TituloReceber:
    q = select(TituloReceber).where(
        TituloReceber.id == titulo_id, TituloReceber.deleted_at.is_(None)
    )
    if travar:
        q = q.with_for_update(of=TituloReceber).execution_options(populate_existing=True)
    t = db.scalar(q)
    if t is None:
        raise nao_encontrado("Conta a receber")
    return t


def saldo_aberto_pessoa(db: Session, pessoa_id: int) -> tuple[Decimal, int]:
    saldo, qtd = db.execute(
        select(
            func.coalesce(func.sum(TituloReceber.valor_original - TituloReceber.valor_pago), 0),
            func.count(),
        ).where(
            TituloReceber.pessoa_id == pessoa_id,
            TituloReceber.status == "aberto",
            TituloReceber.deleted_at.is_(None),
        )
    ).one()
    return saldo, qtd


def _montar_varios(db: Session, titulos: list[TituloReceber]) -> list[TituloOut]:
    """Monta vários títulos com poucas consultas (formas, usuários e vendas em lote)."""
    baixas = [b for t in titulos for b in t.baixas]
    formas = (
        {
            f.id: f.nome
            for f in db.scalars(
                select(FormaPagamento).where(
                    FormaPagamento.id.in_({b.forma_pagamento_id for b in baixas})
                )
            )
        }
        if baixas
        else {}
    )
    nomes = (
        {
            u.id: u.nome
            for u in db.scalars(
                select(Usuario).where(
                    Usuario.id.in_({b.created_by for b in baixas if b.created_by})
                )
            )
        }
        if any(b.created_by for b in baixas)
        else {}
    )
    pagamento_ids = {t.venda_pagamento_id for t in titulos if t.venda_pagamento_id}
    vendas = (
        dict(
            db.execute(
                select(VendaPagamento.id, VendaPagamento.venda_id).where(
                    VendaPagamento.id.in_(pagamento_ids)
                )
            ).all()
        )
        if pagamento_ids
        else {}
    )
    return [
        TituloOut(
            id=t.id,
            pessoa=PessoaResumo(id=t.pessoa.id, nome=t.pessoa.nome),
            descricao=t.descricao,
            valor_original=t.valor_original,
            valor_pago=t.valor_pago,
            saldo=t.valor_original - t.valor_pago,
            vencimento=t.vencimento,
            status=t.status,
            cancelado_motivo=t.cancelado_motivo,
            venda_id=vendas.get(t.venda_pagamento_id),
            created_at=t.created_at,
            baixas=[
                BaixaOut(
                    id=b.id,
                    valor=b.valor,
                    forma=formas[b.forma_pagamento_id],
                    caixa_id=b.caixa_id,
                    estorno_de_id=b.estorno_de_id,
                    observacao=b.observacao,
                    created_at=b.created_at,
                    usuario_nome=nomes.get(b.created_by),
                )
                for b in t.baixas
            ],
        )
        for t in titulos
    ]


def _montar(db: Session, t: TituloReceber) -> TituloOut:
    return _montar_varios(db, [t])[0]


def listar(
    db: Session, pag: Paginacao, status: str | None, pessoa_id: int | None
) -> tuple[list[TituloOut], int]:
    filtros = [TituloReceber.deleted_at.is_(None)]
    if status:
        filtros.append(TituloReceber.status == status)
    if pessoa_id is not None:
        filtros.append(TituloReceber.pessoa_id == pessoa_id)
    total = db.scalar(select(func.count()).select_from(TituloReceber).where(*filtros)) or 0
    titulos = db.scalars(
        select(TituloReceber)
        .where(*filtros)
        .order_by(TituloReceber.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return _montar_varios(db, list(titulos)), total


def obter_saida(db: Session, titulo_id: int) -> TituloOut:
    return _montar(db, _titulo(db, titulo_id))


def criar_titulo_fiado(
    db: Session, *, pessoa: Pessoa, pagamento: VendaPagamento, venda: Venda
) -> TituloReceber:
    categoria = db.scalar(
        select(CategoriaFinanceira.id).where(
            CategoriaFinanceira.nome == "Vendas fiado", CategoriaFinanceira.deleted_at.is_(None)
        )
    )
    t = TituloReceber(
        pessoa_id=pessoa.id,
        venda_pagamento_id=pagamento.id,
        categoria_id=categoria,
        descricao=f"Venda #{venda.id} (comanda #{venda.comanda_id}) em fiado",
        valor_original=pagamento.valor,
        valor_pago=Decimal(0),
        status="aberto",
    )
    db.add(t)
    db.flush()
    return t


def baixar(db: Session, auth: AuthContext, titulo_id: int, dados: BaixaIn) -> TituloOut:
    # Ordem de travas: caixa do operador (share) -> título.
    caixa = caixa_service.exigir_caixa_aberto(db, auth, trava="share")
    t = _titulo(db, titulo_id, travar=True)
    if dados.chave and any(b.chave_idempotencia == dados.chave for b in t.baixas):
        return _montar(db, t)  # mesma tentativa reenviada: já foi lançada
    if t.status != "aberto":
        raise conflito("titulo_nao_aberto", f"A conta a receber está {t.status}.")
    forma = caixa_service.obter_forma(db, dados.forma_pagamento_id)
    if not forma.ativa or forma.tipo == "fiado":
        raise AppError(422, "forma_invalida", "Escolha uma forma de pagamento que entre no caixa.")
    saldo = t.valor_original - t.valor_pago
    if dados.valor > saldo:
        raise AppError(
            422,
            "valor_acima_do_saldo",
            f"O valor passa do saldo da conta ({saldo:f}).",
            detalhes={"saldo": f"{saldo:f}"},
        )
    antes = {"valor_pago": t.valor_pago, "status": t.status}
    baixa = TituloReceberBaixa(
        titulo_id=t.id,
        valor=dados.valor,
        forma_pagamento_id=forma.id,
        caixa_id=caixa.id,
        observacao=dados.observacao,
        chave_idempotencia=dados.chave,
    )
    db.add(baixa)
    db.flush()
    caixa_service.lancar(
        db,
        caixa,
        tipo="recebimento",
        forma=forma,
        valor=dados.valor,
        origem_tipo="titulo_baixa",
        origem_id=baixa.id,
        descricao=f"Recebimento da conta #{t.id} ({t.pessoa.nome})",
    )
    t.valor_pago = t.valor_pago + dados.valor
    if t.valor_pago == t.valor_original:
        t.status = "pago"
    db.flush()
    registrar(
        db,
        Acao.PAGAMENTO,
        "financeiro",
        "titulo_receber",
        t.id,
        f"Recebimento de {dados.valor:f} da conta #{t.id} ({t.pessoa.nome}) em {forma.nome}.",
        antes=antes,
        depois={"valor_pago": t.valor_pago, "status": t.status, "baixa_id": baixa.id},
    )
    db.commit()
    db.refresh(t)
    return _montar(db, t)


def estornar_titulo_da_venda(
    db: Session, *, titulo: TituloReceber, motivo: str, caixa_estorno
) -> None:
    """Chamado pelo estorno de venda: desfaz as baixas (inverso no caixa de quem estorna) e
    cancela o título. `caixa_estorno` só é usado se houver baixas a desfazer."""
    baixas = [
        b
        for b in titulo.baixas
        if b.valor > 0 and not any(x.estorno_de_id == b.id for x in titulo.baixas)
    ]
    for b in baixas:
        if caixa_estorno is None:
            raise conflito(
                "caixa_fechado", "Abra o seu caixa para devolver os recebimentos desta venda."
            )
        forma = caixa_service.obter_forma(db, b.forma_pagamento_id)
        reversao = TituloReceberBaixa(
            titulo_id=titulo.id,
            valor=-b.valor,
            forma_pagamento_id=forma.id,
            caixa_id=caixa_estorno.id,
            estorno_de_id=b.id,
            observacao=f"Estorno: {motivo}",
        )
        db.add(reversao)
        db.flush()
        caixa_service.lancar(
            db,
            caixa_estorno,
            tipo="estorno_recebimento",
            forma=forma,
            valor=-b.valor,
            origem_tipo="estorno_titulo_baixa",
            origem_id=reversao.id,
            descricao=f"Estorno do recebimento #{b.id} da conta #{titulo.id}",
        )
        titulo.valor_pago = titulo.valor_pago - b.valor
    titulo.status = "cancelado"
    titulo.cancelado_motivo = f"Venda estornada: {motivo}"
    db.flush()


def saldo_aberto(db: Session, pessoa_id: int) -> SaldoAbertoOut:
    p = db.get(Pessoa, pessoa_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Pessoa")
    saldo, qtd = saldo_aberto_pessoa(db, pessoa_id)
    c = p.cliente
    limite = c.limite_fiado if c else Decimal(0)
    return SaldoAbertoOut(
        pessoa_id=p.id,
        saldo_aberto=saldo,
        titulos_abertos=qtd,
        aceita_fiado=bool(c and c.aceita_fiado),
        limite_fiado=limite,
        limite_disponivel=(limite - saldo) if limite > 0 else None,
    )


def historico(db: Session, pessoa_id: int) -> HistoricoOut:
    from app.modules.orders import service as orders

    p = db.get(Pessoa, pessoa_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Pessoa")
    from app.modules.orders.models import Comanda

    comandas = []
    for c in db.scalars(
        select(Comanda)
        .where(Comanda.cliente_id == pessoa_id, Comanda.deleted_at.is_(None))
        .order_by(Comanda.id.desc())
        .limit(50)
    ):
        try:
            total = orders.totais_da_comanda(c).total
        except AppError:
            total = Decimal(0)
        comandas.append(
            HistoricoComanda(
                id=c.id, tipo=c.tipo, status=c.status, aberta_em=c.created_at, total=total
            )
        )
    pagamentos = [
        HistoricoPagamento(
            venda_id=vp.venda_id, forma=vp.forma_pagamento.nome, valor=vp.valor, em=v.created_at
        )
        for vp, v in db.execute(
            select(VendaPagamento, Venda)
            .join(Venda, Venda.id == VendaPagamento.venda_id)
            .where(Venda.cliente_id == pessoa_id)
            .order_by(Venda.id.desc(), VendaPagamento.id)
            .limit(100)
        ).all()
    ]
    titulos = db.scalars(
        select(TituloReceber)
        .where(TituloReceber.pessoa_id == pessoa_id, TituloReceber.deleted_at.is_(None))
        .order_by(TituloReceber.id.desc())
        .limit(50)
    )
    return HistoricoOut(
        pessoa_id=pessoa_id,
        comandas=comandas,
        pagamentos=pagamentos,
        titulos=[_montar(db, t) for t in titulos],
    )


# --- categorias financeiras --------------------------------------------------------------------


def _categoria(db: Session, categoria_id: int) -> CategoriaFinanceira:
    c = db.get(CategoriaFinanceira, categoria_id)
    if c is None or c.deleted_at is not None:
        raise nao_encontrado("Categoria financeira")
    return c


def listar_categorias(db: Session, tipo: str | None) -> list[CategoriaFinanceira]:
    q = select(CategoriaFinanceira).where(CategoriaFinanceira.deleted_at.is_(None))
    if tipo:
        q = q.where(CategoriaFinanceira.tipo == tipo)
    return list(
        db.scalars(q.order_by(CategoriaFinanceira.tipo, func.lower(CategoriaFinanceira.nome)))
    )


def _categoria_em_uso(db: Session, nome: str, tipo: str, exceto_id: int | None = None) -> bool:
    q = select(CategoriaFinanceira.id).where(
        func.lower(CategoriaFinanceira.nome) == nome.lower(),
        CategoriaFinanceira.tipo == tipo,
        CategoriaFinanceira.deleted_at.is_(None),
    )
    if exceto_id is not None:
        q = q.where(CategoriaFinanceira.id != exceto_id)
    return db.scalar(q) is not None


def criar_categoria(db: Session, dados: CategoriaFinanceiraIn) -> CategoriaFinanceira:
    nome = dados.nome.strip()
    if _categoria_em_uso(db, nome, dados.tipo):
        raise conflito("categoria_nome_em_uso", "Já existe uma categoria com este nome e tipo.")
    c = CategoriaFinanceira(nome=nome, tipo=dados.tipo)
    db.add(c)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "financeiro",
        "categoria_financeira",
        c.id,
        f"Categoria financeira {c.nome} criada.",
        depois=snapshot(c),
    )
    db.commit()
    return c


def editar_categoria(
    db: Session, categoria_id: int, dados: CategoriaFinanceiraEditarIn
) -> CategoriaFinanceira:
    c = _categoria(db, categoria_id)
    antes = snapshot(c)
    if dados.nome is not None:
        nome = dados.nome.strip()
        if _categoria_em_uso(db, nome, c.tipo, exceto_id=c.id):
            raise conflito("categoria_nome_em_uso", "Já existe uma categoria com este nome e tipo.")
        c.nome = nome
    if dados.ativa is not None:
        c.ativa = dados.ativa
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "financeiro",
        "categoria_financeira",
        c.id,
        f"Categoria financeira {c.nome} atualizada.",
        antes=antes,
        depois=snapshot(c),
    )
    db.commit()
    return c


def excluir_categoria(db: Session, auth: AuthContext, categoria_id: int) -> None:
    c = _categoria(db, categoria_id)
    if db.scalar(
        select(func.count()).select_from(TituloReceber).where(TituloReceber.categoria_id == c.id)
    ):
        raise conflito(
            "categoria_em_uso", "Há contas a receber nesta categoria: desative-a em vez de excluir."
        )
    if db.scalar(
        select(func.count()).select_from(TituloPagar).where(TituloPagar.categoria_id == c.id)
    ):
        raise conflito(
            "categoria_em_uso", "Há contas a pagar nesta categoria: desative-a em vez de excluir."
        )
    antes = snapshot(c)
    c.deleted_at, c.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(
        db,
        Acao.DELETE,
        "financeiro",
        "categoria_financeira",
        c.id,
        f"Categoria financeira {c.nome} excluída.",
        antes=antes,
    )
    db.commit()
