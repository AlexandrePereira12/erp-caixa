from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.pagination import Paginacao
from app.core.tempo import para_utc
from app.modules.cash.models import (
    Caixa,
    CaixaConferencia,
    CaixaEvento,
    FormaPagamento,
    MovimentoCaixa,
)
from app.modules.cash.schemas import (
    CaixaOut,
    CaixaResumoOut,
    ConferenciaOut,
    FechamentoIn,
    FormaPagamentoEditarIn,
    FormaPagamentoIn,
    MovimentoCaixaIn,
    MovimentoCaixaOut,
    OperadorResumo,
    SaldoFormaOut,
)
from app.modules.users.models import Usuario

# --- formas de pagamento ----------------------------------------------------------------------


def _forma(db: Session, forma_id: int) -> FormaPagamento:
    f = db.get(FormaPagamento, forma_id)
    if f is None or f.deleted_at is not None:
        raise nao_encontrado("Forma de pagamento")
    return f


def obter_forma(db: Session, forma_id: int) -> FormaPagamento:
    return _forma(db, forma_id)


def forma_dinheiro(db: Session) -> FormaPagamento:
    f = db.scalar(
        select(FormaPagamento).where(
            FormaPagamento.tipo == "dinheiro",
            FormaPagamento.ativa.is_(True),
            FormaPagamento.deleted_at.is_(None),
        )
    )
    if f is None:
        raise conflito("sem_forma_dinheiro", "Cadastre e ative a forma de pagamento 'dinheiro'.")
    return f


def listar_formas(db: Session, ativa: bool | None) -> list[FormaPagamento]:
    q = select(FormaPagamento).where(FormaPagamento.deleted_at.is_(None))
    if ativa is not None:
        q = q.where(FormaPagamento.ativa.is_(ativa))
    return list(db.scalars(q.order_by(FormaPagamento.ordem, FormaPagamento.id)))


def _nome_forma_em_uso(db: Session, nome: str, exceto_id: int | None = None) -> bool:
    q = select(FormaPagamento.id).where(
        func.lower(FormaPagamento.nome) == nome.lower(), FormaPagamento.deleted_at.is_(None)
    )
    if exceto_id is not None:
        q = q.where(FormaPagamento.id != exceto_id)
    return db.scalar(q) is not None


def criar_forma(db: Session, dados: FormaPagamentoIn) -> FormaPagamento:
    nome = dados.nome.strip()
    if _nome_forma_em_uso(db, nome):
        raise conflito("forma_nome_em_uso", "Já existe uma forma de pagamento com este nome.")
    if dados.tipo in ("dinheiro", "fiado") and db.scalar(
        select(FormaPagamento.id).where(
            FormaPagamento.tipo == dados.tipo, FormaPagamento.deleted_at.is_(None)
        )
    ):
        raise conflito("forma_tipo_unico", f"Já existe uma forma do tipo '{dados.tipo}'.")
    f = FormaPagamento(nome=nome, tipo=dados.tipo, ordem=dados.ordem)
    db.add(f)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "caixa",
        "forma_pagamento",
        f.id,
        f"Forma de pagamento {f.nome} criada.",
        depois=snapshot(f),
    )
    db.commit()
    return f


def editar_forma(db: Session, forma_id: int, dados: FormaPagamentoEditarIn) -> FormaPagamento:
    f = _forma(db, forma_id)
    antes = snapshot(f)
    if dados.nome is not None:
        nome = dados.nome.strip()
        if _nome_forma_em_uso(db, nome, exceto_id=f.id):
            raise conflito("forma_nome_em_uso", "Já existe uma forma de pagamento com este nome.")
        f.nome = nome
    if dados.ordem is not None:
        f.ordem = dados.ordem
    if dados.ativa is not None:
        if not dados.ativa and f.tipo in ("dinheiro", "fiado"):
            raise conflito("forma_protegida", f"A forma '{f.tipo}' não pode ser desativada.")
        f.ativa = dados.ativa
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "caixa",
        "forma_pagamento",
        f.id,
        f"Forma de pagamento {f.nome} atualizada.",
        antes=antes,
        depois=snapshot(f),
    )
    db.commit()
    return f


