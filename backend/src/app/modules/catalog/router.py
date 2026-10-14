from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.catalog import service
from app.modules.catalog.schemas import (
    CategoriaEditarIn,
    CategoriaIn,
    CategoriaOut,
    ComposicaoIn,
    ProdutoEditarIn,
    ProdutoIn,
    ProdutoOut,
    TipoProduto,
    UnidadeEditarIn,
    UnidadeIn,
    UnidadeOut,
)

router = APIRouter(tags=["catalogo"])


# --- unidades ---
@router.get("/unidades", response_model=list[UnidadeOut])
def listar_unidades(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.listar")),
) -> list[UnidadeOut]:
    return [UnidadeOut.model_validate(u) for u in service.listar_unidades(db)]


@router.post("/unidades", response_model=UnidadeOut, status_code=201)
def criar_unidade(
    dados: UnidadeIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.criar")),
) -> UnidadeOut:
    return UnidadeOut.model_validate(service.criar_unidade(db, dados))


@router.patch("/unidades/{unidade_id}", response_model=UnidadeOut)
def editar_unidade(
    unidade_id: int,
    dados: UnidadeEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.editar")),
) -> UnidadeOut:
    return UnidadeOut.model_validate(service.editar_unidade(db, unidade_id, dados))


@router.delete("/unidades/{unidade_id}", status_code=204)
def excluir_unidade(
    unidade_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("catalogo.excluir")),
) -> Response:
    service.excluir_unidade(db, auth, unidade_id)
    return Response(status_code=204)


# --- categorias ---
@router.get("/categorias", response_model=list[CategoriaOut])
def listar_categorias(
    ativo: bool | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.listar")),
) -> list[CategoriaOut]:
    return [CategoriaOut.model_validate(c) for c in service.listar_categorias(db, ativo)]


@router.post("/categorias", response_model=CategoriaOut, status_code=201)
def criar_categoria(
    dados: CategoriaIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.criar")),
) -> CategoriaOut:
    return CategoriaOut.model_validate(service.criar_categoria(db, dados))


@router.patch("/categorias/{categoria_id}", response_model=CategoriaOut)
def editar_categoria(
    categoria_id: int,
    dados: CategoriaEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.editar")),
) -> CategoriaOut:
    return CategoriaOut.model_validate(service.editar_categoria(db, categoria_id, dados))


@router.delete("/categorias/{categoria_id}", status_code=204)
def excluir_categoria(
    categoria_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("catalogo.excluir")),
) -> Response:
    service.excluir_categoria(db, auth, categoria_id)
    return Response(status_code=204)


# --- produtos ---
@router.get("/produtos", response_model=Page[ProdutoOut])
def listar_produtos(
    q: str | None = Query(default=None, max_length=100),
    tipo: TipoProduto | None = None,
    categoria_id: int | None = None,
    ativo: bool | None = None,
    vendavel: bool | None = None,
    abaixo_minimo: bool | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.listar")),
) -> Page[ProdutoOut]:
    itens, total = service.listar_produtos(
        db, pag, q, tipo, categoria_id, ativo, vendavel, abaixo_minimo
    )
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("/produtos", response_model=ProdutoOut, status_code=201)
def criar_produto(
    dados: ProdutoIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.criar")),
) -> ProdutoOut:
    return service.criar_produto(db, dados)


@router.get("/produtos/{produto_id}", response_model=ProdutoOut)
def obter_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.listar")),
) -> ProdutoOut:
    return service.obter_saida(db, produto_id)


@router.patch("/produtos/{produto_id}", response_model=ProdutoOut)
def editar_produto(
    produto_id: int,
    dados: ProdutoEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.editar")),
) -> ProdutoOut:
    return service.editar_produto(db, produto_id, dados)


@router.delete("/produtos/{produto_id}", status_code=204)
def excluir_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("catalogo.excluir")),
) -> Response:
    service.excluir_produto(db, auth, produto_id)
    return Response(status_code=204)


@router.put("/produtos/{produto_id}/composicao", response_model=ProdutoOut)
def definir_composicao(
    produto_id: int,
    dados: ComposicaoIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("catalogo.editar")),
) -> ProdutoOut:
    return service.definir_composicao(db, produto_id, dados)
