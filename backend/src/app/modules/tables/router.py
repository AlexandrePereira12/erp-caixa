from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.modules.tables import service
from app.modules.tables.schemas import MesaEditarIn, MesaIn, MesaMapaOut, MesaOut

router = APIRouter(prefix="/mesas", tags=["mesas"])


@router.get("", response_model=list[MesaOut])
def listar(
    ativa: bool | None = None,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.listar")),
) -> list[MesaOut]:
    return [MesaOut.model_validate(m) for m in service.listar(db, ativa)]


@router.get("/mapa", response_model=list[MesaMapaOut])
def mapa(
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.listar")),
) -> list[MesaMapaOut]:
    return service.mapa(db)


@router.post("", response_model=MesaOut, status_code=201)
def criar(
    dados: MesaIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> MesaOut:
    return MesaOut.model_validate(service.criar(db, dados))


@router.patch("/{mesa_id}", response_model=MesaOut)
def editar(
    mesa_id: int,
    dados: MesaEditarIn,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> MesaOut:
    return MesaOut.model_validate(service.editar(db, mesa_id, dados))


@router.delete("/{mesa_id}", status_code=204)
def excluir(
    mesa_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> Response:
    service.excluir(db, auth, mesa_id)
    return Response(status_code=204)


@router.post("/{mesa_id}/reservar", response_model=MesaOut)
def reservar(
    mesa_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> MesaOut:
    return MesaOut.model_validate(service.transicionar(db, mesa_id, "reservar"))


@router.post("/{mesa_id}/bloquear", response_model=MesaOut)
def bloquear(
    mesa_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> MesaOut:
    return MesaOut.model_validate(service.transicionar(db, mesa_id, "bloquear"))


@router.post("/{mesa_id}/liberar", response_model=MesaOut)
def liberar(
    mesa_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("mesas.gerenciar")),
) -> MesaOut:
    return MesaOut.model_validate(service.transicionar(db, mesa_id, "liberar"))