def excluir_forma(db: Session, auth: AuthContext, forma_id: int) -> None:
    f = _forma(db, forma_id)
    if f.tipo in ("dinheiro", "fiado"):
        raise conflito("forma_protegida", f"A forma '{f.tipo}' não pode ser excluída.")
    if db.scalar(
        select(func.count())
        .select_from(MovimentoCaixa)
        .where(MovimentoCaixa.forma_pagamento_id == f.id)
    ):
        raise conflito(
            "forma_em_uso",
            "Esta forma já foi usada em movimentos de caixa: desative-a em vez de excluir.",
        )
    antes = snapshot(f)
    f.deleted_at, f.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(
        db,
        Acao.DELETE,
        "caixa",
        "forma_pagamento",
        f.id,
        f"Forma de pagamento {f.nome} excluída.",
        antes=antes,
    )
    db.commit()


# --- caixa ------------------------------------------------------------------------------------


def _caixa(db: Session, caixa_id: int, trava: str | None = None) -> Caixa:
    """trava: None, 'share' (vendas: impede o fechamento concorrente) ou 'update'."""
    q = select(Caixa).where(Caixa.id == caixa_id, Caixa.deleted_at.is_(None))
    if trava == "share":
        q = q.with_for_update(read=True, of=Caixa).execution_options(populate_existing=True)
    elif trava == "update":
        q = q.with_for_update(of=Caixa).execution_options(populate_existing=True)
    c = db.scalar(q)
    if c is None:
        raise nao_encontrado("Caixa")
    return c


def obter_caixa(db: Session, caixa_id: int, trava: str | None = None) -> Caixa:
    return _caixa(db, caixa_id, trava)


def caixa_aberto_do_usuario(db: Session, usuario_id: int, trava: str | None = None) -> Caixa | None:
    q = select(Caixa.id).where(
        Caixa.operador_id == usuario_id, Caixa.status == "aberto", Caixa.deleted_at.is_(None)
    )
    caixa_id = db.scalar(q)
    return None if caixa_id is None else _caixa(db, caixa_id, trava)


def exigir_caixa_aberto(db: Session, auth: AuthContext, trava: str | None = None) -> Caixa:
    c = caixa_aberto_do_usuario(db, auth.usuario.id, trava)
    # Relê o status depois da trava: o caixa pode ter sido fechado enquanto esperávamos por ela.
    if c is None or c.status != "aberto":
        raise conflito("caixa_fechado", "Abra o seu caixa antes de receber valores.")
    return c


def lancar(
    db: Session,
    caixa: Caixa,
    *,
    tipo: str,
    forma: FormaPagamento,
    valor: Decimal,
    origem_tipo: str | None = None,
    origem_id: int | None = None,
    descricao: str | None = None,
) -> MovimentoCaixa:
    """Único ponto de escrita em movimento_caixa. Valor com sinal; caixa precisa estar aberto."""
    if caixa.status != "aberto":
        raise conflito("caixa_fechado", f"O caixa #{caixa.id} está fechado.")
    m = MovimentoCaixa(
        caixa_id=caixa.id,
        tipo=tipo,
        forma_pagamento_id=forma.id,
        valor=valor,
        origem_tipo=origem_tipo,
        origem_id=origem_id,
        descricao=descricao,
    )
    db.add(m)
    db.flush()
    return m


def esperado_por_forma(db: Session, caixa_id: int) -> list[SaldoFormaOut]:
    linhas = db.execute(
        select(FormaPagamento, func.coalesce(func.sum(MovimentoCaixa.valor), 0))
        .join(MovimentoCaixa, MovimentoCaixa.forma_pagamento_id == FormaPagamento.id)
        .where(MovimentoCaixa.caixa_id == caixa_id)
        .group_by(FormaPagamento.id)
        .order_by(FormaPagamento.ordem, FormaPagamento.id)
    ).all()
    return [
        SaldoFormaOut(forma_pagamento_id=f.id, forma=f.nome, tipo=f.tipo, esperado=total)
        for f, total in linhas
    ]


