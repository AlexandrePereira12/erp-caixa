from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.modules.rbac import papeis as service
from app.modules.rbac.schemas import (
    PapelCriarIn,
    PapelEditarIn,
    PapelOut,
    PapelPermissoesIn,
    PermissaoOut,
)

router = APIRouter(tags=["papeis"])


@router.get("/permissoes", response_model=list[PermissaoOut])
def listar_permissoes(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("permissoes.listar")),
) -> list[PermissaoOut]:
    return [PermissaoOut.model_validate(p) for p in service.listar_permissoes(db)]


@router.get("/papeis", response_model=list[PapelOut])
def listar(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("papeis.listar")),
) -> list[PapelOut]:
    return [PapelOut.model_validate(p) for p in service.listar(db)]


@router.get("/papeis/{papel_id}", response_model=PapelOut)
def obter(
    papel_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("papeis.listar")),
) -> PapelOut:
    return PapelOut.model_validate(service.obter(db, papel_id))


@router.post("/papeis", response_model=PapelOut, status_code=201)
def criar(
    dados: PapelCriarIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("papeis.criar")),
) -> PapelOut:
    return PapelOut.model_validate(service.criar(db, auth, dados))


@router.patch("/papeis/{papel_id}", response_model=PapelOut)
def editar(
    papel_id: int,
    dados: PapelEditarIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("papeis.editar")),
) -> PapelOut:
    return PapelOut.model_validate(service.editar(db, auth, papel_id, dados))


@router.put("/papeis/{papel_id}/permissoes", response_model=PapelOut)
def definir_permissoes(
    papel_id: int,
    dados: PapelPermissoesIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("papeis.editar")),
) -> PapelOut:
    return PapelOut.model_validate(service.definir_permissoes(db, auth, papel_id, dados.permissoes))


@router.delete("/papeis/{papel_id}", status_code=204)
def excluir(
    papel_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("papeis.excluir")),
) -> Response:
    service.excluir(db, papel_id)
    return Response(status_code=204)
