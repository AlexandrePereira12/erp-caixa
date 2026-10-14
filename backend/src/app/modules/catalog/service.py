from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar, snapshot
from app.core.deps import AuthContext
from app.core.errors import AppError, conflito, nao_encontrado
from app.core.money import quantizar_custo, quantizar_dinheiro
from app.core.pagination import Paginacao
from app.modules.catalog.models import (
    CategoriaProduto,
    Produto,
    ProdutoComposicao,
    UnidadeMedida,
)
from app.modules.catalog.schemas import (
    CategoriaEditarIn,
    CategoriaIn,
    ComposicaoIn,
    ComposicaoItemOut,
    ProdutoEditarIn,
    ProdutoIn,
    ProdutoOut,
    UnidadeEditarIn,
    UnidadeIn,
)
from app.modules.inventory.models import EstoqueSaldo

TIPOS_INSUMO = ("insumo", "embalagem", "revenda")


def validar_casas(quantidade: Decimal, unidade: UnidadeMedida) -> None:
    """A quantidade respeita as casas decimais da unidade (UN não aceita 1,5)."""
    if quantidade != quantidade.quantize(Decimal(1).scaleb(-unidade.casas_decimais)):
        raise AppError(
            422,
            "quantidade_fracionada",
            f"A unidade {unidade.sigla} aceita no máximo {unidade.casas_decimais} casa(s) decimal(is).",
        )


# --- unidades ---------------------------------------------------------------------------------


def _unidade(db: Session, unidade_id: int) -> UnidadeMedida:
    u = db.get(UnidadeMedida, unidade_id)
    if u is None or u.deleted_at is not None:
        raise nao_encontrado("Unidade de medida")
    return u


def listar_unidades(db: Session) -> list[UnidadeMedida]:
    return list(
        db.scalars(
            select(UnidadeMedida)
            .where(UnidadeMedida.deleted_at.is_(None))
            .order_by(UnidadeMedida.sigla)
        )
    )


def _sigla_em_uso(db: Session, sigla: str, exceto_id: int | None = None) -> bool:
    q = select(UnidadeMedida.id).where(
        func.lower(UnidadeMedida.sigla) == sigla.lower(), UnidadeMedida.deleted_at.is_(None)
    )
    if exceto_id is not None:
        q = q.where(UnidadeMedida.id != exceto_id)
    return db.scalar(q) is not None


def criar_unidade(db: Session, dados: UnidadeIn) -> UnidadeMedida:
    sigla = dados.sigla.strip().upper()
    if _sigla_em_uso(db, sigla):
        raise conflito("sigla_em_uso", "Já existe uma unidade com esta sigla.")
    u = UnidadeMedida(sigla=sigla, nome=dados.nome.strip(), casas_decimais=dados.casas_decimais)
    db.add(u)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "catalogo",
        "unidade_medida",
        u.id,
        f"Unidade {u.sigla} criada.",
        depois=snapshot(u),
    )
    db.commit()
    return u


def editar_unidade(db: Session, unidade_id: int, dados: UnidadeEditarIn) -> UnidadeMedida:
    u = _unidade(db, unidade_id)
    antes = snapshot(u)
    if dados.sigla is not None:
        sigla = dados.sigla.strip().upper()
        if _sigla_em_uso(db, sigla, exceto_id=u.id):
            raise conflito("sigla_em_uso", "Já existe uma unidade com esta sigla.")
        u.sigla = sigla
    if dados.nome is not None:
        u.nome = dados.nome.strip()
    if dados.casas_decimais is not None and dados.casas_decimais != u.casas_decimais:
        if dados.casas_decimais < u.casas_decimais and db.scalar(
            select(func.count())
            .select_from(Produto)
            .where(Produto.unidade_id == u.id, Produto.deleted_at.is_(None))
        ):
            # Reduzir casas deixaria quantidades já gravadas fora da regra da unidade.
            raise conflito(
                "unidade_em_uso",
                "Há produtos nesta unidade: não é possível reduzir as casas decimais.",
            )
        u.casas_decimais = dados.casas_decimais
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "catalogo",
        "unidade_medida",
        u.id,
        f"Unidade {u.sigla} atualizada.",
        antes=antes,
        depois=snapshot(u),
    )
    db.commit()
    return u


