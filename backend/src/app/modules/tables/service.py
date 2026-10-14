from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import conflito, nao_encontrado
from app.modules.config.models import ConfiguracaoEmpresa
from app.modules.orders.calculo import calcular
from app.modules.orders.models import Comanda
from app.modules.tables.models import Mesa
from app.modules.tables.schemas import (
    ComandaResumoMapa,
    MesaEditarIn,
    MesaIn,
    MesaMapaOut,
    MesaOut,
)

EM_ANDAMENTO = ("aberta", "aguardando_pagamento")


def _mesa(db: Session, mesa_id: int, travar: bool = False) -> Mesa:
    q = select(Mesa).where(Mesa.id == mesa_id, Mesa.deleted_at.is_(None))
    if travar:
        q = q.with_for_update().execution_options(populate_existing=True)
    m = db.scalar(q)
    if m is None:
        raise nao_encontrado("Mesa")
    return m


def obter_mesa(db: Session, mesa_id: int, travar: bool = False) -> Mesa:
    return _mesa(db, mesa_id, travar)


def _nome_em_uso(db: Session, nome: str, exceto_id: int | None = None) -> bool:
    q = select(Mesa.id).where(func.lower(Mesa.nome) == nome.lower(), Mesa.deleted_at.is_(None))
    if exceto_id is not None:
        q = q.where(Mesa.id != exceto_id)
    return db.scalar(q) is not None


def _natural_key(nome: str) -> tuple[int, str]:
    """'Mesa 2' antes de 'Mesa 10': ordena pelo número quando houver."""
    digitos = "".join(c for c in nome if c.isdigit())
    return (int(digitos) if digitos else 10**9, nome.lower())


def listar(db: Session, ativa: bool | None) -> list[Mesa]:
    q = select(Mesa).where(Mesa.deleted_at.is_(None))
    if ativa is not None:
        q = q.where(Mesa.ativa.is_(ativa))
    return sorted(db.scalars(q), key=lambda m: _natural_key(m.nome))


def mapa(db: Session) -> list[MesaMapaOut]:
    mesas = [m for m in listar(db, ativa=True)]
    taxa_padrao = db.get_one(ConfiguracaoEmpresa, 1).taxa_servico_pct
    comandas = {
        c.mesa_id: c
        for c in db.scalars(
            select(Comanda).where(Comanda.mesa_id.is_not(None), Comanda.status.in_(EM_ANDAMENTO))
        )
    }
    saida: list[MesaMapaOut] = []
    for m in mesas:
        c = comandas.get(m.id)
        resumo = None
        if c is not None:
            ativos = [i for i in c.itens if i.status == "ativo"]
            ajustes = [(a.tipo, a.modo, a.valor) for a in c.ajustes if a.removido_em is None]
            try:
                total = calcular(
                    [(i.quantidade, i.preco_unitario) for i in ativos], ajustes, c.taxa_servico_pct
                ).total
            except ValueError:
                total = calcular(
                    [(i.quantidade, i.preco_unitario) for i in ativos], [], taxa_padrao
                ).subtotal
            resumo = ComandaResumoMapa(
                id=c.id,
                status=c.status,
                nome_cliente=c.nome_cliente or (c.cliente.nome if c.cliente else None),
                num_pessoas=c.num_pessoas,
                itens_ativos=len(ativos),
                total_parcial=total,
                aberta_em=c.created_at,
            )
        saida.append(MesaMapaOut(**MesaOut.model_validate(m).model_dump(), comanda=resumo))
    return saida


def criar(db: Session, dados: MesaIn) -> Mesa:
    nome = dados.nome.strip()
    if _nome_em_uso(db, nome):
        raise conflito("mesa_nome_em_uso", "Já existe uma mesa com este nome.")
    m = Mesa(nome=nome, capacidade=dados.capacidade)
    db.add(m)
    db.flush()
    registrar(db, Acao.CREATE, "mesas", "mesa", m.id, f"Mesa {m.nome} criada.", depois=snapshot(m))
    db.commit()
    return m


def editar(db: Session, mesa_id: int, dados: MesaEditarIn) -> Mesa:
    m = _mesa(db, mesa_id, travar=True)
    antes = snapshot(m)
    if dados.nome is not None:
        nome = dados.nome.strip()
        if _nome_em_uso(db, nome, exceto_id=m.id):
            raise conflito("mesa_nome_em_uso", "Já existe uma mesa com este nome.")
        m.nome = nome
    if "capacidade" in dados.model_fields_set:
        m.capacidade = dados.capacidade
    if dados.ativa is not None:
        if not dados.ativa and m.status in ("ocupada", "aguardando_pagamento"):
            raise conflito("mesa_ocupada", "A mesa tem uma comanda em andamento.")
        m.ativa = dados.ativa
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "mesas",
        "mesa",
        m.id,
        f"Mesa {m.nome} atualizada.",
        antes=antes,
        depois=snapshot(m),
    )
    db.commit()
    return m


def excluir(db: Session, auth: AuthContext, mesa_id: int) -> None:
    m = _mesa(db, mesa_id, travar=True)
    if m.status in ("ocupada", "aguardando_pagamento"):
        raise conflito("mesa_ocupada", "A mesa tem uma comanda em andamento.")
    antes = snapshot(m)
    m.deleted_at, m.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(db, Acao.DELETE, "mesas", "mesa", m.id, f"Mesa {m.nome} excluída.", antes=antes)
    db.commit()


# Transições manuais de status. ocupada/aguardando_pagamento só mudam pela comanda.
_TRANSICOES = {
    "reservar": ({"livre"}, "reservada"),
    "bloquear": ({"livre", "reservada"}, "bloqueada"),
    "liberar": ({"reservada", "bloqueada"}, "livre"),
}


def transicionar(db: Session, mesa_id: int, acao: str) -> Mesa:
    m = _mesa(db, mesa_id, travar=True)
    permitidos, destino = _TRANSICOES[acao]
    if m.status not in permitidos:
        raise conflito(
            "transicao_invalida",
            f"Não é possível {acao} uma mesa que está {m.status.replace('_', ' ')}.",
        )
    antes = snapshot(m)
    m.status = destino
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "mesas",
        "mesa",
        m.id,
        f"Mesa {m.nome}: {antes['status']} → {destino}.",
        antes=antes,
        depois=snapshot(m),
    )
    db.commit()
    return m
