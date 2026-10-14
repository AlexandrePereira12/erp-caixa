from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.sales import service
from app.modules.sales.schemas import (
    EstornoIn,
    FecharComandaIn,
    StatusVenda,
    VendaOut,
    VendaResumoOut,
)

router = APIRouter(tags=["vendas"])


@router.post("/comandas/{comanda_id}/fechar", response_model=VendaOut, status_code=201)
def fechar_comanda(
    comanda_id: int,
    dados: FecharComandaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("comandas.fechar")),
) -> VendaOut:
    return service.fechar_comanda(db, auth, comanda_id, dados)


@router.get("/vendas", response_model=Page[VendaResumoOut])
def listar(
    de: datetime | None = None,
    ate: datetime | None = None,
    caixa_id: int | None = None,
    cliente_id: int | None = None,
    status: StatusVenda = "todas",
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("vendas.listar")),
) -> Page[VendaResumoOut]:
    itens, total = service.listar(db, pag, de, ate, caixa_id, cliente_id, status)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.get("/vendas/{venda_id}", response_model=VendaOut)
def obter(
    venda_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("vendas.listar")),
) -> VendaOut:
    return service.obter_saida(db, venda_id)


@router.post("/vendas/{venda_id}/estornar", response_model=VendaOut)
def estornar(
    venda_id: int,
    dados: EstornoIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("vendas.estornar")),
) -> VendaOut:
    return service.estornar(db, auth, venda_id, dados.motivo)
