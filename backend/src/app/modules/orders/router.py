from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.orders import service
from app.modules.orders.schemas import (
    AjusteIn,
    ComandaAbrirIn,
    ComandaEditarIn,
    ComandaOut,
    ComandaResumoOut,
    DivisaoOut,
    ItemEditarIn,
    ItemIn,
    MotivoIn,
    TipoComanda,
    TransferirIn,
)

router = APIRouter(prefix="/comandas", tags=["comandas"])

StatusFiltro = Literal["aberta", "aguardando_pagamento", "fechada", "cancelada"]


@router.get("", response_model=Page[ComandaResumoOut])
def listar(
    status: StatusFiltro | None = None,
    tipo: TipoComanda | None = None,
    mesa_id: int | None = None,
    cliente_id: int | None = None,
    de: datetime | None = None,
    ate: datetime | None = None,
    q: str | None = Query(default=None, max_length=100),
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.listar")),
) -> Page[ComandaResumoOut]:
    itens, total = service.listar(db, pag, status, tipo, mesa_id, cliente_id, de, ate, q)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("", response_model=ComandaOut, status_code=201)
def abrir(
    dados: ComandaAbrirIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.abrir")),
) -> ComandaOut:
    return service.abrir(db, dados)


@router.get("/{comanda_id}", response_model=ComandaOut)
def obter(
    comanda_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.listar")),
) -> ComandaOut:
    return service.obter_saida(db, comanda_id)


@router.patch("/{comanda_id}", response_model=ComandaOut)
def editar(
    comanda_id: int,
    dados: ComandaEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.lancar")),
) -> ComandaOut:
    return service.editar(db, comanda_id, dados)


@router.post("/{comanda_id}/itens", response_model=ComandaOut, status_code=201)
def lancar_item(
    comanda_id: int,
    dados: ItemIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.lancar")),
) -> ComandaOut:
    return service.lancar_item(db, comanda_id, dados)


@router.patch("/{comanda_id}/itens/{item_id}", response_model=ComandaOut)
def editar_item(
    comanda_id: int,
    item_id: int,
    dados: ItemEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.lancar")),
) -> ComandaOut:
    return service.editar_item(db, comanda_id, item_id, dados)


@router.post("/{comanda_id}/itens/{item_id}/cancelar", response_model=ComandaOut)
def cancelar_item(
    comanda_id: int,
    item_id: int,
    dados: MotivoIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("comandas.cancelar_item_proprio")),
) -> ComandaOut:
    return service.cancelar_item(db, auth, comanda_id, item_id, dados.motivo)


@router.post("/{comanda_id}/transferir", response_model=ComandaOut)
def transferir(
    comanda_id: int,
    dados: TransferirIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.transferir")),
) -> ComandaOut:
    return service.transferir(db, comanda_id, dados.mesa_id)


@router.post("/{comanda_id}/ajustes", response_model=ComandaOut, status_code=201)
def aplicar_ajuste(
    comanda_id: int,
    dados: AjusteIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("comandas.desconto")),
) -> ComandaOut:
    return service.aplicar_ajuste(db, auth, comanda_id, dados)


@router.delete("/{comanda_id}/ajustes/{ajuste_id}", response_model=ComandaOut)
def remover_ajuste(
    comanda_id: int,
    ajuste_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("comandas.desconto")),
) -> ComandaOut:
    return service.remover_ajuste(db, auth, comanda_id, ajuste_id)


@router.post("/{comanda_id}/pedir-conta", response_model=ComandaOut)
def pedir_conta(
    comanda_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.lancar")),
) -> ComandaOut:
    return service.pedir_conta(db, comanda_id)


@router.post("/{comanda_id}/reabrir", response_model=ComandaOut)
def reabrir(
    comanda_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.lancar")),
) -> ComandaOut:
    return service.reabrir(db, comanda_id)


@router.post("/{comanda_id}/cancelar", response_model=ComandaOut)
def cancelar(
    comanda_id: int,
    dados: MotivoIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.cancelar")),
) -> ComandaOut:
    return service.cancelar(db, comanda_id, dados.motivo)


@router.get("/{comanda_id}/divisao", response_model=DivisaoOut)
def dividir(
    comanda_id: int,
    pessoas: int = Query(ge=1, le=100),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("comandas.listar")),
) -> DivisaoOut:
    return service.dividir(db, comanda_id, pessoas)