def excluir_unidade(db: Session, auth: AuthContext, unidade_id: int) -> None:
    u = _unidade(db, unidade_id)
    if db.scalar(
        select(func.count())
        .select_from(Produto)
        .where(Produto.unidade_id == u.id, Produto.deleted_at.is_(None))
    ):
        raise conflito("unidade_em_uso", "Há produtos usando esta unidade.")
    antes = snapshot(u)
    u.deleted_at, u.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(
        db,
        Acao.DELETE,
        "catalogo",
        "unidade_medida",
        u.id,
        f"Unidade {u.sigla} excluída.",
        antes=antes,
    )
    db.commit()


# --- categorias -------------------------------------------------------------------------------


def _categoria(db: Session, categoria_id: int) -> CategoriaProduto:
    c = db.get(CategoriaProduto, categoria_id)
    if c is None or c.deleted_at is not None:
        raise nao_encontrado("Categoria")
    return c


def listar_categorias(db: Session, ativo: bool | None) -> list[CategoriaProduto]:
    q = select(CategoriaProduto).where(CategoriaProduto.deleted_at.is_(None))
    if ativo is not None:
        q = q.where(CategoriaProduto.ativo.is_(ativo))
    return list(db.scalars(q.order_by(func.lower(CategoriaProduto.nome))))


def _nome_categoria_em_uso(db: Session, nome: str, exceto_id: int | None = None) -> bool:
    q = select(CategoriaProduto.id).where(
        func.lower(CategoriaProduto.nome) == nome.lower(), CategoriaProduto.deleted_at.is_(None)
    )
    if exceto_id is not None:
        q = q.where(CategoriaProduto.id != exceto_id)
    return db.scalar(q) is not None


def criar_categoria(db: Session, dados: CategoriaIn) -> CategoriaProduto:
    nome = dados.nome.strip()
    if _nome_categoria_em_uso(db, nome):
        raise conflito("categoria_nome_em_uso", "Já existe uma categoria com este nome.")
    c = CategoriaProduto(nome=nome, descricao=dados.descricao, ativo=dados.ativo)
    db.add(c)
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "catalogo",
        "categoria_produto",
        c.id,
        f"Categoria {c.nome} criada.",
        depois=snapshot(c),
    )
    db.commit()
    return c


def editar_categoria(db: Session, categoria_id: int, dados: CategoriaEditarIn) -> CategoriaProduto:
    c = _categoria(db, categoria_id)
    antes = snapshot(c)
    if dados.nome is not None:
        nome = dados.nome.strip()
        if _nome_categoria_em_uso(db, nome, exceto_id=c.id):
            raise conflito("categoria_nome_em_uso", "Já existe uma categoria com este nome.")
        c.nome = nome
    if "descricao" in dados.model_fields_set:
        c.descricao = dados.descricao
    if dados.ativo is not None:
        c.ativo = dados.ativo
    db.flush()
    registrar(
        db,
        Acao.UPDATE,
        "catalogo",
        "categoria_produto",
        c.id,
        f"Categoria {c.nome} atualizada.",
        antes=antes,
        depois=snapshot(c),
    )
    db.commit()
    return c


def excluir_categoria(db: Session, auth: AuthContext, categoria_id: int) -> None:
    c = _categoria(db, categoria_id)
    if db.scalar(
        select(func.count())
        .select_from(Produto)
        .where(Produto.categoria_id == c.id, Produto.deleted_at.is_(None))
    ):
        raise conflito("categoria_em_uso", "Há produtos nesta categoria.")
    antes = snapshot(c)
    c.deleted_at, c.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(
        db,
        Acao.DELETE,
        "catalogo",
        "categoria_produto",
        c.id,
        f"Categoria {c.nome} excluída.",
        antes=antes,
    )
    db.commit()


# --- produtos ---------------------------------------------------------------------------------


def _produto(db: Session, produto_id: int) -> Produto:
    p = db.get(Produto, produto_id)
    if p is None or p.deleted_at is not None:
        raise nao_encontrado("Produto")
    return p


def _estado(p: Produto) -> dict[str, Any]:
    return {
        **snapshot(p),
        "composicao": [
            {"insumo_id": i.insumo_id, "quantidade": i.quantidade} for i in p.composicao
        ],
    }


def _saldo(db: Session, produto_id: int) -> Decimal | None:
    return db.scalar(select(EstoqueSaldo.quantidade).where(EstoqueSaldo.produto_id == produto_id))


