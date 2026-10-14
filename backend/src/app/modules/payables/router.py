from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.payables import service
from app.modules.payables.schemas import (
    BaixaPagarIn,
    CancelarTituloPagarIn,
    EstornarBaixaPagarIn,
    FiltroSituacao,
    ResumoPagarOut,
    TituloPagarDetalheOut,
    TituloPagarEditarIn,
    TituloPagarIn,
    TituloPagarOut,
)

router = APIRouter(tags=["contas-pagar"])


@router.get("/contas-pagar", response_model=Page[TituloPagarOut])
def listar(
    situacao: FiltroSituacao = "todos",
    pessoa_id: int | None = None,
    categoria_id: int | None = None,
    vencimento_de: date | None = None,
    vencimento_ate: date | None = None,
    q: str | None = Query(default=None, max_length=100),
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.listar")),
) -> Page[TituloPagarOut]:
    itens, total = service.listar(
        db, pag, situacao, pessoa_id, categoria_id, vencimento_de, vencimento_ate, q
    )
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


# Declarada antes de /contas-pagar/{titulo_id}: "resumo" não pode cair no parâmetro inteiro.
@router.get("/contas-pagar/resumo", response_model=ResumoPagarOut)
def resumo(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.listar")),
) -> ResumoPagarOut:
    return service.resumo(db)


@router.post("/contas-pagar", response_model=TituloPagarDetalheOut, status_code=201)
def criar(
    dados: TituloPagarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.criar")),
) -> TituloPagarDetalheOut:
    return service.criar(db, dados)


@router.get("/contas-pagar/{titulo_id}", response_model=TituloPagarDetalheOut)
def obter(
    titulo_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.listar")),
) -> TituloPagarDetalheOut:
    return service.obter(db, titulo_id)


@router.patch("/contas-pagar/{titulo_id}", response_model=TituloPagarDetalheOut)
def editar(
    titulo_id: int,
    dados: TituloPagarEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.editar")),
) -> TituloPagarDetalheOut:
    return service.editar(db, titulo_id, dados)


@router.post("/contas-pagar/{titulo_id}/cancelar", response_model=TituloPagarDetalheOut)
def cancelar(
    titulo_id: int,
    dados: CancelarTituloPagarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.cancelar")),
) -> TituloPagarDetalheOut:
    return service.cancelar(db, titulo_id, dados)


@router.post(
    "/contas-pagar/{titulo_id}/baixas", response_model=TituloPagarDetalheOut, status_code=201
)
def baixar(
    titulo_id: int,
    dados: BaixaPagarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.baixar")),
) -> TituloPagarDetalheOut:
    return service.baixar(db, titulo_id, dados)


# Desfazer um pagamento é mais sensível que lançá-lo: exige a permissão de cancelar.
@router.post(
    "/contas-pagar/{titulo_id}/baixas/{baixa_id}/estornar", response_model=TituloPagarDetalheOut
)
def estornar_baixa(
    titulo_id: int,
    baixa_id: int,
    dados: EstornarBaixaPagarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("contas_pagar.cancelar")),
) -> TituloPagarDetalheOut:
    return service.estornar_baixa(db, titulo_id, baixa_id, dados)
