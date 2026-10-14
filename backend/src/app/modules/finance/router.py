from typing import Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.finance import service
from app.modules.finance.schemas import (
    BaixaIn,
    CategoriaFinanceiraEditarIn,
    CategoriaFinanceiraIn,
    CategoriaFinanceiraOut,
    HistoricoOut,
    SaldoAbertoOut,
    TituloOut,
)

router = APIRouter(tags=["financeiro"])


@router.get("/contas-receber", response_model=Page[TituloOut])
def listar(
    status: Literal["aberto", "pago", "cancelado"] | None = None,
    pessoa_id: int | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.listar")),
) -> Page[TituloOut]:
    itens, total = service.listar(db, pag, status, pessoa_id)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.get("/contas-receber/{titulo_id}", response_model=TituloOut)
def obter(
    titulo_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.listar")),
) -> TituloOut:
    return service.obter_saida(db, titulo_id)


@router.post("/contas-receber/{titulo_id}/baixas", response_model=TituloOut, status_code=201)
def baixar(
    titulo_id: int,
    dados: BaixaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("financeiro.baixar")),
) -> TituloOut:
    return service.baixar(db, auth, titulo_id, dados)


@router.get("/pessoas/{pessoa_id}/saldo-aberto", response_model=SaldoAbertoOut)
def saldo_aberto(
    pessoa_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.listar")),
) -> SaldoAbertoOut:
    return service.saldo_aberto(db, pessoa_id)


@router.get("/pessoas/{pessoa_id}/historico", response_model=HistoricoOut)
def historico(
    pessoa_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.listar")),
) -> HistoricoOut:
    return service.historico(db, pessoa_id)


@router.get("/categorias-financeiras", response_model=list[CategoriaFinanceiraOut])
def listar_categorias(
    tipo: Literal["receita", "despesa"] | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.listar")),
) -> list[CategoriaFinanceiraOut]:
    return [CategoriaFinanceiraOut.model_validate(c) for c in service.listar_categorias(db, tipo)]


@router.post("/categorias-financeiras", response_model=CategoriaFinanceiraOut, status_code=201)
def criar_categoria(
    dados: CategoriaFinanceiraIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.categorias")),
) -> CategoriaFinanceiraOut:
    return CategoriaFinanceiraOut.model_validate(service.criar_categoria(db, dados))


@router.patch("/categorias-financeiras/{categoria_id}", response_model=CategoriaFinanceiraOut)
def editar_categoria(
    categoria_id: int,
    dados: CategoriaFinanceiraEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("financeiro.categorias")),
) -> CategoriaFinanceiraOut:
    return CategoriaFinanceiraOut.model_validate(service.editar_categoria(db, categoria_id, dados))


@router.delete("/categorias-financeiras/{categoria_id}", status_code=204)
def excluir_categoria(
    categoria_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("financeiro.categorias")),
) -> Response:
    service.excluir_categoria(db, auth, categoria_id)
    return Response(status_code=204)