def montar_saida(db: Session, p: Produto, saldo: Decimal | None | str = "buscar") -> ProdutoOut:
    if isinstance(saldo, str):
        saldo = _saldo(db, p.id)
    itens: list[ComposicaoItemOut] = []
    custo_ficha: Decimal | None = None
    if p.composicao:
        insumos = {
            i.id: i
            for i in db.scalars(
                select(Produto).where(Produto.id.in_([c.insumo_id for c in p.composicao]))
            )
        }
        total = Decimal(0)
        for c in p.composicao:
            ins = insumos[c.insumo_id]
            custo_item = c.quantidade * ins.custo_medio
            total += custo_item
            itens.append(
                ComposicaoItemOut(
                    insumo_id=ins.id,
                    insumo_nome=ins.nome,
                    unidade=ins.unidade.sigla,
                    quantidade=c.quantidade,
                    custo_item=quantizar_dinheiro(custo_item),
                )
            )
        custo_ficha = quantizar_custo(total)
    efetivo = saldo if saldo is not None else Decimal(0)
    return ProdutoOut(
        id=p.id,
        nome=p.nome,
        tipo=p.tipo,
        categoria=p.categoria,
        unidade=p.unidade,
        codigo=p.codigo,
        codigo_barras=p.codigo_barras,
        preco_venda=p.preco_venda,
        custo_medio=p.custo_medio,
        custo_ficha=custo_ficha,
        estoque_minimo=p.estoque_minimo,
        controla_estoque=p.controla_estoque,
        vendavel=p.vendavel,
        ativo=p.ativo,
        saldo=saldo if p.controla_estoque else None,
        abaixo_minimo=bool(
            p.controla_estoque and efetivo <= p.estoque_minimo and p.estoque_minimo > 0
        ),
        composicao=itens,
    )


def obter_saida(db: Session, produto_id: int) -> ProdutoOut:
    return montar_saida(db, _produto(db, produto_id))


def listar_produtos(
    db: Session,
    pag: Paginacao,
    q: str | None,
    tipo: str | None,
    categoria_id: int | None,
    ativo: bool | None,
    vendavel: bool | None,
    abaixo_minimo: bool | None,
) -> tuple[list[ProdutoOut], int]:
    saldo_col = func.coalesce(EstoqueSaldo.quantidade, 0)
    base = (
        select(Produto, EstoqueSaldo.quantidade)
        .outerjoin(EstoqueSaldo, EstoqueSaldo.produto_id == Produto.id)
        .where(Produto.deleted_at.is_(None))
    )
    if q and q.strip():
        termo = f"%{q.strip()}%"
        base = base.where(
            Produto.nome.ilike(termo)
            | Produto.codigo.ilike(termo)
            | (Produto.codigo_barras == q.strip())
        )
    if tipo:
        base = base.where(Produto.tipo == tipo)
    if categoria_id is not None:
        base = base.where(Produto.categoria_id == categoria_id)
    if ativo is not None:
        base = base.where(Produto.ativo.is_(ativo))
    if vendavel is not None:
        base = base.where(Produto.vendavel.is_(vendavel))
    if abaixo_minimo:
        base = base.where(
            Produto.controla_estoque.is_(True),
            Produto.estoque_minimo > 0,
            saldo_col <= Produto.estoque_minimo,
        )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    linhas = db.execute(
        base.order_by(func.lower(Produto.nome), Produto.id)
        .limit(pag.limite)
        .offset(pag.deslocamento)
    ).all()
    return [montar_saida(db, p, saldo) for p, saldo in linhas], total


def _validar_codigos(
    db: Session, codigo: str | None, barras: str | None, exceto_id: int | None = None
) -> None:
    for coluna, valor, codigo_erro, msg in (
        (Produto.codigo, codigo, "codigo_em_uso", "Já existe um produto com este código."),
        (
            Produto.codigo_barras,
            barras,
            "codigo_barras_em_uso",
            "Já existe um produto com este código de barras.",
        ),
    ):
        if valor:
            q = select(Produto.id).where(coluna == valor, Produto.deleted_at.is_(None))
            if exceto_id is not None:
                q = q.where(Produto.id != exceto_id)
            if db.scalar(q) is not None:
                raise conflito(codigo_erro, msg)