def saldo_dinheiro(db: Session, caixa_id: int) -> Decimal:
    return db.scalar(
        select(func.coalesce(func.sum(MovimentoCaixa.valor), 0))
        .join(FormaPagamento, FormaPagamento.id == MovimentoCaixa.forma_pagamento_id)
        .where(MovimentoCaixa.caixa_id == caixa_id, FormaPagamento.tipo == "dinheiro")
    )


def _exigir_dono_ou_gerente(auth: AuthContext, caixa: Caixa) -> None:
    if caixa.operador_id != auth.usuario.id and "caixa.gerenciar_todos" not in auth.permissoes:
        raise proibido("sem_permissao", "Este caixa pertence a outro operador.")


def _exigir_pode_ver(auth: AuthContext, caixa: Caixa) -> None:
    if caixa.operador_id != auth.usuario.id and "caixa.listar" not in auth.permissoes:
        raise proibido("sem_permissao", "Este caixa pertence a outro operador.")


def _operador(c: Caixa) -> OperadorResumo:
    return OperadorResumo(id=c.operador.id, nome=c.operador.nome)


def montar(db: Session, c: Caixa) -> CaixaOut:
    from app.modules.sales.models import Venda

    # Vendas RECEBIDAS neste caixa (inclusive as estornadas depois): o que entrou não muda
    # retroativamente. O que foi devolvido aparece em `estornos_total` do caixa que devolveu.
    vendas = db.execute(
        select(func.count(), func.coalesce(func.sum(Venda.total), 0)).where(Venda.caixa_id == c.id)
    ).one()
    por_tipo = dict(
        db.execute(
            select(MovimentoCaixa.tipo, func.coalesce(func.sum(MovimentoCaixa.valor), 0))
            .where(
                MovimentoCaixa.caixa_id == c.id,
                MovimentoCaixa.tipo.in_(
                    ("sangria", "reforco", "estorno_venda", "estorno_recebimento")
                ),
            )
            .group_by(MovimentoCaixa.tipo)
        ).all()
    )
    conferencias: list[ConferenciaOut] = []
    if c.status == "fechado":
        for x in db.scalars(
            select(CaixaConferencia)
            .where(CaixaConferencia.caixa_id == c.id, CaixaConferencia.rodada == c.rodada)
            .order_by(CaixaConferencia.id)
        ):
            conferencias.append(
                ConferenciaOut(
                    forma_pagamento_id=x.forma_pagamento_id,
                    forma=x.forma_pagamento.nome,
                    valor_esperado=x.valor_esperado,
                    valor_contado=x.valor_contado,
                    diferenca=x.diferenca,
                    justificativa=x.justificativa,
                )
            )
    return CaixaOut(
        id=c.id,
        operador=_operador(c),
        status=c.status,
        valor_abertura=c.valor_abertura,
        aberto_em=c.aberto_em,
        fechado_em=c.fechado_em,
        rodada=c.rodada,
        esperado=esperado_por_forma(db, c.id),
        vendas_qtd=vendas[0],
        vendas_total=vendas[1],
        estornos_total=-(
            por_tipo.get("estorno_venda", Decimal(0))
            + por_tipo.get("estorno_recebimento", Decimal(0))
        ),
        sangrias=-por_tipo.get("sangria", Decimal(0)),
        reforcos=por_tipo.get("reforco", Decimal(0)),
        conferencias=conferencias,
    )


