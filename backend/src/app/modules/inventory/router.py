from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.catalog.schemas import TipoProduto
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    AjusteIn,
    ContagemIn,
    EntradaIn,
    InventarioCriarIn,
    InventarioFechadoOut,
    InventarioOut,
    InventarioResumoOut,
    MovimentoOut,
    SaldoOut,
)

router = APIRouter(tags=["estoque"])

TipoMovimento = Literal[
    "entrada", "saida", "perda", "ajuste", "inventario", "venda", "estorno_venda"
]


@router.get("/estoque/saldos", response_model=Page[SaldoOut])
def listar_saldos(
    q: str | None = Query(default=None, max_length=100),
    tipo: TipoProduto | None = None,
    categoria_id: int | None = None,
    abaixo_minimo: bool | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("estoque.listar")),
) -> Page[SaldoOut]:
    itens, total = service.listar_saldos(db, pag, q, tipo, categoria_id, abaixo_minimo)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.get("/estoque/movimentos", response_model=Page[MovimentoOut])
def listar_movimentos(
    produto_id: int | None = None,
    tipo: TipoMovimento | None = None,
    origem_tipo: str | None = Query(default=None, max_length=30),
    de: datetime | None = None,
    ate: datetime | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("estoque.listar")),
) -> Page[MovimentoOut]:
    itens, total = service.listar_movimentos(db, pag, produto_id, tipo, origem_tipo, de, ate)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("/estoque/entradas", response_model=MovimentoOut, status_code=201)
def registrar_entrada(
    dados: EntradaIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("estoque.entrada")),
) -> MovimentoOut:
    return service.montar_movimento(db, service.registrar_entrada(db, dados))


@router.post("/estoque/ajustes", response_model=MovimentoOut, status_code=201)
def registrar_ajuste(
    dados: AjusteIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("estoque.ajustar")),
) -> MovimentoOut:
    return service.montar_movimento(db, service.registrar_ajuste(db, auth, dados))


@router.get("/inventarios", response_model=Page[InventarioResumoOut])
def listar_inventarios(
    status: Literal["aberto", "fechado", "cancelado"] | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("inventarios.listar")),
) -> Page[InventarioResumoOut]:
    itens, total = service.listar_inventarios(db, pag, status)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("/inventarios", response_model=InventarioOut, status_code=201)
def criar_inventario(
    dados: InventarioCriarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("inventarios.criar")),
) -> InventarioOut:
    return service.criar_inventario(db, dados)


@router.get("/inventarios/{inventario_id}", response_model=InventarioOut)
def obter_inventario(
    inventario_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("inventarios.listar")),
) -> InventarioOut:
    return service.obter_inventario(db, inventario_id)


@router.put("/inventarios/{inventario_id}/itens/{produto_id}", response_model=InventarioOut)
def contar_item(
    inventario_id: int,
    produto_id: int,
    dados: ContagemIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("inventarios.contar")),
) -> InventarioOut:
    return service.contar_item(db, inventario_id, produto_id, dados.quantidade_contada)


@router.post("/inventarios/{inventario_id}/fechar", response_model=InventarioFechadoOut)
def fechar_inventario(
    inventario_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("inventarios.fechar")),
) -> InventarioFechadoOut:
    return service.fechar_inventario(db, auth, inventario_id)


@router.post("/inventarios/{inventario_id}/cancelar", response_model=InventarioOut)
def cancelar_inventario(
    inventario_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("inventarios.criar")),
) -> InventarioOut:
    return service.cancelar_inventario(db, inventario_id)