def _validar_refs(db: Session, categoria_id: int | None, unidade_id: int | None) -> None:
    if categoria_id is not None:
        _categoria(db, categoria_id)
    if unidade_id is not None:
        _unidade(db, unidade_id)


def criar_produto(db: Session, dados: ProdutoIn) -> ProdutoOut:
    _validar_refs(db, dados.categoria_id, dados.unidade_id)
    codigo = (dados.codigo or "").strip() or None
    barras = (dados.codigo_barras or "").strip() or None
    _validar_codigos(db, codigo, barras)
    unidade = _unidade(db, dados.unidade_id)
    validar_casas(dados.estoque_minimo, unidade)

    controla = (
        dados.controla_estoque if dados.controla_estoque is not None else dados.tipo != "preparado"
    )
    vendavel = (
        dados.vendavel if dados.vendavel is not None else dados.tipo in ("revenda", "preparado")
    )
    p = Produto(
        nome=dados.nome.strip(),
        tipo=dados.tipo,
        categoria_id=dados.categoria_id,
        unidade_id=dados.unidade_id,
        codigo=codigo,
        codigo_barras=barras,
        preco_venda=dados.preco_venda,
        custo_medio=dados.custo_inicial,
        estoque_minimo=dados.estoque_minimo,
        controla_estoque=controla,
        vendavel=vendavel,
        ativo=dados.ativo,
    )
    db.add(p)
    db.flush()
    if controla:
        db.add(EstoqueSaldo(produto_id=p.id, quantidade=Decimal(0)))
    db.flush()
    registrar(
        db,
        Acao.CREATE,
        "catalogo",
        "produto",
        p.id,
        f"Produto {p.nome} cadastrado.",
        depois=_estado(p),
    )
    db.commit()
    return montar_saida(db, p, Decimal(0) if controla else None)


def editar_produto(db: Session, produto_id: int, dados: ProdutoEditarIn) -> ProdutoOut:
    p = _produto(db, produto_id)
    antes = _estado(p)
    enviados = dados.model_fields_set

    if "categoria_id" in enviados or "unidade_id" in enviados:
        _validar_refs(
            db, dados.categoria_id if "categoria_id" in enviados else None, dados.unidade_id
        )
    if "codigo" in enviados or "codigo_barras" in enviados:
        novo_codigo = (dados.codigo or "").strip() or None if "codigo" in enviados else p.codigo
        novo_barras = (
            (dados.codigo_barras or "").strip() or None
            if "codigo_barras" in enviados
            else p.codigo_barras
        )
        _validar_codigos(db, novo_codigo, novo_barras, exceto_id=p.id)
        p.codigo, p.codigo_barras = novo_codigo, novo_barras

    if dados.nome is not None:
        p.nome = dados.nome.strip()
    if "categoria_id" in enviados:
        p.categoria_id = dados.categoria_id
    if dados.unidade_id is not None and dados.unidade_id != p.unidade_id:
        saldo = _saldo(db, p.id)
        if saldo not in (None, Decimal(0)) or p.composicao:
            raise conflito(
                "unidade_em_uso",
                "Não é possível trocar a unidade de produto com saldo ou ficha técnica.",
            )
        p.unidade_id = dados.unidade_id
    if dados.tipo is not None and dados.tipo != p.tipo:
        if p.composicao and dados.tipo != "preparado":
            raise conflito(
                "tipo_invalido", "Produto com ficha técnica precisa continuar 'preparado'."
            )
        if dados.tipo == "preparado" and _usado_como_insumo(db, p.id):
            raise conflito(
                "tipo_invalido",
                "Este produto é insumo de outra ficha técnica e não pode virar 'preparado'.",
            )
        p.tipo = dados.tipo
    if dados.preco_venda is not None:
        p.preco_venda = dados.preco_venda
    if dados.estoque_minimo is not None:
        p.estoque_minimo = dados.estoque_minimo
    if dados.vendavel is not None:
        p.vendavel = dados.vendavel
    if dados.ativo is not None:
        p.ativo = dados.ativo
    if dados.controla_estoque is not None and dados.controla_estoque != p.controla_estoque:
        saldo = _saldo(db, p.id)
        if not dados.controla_estoque and _usado_como_insumo(db, p.id):
            raise conflito(
                "produto_em_uso",
                "Este produto é insumo na ficha técnica de outro produto: o controle de estoque é necessário.",
            )
        if not dados.controla_estoque and saldo not in (None, Decimal(0)):
            raise conflito(
                "produto_com_saldo",
                "Zere o saldo (ajuste ou inventário) antes de deixar de controlar o estoque.",
            )
        p.controla_estoque = dados.controla_estoque
        if dados.controla_estoque and saldo is None:
            db.add(EstoqueSaldo(produto_id=p.id, quantidade=Decimal(0)))
    validar_casas(p.estoque_minimo, p.unidade)
    db.flush()
    db.refresh(p)
    registrar(
        db,
        Acao.UPDATE,
        "catalogo",
        "produto",
        p.id,
        f"Produto {p.nome} atualizado.",
        antes=antes,
        depois=_estado(p),
    )
    db.commit()
    return montar_saida(db, p)