def abrir(db: Session, auth: AuthContext, valor_abertura: Decimal) -> CaixaOut:
    if caixa_aberto_do_usuario(db, auth.usuario.id) is not None:
        raise conflito("caixa_ja_aberto", "Você já tem um caixa aberto.")
    dinheiro = forma_dinheiro(db)
    c = Caixa(operador_id=auth.usuario.id, status="aberto", valor_abertura=valor_abertura, rodada=1)
    db.add(c)
    db.flush()  # o índice único parcial recusa o 2º caixa aberto do mesmo operador
    if valor_abertura > 0:
        lancar(
            db,
            c,
            tipo="abertura",
            forma=dinheiro,
            valor=valor_abertura,
            origem_tipo="abertura_caixa",
            origem_id=c.id,
            descricao="Valor inicial do caixa",
        )
    db.add(CaixaEvento(caixa_id=c.id, tipo="abertura"))
    registrar(
        db,
        Acao.CREATE,
        "caixa",
        "caixa",
        c.id,
        f"Caixa #{c.id} aberto com {valor_abertura:f}.",
        depois=snapshot(c),
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def obter_saida(db: Session, auth: AuthContext, caixa_id: int) -> CaixaOut:
    c = _caixa(db, caixa_id)
    _exigir_pode_ver(auth, c)
    return montar(db, c)


def atual(db: Session, auth: AuthContext) -> CaixaOut:
    c = caixa_aberto_do_usuario(db, auth.usuario.id)
    if c is None:
        raise nao_encontrado("Caixa aberto")
    return montar(db, c)


def listar(
    db: Session,
    pag: Paginacao,
    operador_id: int | None,
    status: str | None,
    de: datetime | None,
    ate: datetime | None,
) -> tuple[list[CaixaResumoOut], int]:
    de, ate = para_utc(db, de), para_utc(db, ate)
    filtros = [Caixa.deleted_at.is_(None)]
    if operador_id is not None:
        filtros.append(Caixa.operador_id == operador_id)
    if status:
        filtros.append(Caixa.status == status)
    if de is not None:
        filtros.append(Caixa.aberto_em >= de)
    if ate is not None:
        filtros.append(Caixa.aberto_em < ate)
    total = db.scalar(select(func.count()).select_from(Caixa).where(*filtros)) or 0
    caixas = db.scalars(
        select(Caixa)
        .where(*filtros)
        .order_by(Caixa.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return [
        CaixaResumoOut(
            id=c.id,
            operador=_operador(c),
            status=c.status,
            valor_abertura=c.valor_abertura,
            aberto_em=c.aberto_em,
            fechado_em=c.fechado_em,
        )
        for c in caixas
    ], total


def _mov_out(m: MovimentoCaixa, nome: str | None) -> MovimentoCaixaOut:
    return MovimentoCaixaOut(
        id=m.id,
        caixa_id=m.caixa_id,
        tipo=m.tipo,
        forma_pagamento_id=m.forma_pagamento_id,
        forma=m.forma_pagamento.nome,
        valor=m.valor,
        origem_tipo=m.origem_tipo,
        origem_id=m.origem_id,
        descricao=m.descricao,
        created_at=m.created_at,
        usuario_nome=nome,
    )


def listar_movimentos(
    db: Session, auth: AuthContext, caixa_id: int, pag: Paginacao
) -> tuple[list[MovimentoCaixaOut], int]:
    c = _caixa(db, caixa_id)
    _exigir_pode_ver(auth, c)
    total = (
        db.scalar(
            select(func.count()).select_from(MovimentoCaixa).where(MovimentoCaixa.caixa_id == c.id)
        )
        or 0
    )
    linhas = db.execute(
        select(MovimentoCaixa, Usuario.nome)
        .outerjoin(Usuario, Usuario.id == MovimentoCaixa.created_by)
        .where(MovimentoCaixa.caixa_id == c.id)
        .order_by(MovimentoCaixa.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    ).all()
    return [_mov_out(m, nome) for m, nome in linhas], total


def registrar_movimento_manual(
    db: Session, auth: AuthContext, caixa_id: int, dados: MovimentoCaixaIn
) -> MovimentoCaixaOut:
    c = _caixa(db, caixa_id, trava="update")  # serializa com vendas e outros lançamentos
    _exigir_dono_ou_gerente(auth, c)
    dinheiro = forma_dinheiro(db)
    if dados.tipo == "sangria":
        saldo = saldo_dinheiro(db, c.id)
        if dados.valor > saldo:
            raise conflito(
                "saldo_dinheiro_insuficiente",
                f"A sangria de {dados.valor:f} passa do dinheiro esperado no caixa ({saldo:f}).",
            )
    valor = -dados.valor if dados.tipo == "sangria" else dados.valor
    m = lancar(
        db, c, tipo=dados.tipo, forma=dinheiro, valor=valor, descricao=dados.descricao.strip()
    )
    registrar(
        db,
        Acao.CREATE,
        "caixa",
        "movimento_caixa",
        m.id,
        f"Caixa #{c.id}: {dados.tipo} de {dados.valor:f} ({dados.descricao}).",
        depois=snapshot(m, excluir={"created_by"}),
    )
    db.commit()
    return _mov_out(m, auth.usuario.nome)


def fechar(db: Session, auth: AuthContext, caixa_id: int, dados: FechamentoIn) -> CaixaOut:
    c = _caixa(db, caixa_id, trava="update")
    _exigir_dono_ou_gerente(auth, c)
    if c.status != "aberto":
        raise conflito("caixa_fechado", f"O caixa #{c.id} já está fechado.")

    esperado = {s.forma_pagamento_id: s for s in esperado_por_forma(db, c.id)}
    contados: dict[int, tuple[Decimal, str | None]] = {}
    for conf in dados.conferencias:
        if conf.forma_pagamento_id in contados:
            raise AppError(
                422, "conferencia_invalida", "Forma de pagamento repetida na conferência."
            )
        _forma(db, conf.forma_pagamento_id)
        contados[conf.forma_pagamento_id] = (
            conf.valor_contado,
            (conf.justificativa or "").strip() or None,
        )
    faltando = [s.forma for fid, s in esperado.items() if s.esperado != 0 and fid not in contados]
    if faltando:
        raise AppError(
            422,
            "conferencia_incompleta",
            "Informe o valor contado de: " + ", ".join(faltando) + ".",
            detalhes={"formas": faltando},
        )

    resumo = []
    for forma_id, (contado, justificativa) in contados.items():
        previsto = esperado[forma_id].esperado if forma_id in esperado else Decimal(0)
        diferenca = contado - previsto
        if diferenca != 0 and not justificativa:
            nome = _forma(db, forma_id).nome
            raise AppError(
                422,
                "diferenca_sem_justificativa",
                f"{nome}: há diferença de {diferenca:+f}. Informe a justificativa.",
                detalhes={"forma_pagamento_id": forma_id, "diferenca": f"{diferenca:f}"},
            )
        db.add(
            CaixaConferencia(
                caixa_id=c.id,
                rodada=c.rodada,
                forma_pagamento_id=forma_id,
                valor_esperado=previsto,
                valor_contado=contado,
                diferenca=diferenca,
                justificativa=justificativa,
            )
        )
        resumo.append(
            {
                "forma_pagamento_id": forma_id,
                "esperado": previsto,
                "contado": contado,
                "diferenca": diferenca,
            }
        )

    c.status = "fechado"
    c.fechado_em = datetime.now(UTC)
    c.fechado_por = auth.usuario.id
    db.add(CaixaEvento(caixa_id=c.id, tipo="fechamento"))
    db.flush()
    com_diferenca = [r for r in resumo if r["diferenca"] != 0]
    registrar(
        db,
        Acao.FECHAMENTO_CAIXA,
        "caixa",
        "caixa",
        c.id,
        f"Caixa #{c.id} fechado"
        + (f" com {len(com_diferenca)} diferença(s)." if com_diferenca else " sem diferenças."),
        antes={"status": "aberto"},
        depois={"status": "fechado", "conferencias": resumo},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)


def reabrir(db: Session, auth: AuthContext, caixa_id: int, justificativa: str) -> CaixaOut:
    c = _caixa(db, caixa_id, trava="update")
    if c.status != "fechado":
        raise conflito("caixa_nao_fechado", "Só caixa fechado pode ser reaberto.")
    if caixa_aberto_do_usuario(db, c.operador_id) is not None:
        raise conflito("caixa_ja_aberto", "O operador já tem outro caixa aberto.")
    c.status = "aberto"
    c.fechado_em = None
    c.fechado_por = None
    c.rodada += 1
    db.add(CaixaEvento(caixa_id=c.id, tipo="reabertura", justificativa=justificativa.strip()))
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "caixa",
        "caixa",
        c.id,
        f"Caixa #{c.id} reaberto: {justificativa}",
        antes={"status": "fechado"},
        depois={"status": "aberto", "rodada": c.rodada},
    )
    db.commit()
    db.refresh(c)
    return montar(db, c)
