from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.cash import service
from app.modules.cash.schemas import (
    CaixaAbrirIn,
    CaixaOut,
    CaixaResumoOut,
    FechamentoIn,
    FormaPagamentoEditarIn,
    FormaPagamentoIn,
    FormaPagamentoOut,
    MovimentoCaixaIn,
    MovimentoCaixaOut,
    ReaberturaIn,
)

router = APIRouter(tags=["caixa"])


# --- formas de pagamento ---
@router.get("/formas-pagamento", response_model=list[FormaPagamentoOut])
def listar_formas(
    ativa: bool | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("formas_pagamento.listar")),
) -> list[FormaPagamentoOut]:
    return [FormaPagamentoOut.model_validate(f) for f in service.listar_formas(db, ativa)]


@router.post("/formas-pagamento", response_model=FormaPagamentoOut, status_code=201)
def criar_forma(
    dados: FormaPagamentoIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("formas_pagamento.gerenciar")),
) -> FormaPagamentoOut:
    return FormaPagamentoOut.model_validate(service.criar_forma(db, dados))


@router.patch("/formas-pagamento/{forma_id}", response_model=FormaPagamentoOut)
def editar_forma(
    forma_id: int,
    dados: FormaPagamentoEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("formas_pagamento.gerenciar")),
) -> FormaPagamentoOut:
    return FormaPagamentoOut.model_validate(service.editar_forma(db, forma_id, dados))


@router.delete("/formas-pagamento/{forma_id}", status_code=204)
def excluir_forma(
    forma_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("formas_pagamento.gerenciar")),
) -> Response:
    service.excluir_forma(db, auth, forma_id)
    return Response(status_code=204)


# --- caixa ---
@router.get("/caixas", response_model=Page[CaixaResumoOut])
def listar_caixas(
    operador_id: int | None = None,
    status: Literal["aberto", "fechado"] | None = None,
    de: datetime | None = None,
    ate: datetime | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("caixa.listar")),
) -> Page[CaixaResumoOut]:
    itens, total = service.listar(db, pag, operador_id, status, de, ate)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("/caixas/abrir", response_model=CaixaOut, status_code=201)
def abrir(
    dados: CaixaAbrirIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> CaixaOut:
    return service.abrir(db, auth, dados.valor_abertura)


@router.get("/caixas/atual", response_model=CaixaOut)
def atual(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> CaixaOut:
    return service.atual(db, auth)


@router.get("/caixas/{caixa_id}", response_model=CaixaOut)
def obter(
    caixa_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> CaixaOut:
    return service.obter_saida(db, auth, caixa_id)


@router.get("/caixas/{caixa_id}/movimentos", response_model=Page[MovimentoCaixaOut])
def listar_movimentos(
    caixa_id: int,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> Page[MovimentoCaixaOut]:
    itens, total = service.listar_movimentos(db, auth, caixa_id, pag)
    return Page(itens=itens, total=total, limite=pag.limite, deslocamento=pag.deslocamento)


@router.post("/caixas/{caixa_id}/movimentos", response_model=MovimentoCaixaOut, status_code=201)
def registrar_movimento(
    caixa_id: int,
    dados: MovimentoCaixaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> MovimentoCaixaOut:
    return service.registrar_movimento_manual(db, auth, caixa_id, dados)


@router.post("/caixas/{caixa_id}/fechar", response_model=CaixaOut)
def fechar(
    caixa_id: int,
    dados: FechamentoIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.operar")),
) -> CaixaOut:
    return service.fechar(db, auth, caixa_id, dados)


@router.post("/caixas/{caixa_id}/reabrir", response_model=CaixaOut)
def reabrir(
    caixa_id: int,
    dados: ReaberturaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("caixa.reabrir")),
) -> CaixaOut:
    return service.reabrir(db, auth, caixa_id, dados.justificativa)
