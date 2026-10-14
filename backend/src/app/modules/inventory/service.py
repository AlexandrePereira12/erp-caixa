from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado, proibido
from app.core.money import quantizar_custo, quantizar_dinheiro
from app.core.pagination import Paginacao
from app.core.tempo import para_utc
from app.modules.catalog.models import Produto
from app.modules.catalog.service import validar_casas
from app.modules.inventory.models import (
    EstoqueSaldo,
    Inventario,
    InventarioItem,
    MovimentoEstoque,
)
from app.modules.inventory.schemas import (
    AjusteIn,
    EntradaIn,
    InventarioCriarIn,
    InventarioFechadoOut,
    InventarioItemOut,
    InventarioOut,
    InventarioResumoOut,
    MovimentoOut,
    SaldoOut,
)
from app.modules.users.models import Usuario

# --- núcleo: todo movimento de estoque do sistema passa por aqui -------------------------------


def travar_saldo(db: Session, produto_id: int) -> EstoqueSaldo:
    """Garante a linha de saldo e a trava (FOR UPDATE) até o fim da transação.

    Quem movimenta vários produtos deve chamar em ordem crescente de produto_id (evita deadlock).
    """
    db.execute(
        pg_insert(EstoqueSaldo)
        .values(produto_id=produto_id, quantidade=Decimal(0))
        .on_conflict_do_nothing(index_elements=["produto_id"])
    )
    return db.execute(
        select(EstoqueSaldo)
        .where(EstoqueSaldo.produto_id == produto_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one()


def aplicar_movimento(
    db: Session,
    *,
    produto: Produto,
    delta: Decimal,
    tipo: str,
    origem_tipo: str | None = None,
    origem_id: int | None = None,
    custo_unitario: Decimal | None = None,
    documento: str | None = None,
    justificativa: str | None = None,
    permitir_negativo: bool = False,
) -> MovimentoEstoque:
    """Soma `delta` ao saldo sob trava, grava o movimento (com o saldo resultante) e, em entradas
    com custo, recalcula o custo médio ponderado. Não faz commit: a transação é do chamador."""
    if delta == 0:
        raise ValueError("movimento de estoque com variação zero")
    saldo = travar_saldo(db, produto.id)
    # O custo médio só muda por quem segura esta trava: relê-o aqui, para todo tipo de movimento,
    # senão o custo gravado ou usado no cálculo seria o que o objeto carregou antes de esperar.
    db.refresh(produto, attribute_names=["custo_medio"])
    antes = saldo.quantidade
    depois = antes + delta
    if depois < 0 and not permitir_negativo:
        raise AppError(
            409,
            "estoque_insuficiente",
            f"Estoque insuficiente de {produto.nome}: saldo {antes:f}, necessário {-delta:f}.",
            detalhes={"produto_id": produto.id, "saldo": f"{antes:f}", "necessario": f"{-delta:f}"},
        )
    saldo.quantidade = depois
    saldo.updated_at = datetime.now(UTC)

    if tipo == "entrada" and custo_unitario is not None:
        base = max(antes, Decimal(0))  # saldo negativo não pesa no custo médio
        produto.custo_medio = quantizar_custo(
            (base * produto.custo_medio + delta * custo_unitario) / (base + delta)
        )

    if custo_unitario is None and tipo != "entrada":
        # Congela o custo médio da hora: perdas e custo das vendas não mudam retroativamente.
        custo_unitario = produto.custo_medio
    mov = MovimentoEstoque(
        produto_id=produto.id,
        tipo=tipo,
        quantidade=delta,
        saldo_apos=depois,
        custo_unitario=custo_unitario,
        origem_tipo=origem_tipo,
        origem_id=origem_id,
        documento=documento,
        justificativa=justificativa,
    )
    db.add(mov)
    db.flush()
    return mov


def _produto_controlado(db: Session, produto_id: int) -> Produto:
    p = db.get(Produto, produto_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Produto")
    if not p.controla_estoque:
        raise AppError(422, "produto_sem_controle", f"{p.nome} não controla estoque.")
    return p


def _estado_mov(m: MovimentoEstoque) -> dict[str, Any]:
    return snapshot(m, excluir={"created_by"})


# --- operações manuais -------------------------------------------------------------------------


def registrar_entrada(db: Session, dados: EntradaIn) -> MovimentoEstoque:
    produto = _produto_controlado(db, dados.produto_id)
    validar_casas(dados.quantidade, produto.unidade)
    mov = aplicar_movimento(
        db,
        produto=produto,
        delta=dados.quantidade,
        tipo="entrada",
        origem_tipo="manual_entrada",
        custo_unitario=dados.custo_unitario,
        documento=dados.documento,
        justificativa=dados.justificativa,
    )
    registrar(
        db,
        Acao.CREATE,
        "estoque",
        "movimento_estoque",
        mov.id,
        f"Entrada de {dados.quantidade:f} {produto.unidade.sigla} de {produto.nome}.",
        depois=_estado_mov(mov),
    )
    db.commit()
    return mov


def registrar_ajuste(db: Session, auth: AuthContext, dados: AjusteIn) -> MovimentoEstoque:
    produto = _produto_controlado(db, dados.produto_id)
    if dados.quantidade == 0:
        raise AppError(422, "quantidade_invalida", "A quantidade não pode ser zero.")
    if dados.tipo in ("perda", "saida") and dados.quantidade < 0:
        raise AppError(
            422, "quantidade_invalida", "Para perda/saída informe a quantidade positiva."
        )
    validar_casas(abs(dados.quantidade), produto.unidade)
    if dados.permitir_negativo and "estoque.permitir_negativo" not in auth.permissoes:
        raise proibido("sem_permissao", "Você não pode autorizar estoque negativo.")

    delta = dados.quantidade if dados.tipo == "ajuste" else -dados.quantidade
    saldo_antes = travar_saldo(db, produto.id).quantidade
    mov = aplicar_movimento(
        db,
        produto=produto,
        delta=delta,
        tipo=dados.tipo,
        origem_tipo="manual_ajuste",
        justificativa=dados.justificativa,
        permitir_negativo=dados.permitir_negativo,
    )
    registrar(
        db,
        Acao.AJUSTE_ESTOQUE,
        "estoque",
        "movimento_estoque",
        mov.id,
        f"{dados.tipo.capitalize()} de {delta:+f} {produto.unidade.sigla} em {produto.nome}: {dados.justificativa}",
        antes={"saldo": saldo_antes},
        depois={"saldo": mov.saldo_apos, "movimento": _estado_mov(mov)},
    )
    db.commit()
    return mov


# --- consultas ---------------------------------------------------------------------------------


def _mov_out(m: MovimentoEstoque, usuario_nome: str | None) -> MovimentoOut:
    return MovimentoOut(
        id=m.id,
        produto_id=m.produto_id,
        produto_nome=m.produto.nome,
        unidade=m.produto.unidade.sigla,
        tipo=m.tipo,
        quantidade=m.quantidade,
        saldo_apos=m.saldo_apos,
        custo_unitario=m.custo_unitario,
        origem_tipo=m.origem_tipo,
        origem_id=m.origem_id,
        documento=m.documento,
        justificativa=m.justificativa,
        ocorrido_em=m.ocorrido_em,
        usuario_nome=usuario_nome,
    )


def montar_movimento(db: Session, m: MovimentoEstoque) -> MovimentoOut:
    nome = (
        db.scalar(select(Usuario.nome).where(Usuario.id == m.created_by)) if m.created_by else None
    )
    return _mov_out(m, nome)


def listar_movimentos(
    db: Session,
    pag: Paginacao,
    produto_id: int | None,
    tipo: str | None,
    origem_tipo: str | None,
    de: datetime | None,
    ate: datetime | None,
) -> tuple[list[MovimentoOut], int]:
    de, ate = para_utc(db, de), para_utc(db, ate)
    filtros = []
    if produto_id is not None:
        filtros.append(MovimentoEstoque.produto_id == produto_id)
    if tipo:
        filtros.append(MovimentoEstoque.tipo == tipo)
    if origem_tipo:
        filtros.append(MovimentoEstoque.origem_tipo == origem_tipo)
    if de is not None:
        filtros.append(MovimentoEstoque.ocorrido_em >= de)
    if ate is not None:
        filtros.append(MovimentoEstoque.ocorrido_em < ate)
    total = db.scalar(select(func.count()).select_from(MovimentoEstoque).where(*filtros)) or 0
    linhas = db.execute(
        select(MovimentoEstoque, Usuario.nome)
        .outerjoin(Usuario, Usuario.id == MovimentoEstoque.created_by)
        .where(*filtros)
        .order_by(MovimentoEstoque.ocorrido_em.desc(), MovimentoEstoque.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    ).all()
    return [_mov_out(m, nome) for m, nome in linhas], total


def listar_saldos(
    db: Session,
    pag: Paginacao,
    q: str | None,
    tipo: str | None,
    categoria_id: int | None,
    abaixo_minimo: bool | None,
) -> tuple[list[SaldoOut], int]:
    saldo_col = func.coalesce(EstoqueSaldo.quantidade, 0)
    base = (
        select(Produto, saldo_col.label("saldo"))
        .outerjoin(EstoqueSaldo, EstoqueSaldo.produto_id == Produto.id)
        .where(Produto.deleted_at.is_(None), Produto.controla_estoque.is_(True))
    )
    if q and q.strip():
        termo = f"%{q.strip()}%"
        base = base.where(Produto.nome.ilike(termo) | Produto.codigo.ilike(termo))
    if tipo:
        base = base.where(Produto.tipo == tipo)
    if categoria_id is not None:
        base = base.where(Produto.categoria_id == categoria_id)
    if abaixo_minimo:
        base = base.where(Produto.estoque_minimo > 0, saldo_col <= Produto.estoque_minimo)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    linhas = db.execute(
        base.order_by(func.lower(Produto.nome), Produto.id)
        .limit(pag.limite)
        .offset(pag.deslocamento)
    ).all()
    itens = [
        SaldoOut(
            produto_id=p.id,
            nome=p.nome,
            tipo=p.tipo,
            unidade=p.unidade.sigla,
            saldo=saldo,
            estoque_minimo=p.estoque_minimo,
            abaixo_minimo=bool(p.estoque_minimo > 0 and saldo <= p.estoque_minimo),
            custo_medio=p.custo_medio,
            valor_em_estoque=quantizar_dinheiro(saldo * p.custo_medio),
        )
        for p, saldo in linhas
    ]
    return itens, total


# --- inventário --------------------------------------------------------------------------------


def _inventario(db: Session, inventario_id: int, travar: bool = False) -> Inventario:
    q = select(Inventario).where(Inventario.id == inventario_id, Inventario.deleted_at.is_(None))
    if travar:
        q = q.with_for_update().execution_options(populate_existing=True)
    inv = db.scalar(q)
    if inv is None:
        raise nao_encontrado("Inventário")
    return inv


def _itens_out(inv: Inventario) -> list[InventarioItemOut]:
    return [
        InventarioItemOut(
            produto_id=i.produto_id,
            produto_nome=i.produto.nome,
            unidade=i.produto.unidade.sigla,
            quantidade_sistema=i.quantidade_sistema,
            quantidade_contada=i.quantidade_contada,
            diferenca=i.diferenca,
        )
        for i in inv.itens
    ]


def resumo(inv: Inventario) -> InventarioResumoOut:
    return InventarioResumoOut(
        id=inv.id,
        descricao=inv.descricao,
        status=inv.status,
        created_at=inv.created_at,
        fechado_em=inv.fechado_em,
        total_itens=len(inv.itens),
        itens_contados=sum(1 for i in inv.itens if i.quantidade_contada is not None),
    )


def detalhe(inv: Inventario) -> InventarioOut:
    return InventarioOut(**resumo(inv).model_dump(), itens=_itens_out(inv))


def listar_inventarios(
    db: Session, pag: Paginacao, status: str | None
) -> tuple[list[InventarioResumoOut], int]:
    filtros = [Inventario.deleted_at.is_(None)]
    if status:
        filtros.append(Inventario.status == status)
    total = db.scalar(select(func.count()).select_from(Inventario).where(*filtros)) or 0
    invs = db.scalars(
        select(Inventario)
        .where(*filtros)
        .order_by(Inventario.id.desc())
        .limit(pag.limite)
        .offset(pag.deslocamento)
    )
    return [resumo(i) for i in invs], total


def obter_inventario(db: Session, inventario_id: int) -> InventarioOut:
    return detalhe(_inventario(db, inventario_id))


def criar_inventario(db: Session, dados: InventarioCriarIn) -> InventarioOut:
    q = select(Produto).where(
        Produto.deleted_at.is_(None), Produto.controla_estoque.is_(True), Produto.ativo.is_(True)
    )
    if dados.produto_ids:
        q = q.where(Produto.id.in_(dados.produto_ids))
    if dados.categoria_id is not None:
        q = q.where(Produto.categoria_id == dados.categoria_id)
    produtos = list(db.scalars(q.order_by(Produto.id)))
    if dados.produto_ids and len(produtos) != len(set(dados.produto_ids)):
        raise AppError(
            422, "produto_invalido", "Um ou mais produtos não existem ou não controlam estoque."
        )
    if not produtos:
        raise AppError(
            422, "inventario_vazio", "Nenhum produto com controle de estoque para inventariar."
        )
    saldos = dict(
        db.execute(
            select(EstoqueSaldo.produto_id, EstoqueSaldo.quantidade).where(
                EstoqueSaldo.produto_id.in_([p.id for p in produtos])
            )
        ).all()
    )
    inv = Inventario(descricao=dados.descricao.strip(), status="aberto")
    inv.itens = [
        InventarioItem(produto_id=p.id, quantidade_sistema=saldos.get(p.id, Decimal(0)))
        for p in produtos
    ]
    db.add(inv)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "inventarios",
        "inventario",
        inv.id,
        f"Inventário '{inv.descricao}' aberto com {len(produtos)} produto(s).",
        depois={**snapshot(inv), "itens": len(produtos)},
    )
    db.commit()
    return detalhe(inv)


def contar_item(
    db: Session, inventario_id: int, produto_id: int, contada: Decimal
) -> InventarioOut:
    inv = _inventario(db, inventario_id, travar=True)
    if inv.status != "aberto":
        raise conflito("inventario_nao_aberto", f"O inventário está {inv.status}.")
    item = next((i for i in inv.itens if i.produto_id == produto_id), None)
    if item is None:
        raise nao_encontrado("Produto no inventário")
    validar_casas(contada, item.produto.unidade)
    antes = item.quantidade_contada
    item.quantidade_contada = contada
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "inventarios",
        "inventario_item",
        f"{inv.id}/{produto_id}",
        f"Contagem de {item.produto.nome}: {contada:f}.",
        antes={"quantidade_contada": antes},
        depois={"quantidade_contada": contada},
    )
    db.commit()
    return detalhe(inv)


def fechar_inventario(db: Session, auth: AuthContext, inventario_id: int) -> InventarioFechadoOut:
    inv = _inventario(db, inventario_id, travar=True)
    if inv.status != "aberto":
        raise conflito("inventario_nao_aberto", f"O inventário já está {inv.status}.")
    ajustados = 0
    nao_contados = 0
    for item in sorted(inv.itens, key=lambda i: i.produto_id):
        if item.quantidade_contada is None:
            nao_contados += 1
            continue
        saldo = travar_saldo(db, item.produto_id)
        delta = item.quantidade_contada - saldo.quantidade
        item.diferenca = delta
        if delta != 0:
            aplicar_movimento(
                db,
                produto=item.produto,
                delta=delta,
                tipo="inventario",
                origem_tipo="inventario",
                origem_id=inv.id,
                justificativa=f"Inventário #{inv.id}: {inv.descricao}",
                permitir_negativo=True,  # a contagem nunca é negativa: o saldo final é a contagem
            )
            ajustados += 1
    inv.status = "fechado"
    inv.fechado_em = datetime.now(UTC)
    inv.fechado_por = auth.usuario.id
    db.flush()
    registrar(
        db,
        Acao.AJUSTE_ESTOQUE,
        "inventarios",
        "inventario",
        inv.id,
        f"Inventário #{inv.id} fechado: {ajustados} ajuste(s), {nao_contados} produto(s) sem contagem.",
        antes={"status": "aberto"},
        depois={"status": "fechado", "ajustados": ajustados, "nao_contados": nao_contados},
    )
    db.commit()
    return InventarioFechadoOut(
        **detalhe(inv).model_dump(), ajustados=ajustados, nao_contados=nao_contados
    )


def cancelar_inventario(db: Session, inventario_id: int) -> InventarioOut:
    inv = _inventario(db, inventario_id, travar=True)
    if inv.status != "aberto":
        raise conflito("inventario_nao_aberto", f"O inventário já está {inv.status}.")
    inv.status = "cancelado"
    db.flush()
    registrar(
        db,
        Acao.CANCELAMENTO,
        "inventarios",
        "inventario",
        inv.id,
        f"Inventário #{inv.id} cancelado.",
        antes={"status": "aberto"},
        depois={"status": "cancelado"},
    )
    db.commit()
    return detalhe(inv)