def _usado_como_insumo(db: Session, produto_id: int) -> bool:
    return (
        db.scalar(
            select(func.count())
            .select_from(ProdutoComposicao)
            .join(Produto, Produto.id == ProdutoComposicao.produto_id)
            .where(ProdutoComposicao.insumo_id == produto_id, Produto.deleted_at.is_(None))
        )
        or 0
    ) > 0


def excluir_produto(db: Session, auth: AuthContext, produto_id: int) -> None:
    p = _produto(db, produto_id)
    if _usado_como_insumo(db, p.id):
        raise conflito("produto_em_uso", "Este produto é insumo na ficha técnica de outro produto.")
    saldo = _saldo(db, p.id)
    if saldo not in (None, Decimal(0)):
        raise conflito(
            "produto_com_saldo", "Zere o saldo (ajuste ou inventário) antes de excluir o produto."
        )
    antes = _estado(p)
    p.deleted_at, p.deleted_by = datetime.now(UTC), auth.usuario.id
    registrar(
        db, Acao.DELETE, "catalogo", "produto", p.id, f"Produto {p.nome} excluído.", antes=antes
    )
    db.commit()


def definir_composicao(db: Session, produto_id: int, dados: ComposicaoIn) -> ProdutoOut:
    p = _produto(db, produto_id)
    if p.tipo != "preparado":
        raise AppError(
            422, "composicao_invalida", "Só produtos do tipo 'preparado' têm ficha técnica."
        )
    ids = [i.insumo_id for i in dados.itens]
    if len(set(ids)) != len(ids):
        raise AppError(422, "composicao_invalida", "Insumo repetido na ficha técnica.")
    insumos = {
        i.id: i
        for i in db.scalars(
            select(Produto).where(Produto.id.in_(ids), Produto.deleted_at.is_(None))
        )
    }
    if len(insumos) != len(ids):
        raise AppError(422, "insumo_invalido", "Um ou mais insumos não existem.")
    for item in dados.itens:
        ins = insumos[item.insumo_id]
        if ins.id == p.id:
            raise AppError(
                422, "composicao_invalida", "Um produto não pode ser insumo de si mesmo."
            )
        if ins.tipo not in TIPOS_INSUMO or not ins.controla_estoque:
            raise AppError(
                422,
                "insumo_invalido",
                f"{ins.nome} não pode ser insumo: use produto com controle de estoque (insumo, embalagem ou revenda).",
            )
        if ins.composicao:
            raise AppError(
                422,
                "insumo_invalido",
                f"{ins.nome} tem ficha técnica própria: só um nível é suportado.",
            )
        validar_casas(item.quantidade, ins.unidade)

    antes = _estado(p)
    # Atualiza no lugar o que já existe (a unicidade produto+insumo impede apagar e reinserir no
    # mesmo flush), acrescenta o novo e remove o que saiu da ficha.
    existentes = {c.insumo_id: c for c in p.composicao}
    for item in dados.itens:
        if item.insumo_id in existentes:
            existentes[item.insumo_id].quantidade = item.quantidade
        else:
            p.composicao.append(
                ProdutoComposicao(insumo_id=item.insumo_id, quantidade=item.quantidade)
            )
    for insumo_id, linha in existentes.items():
        if insumo_id not in ids:
            p.composicao.remove(linha)
    db.flush()
    db.refresh(p)
    registrar(
        db,
        Acao.UPDATE,
        "catalogo",
        "produto",
        p.id,
        f"Ficha técnica de {p.nome} atualizada.",
        antes=antes,
        depois=_estado(p),
    )
    db.commit()
    return montar_saida(db, p)
