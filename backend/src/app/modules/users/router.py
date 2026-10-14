from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthContext, exigir_permissao
from app.core.pagination import Page, Paginacao
from app.modules.users import service
from app.modules.users.schemas import (
    RedefinirSenhaIn,
    UsuarioCriarIn,
    UsuarioEditarIn,
    UsuarioOut,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("", response_model=Page[UsuarioOut])
def listar(
    q: str | None = Query(default=None, max_length=100),
    suspenso: bool | None = None,
    papel_id: int | None = None,
    pag: Paginacao = Depends(),
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("usuarios.listar")),
) -> Page[UsuarioOut]:
    itens, total = service.listar(db, pag, q, suspenso, papel_id)
    return Page(
        itens=[UsuarioOut.model_validate(u) for u in itens],
        total=total,
        limite=pag.limite,
        deslocamento=pag.deslocamento,
    )


@router.get("/{usuario_id}", response_model=UsuarioOut)
def obter(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: AuthContext = Depends(exigir_permissao("usuarios.listar")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(service.obter(db, usuario_id))


@router.post("", response_model=UsuarioOut, status_code=201)
def criar(
    dados: UsuarioCriarIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.criar")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(service.criar(db, auth, dados))


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def editar(
    usuario_id: int,
    dados: UsuarioEditarIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.editar")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(service.editar(db, auth, usuario_id, dados))


@router.post("/{usuario_id}/suspender", response_model=UsuarioOut)
def suspender(
    usuario_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.suspender")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(service.definir_suspensao(db, auth, usuario_id, True))


@router.post("/{usuario_id}/reativar", response_model=UsuarioOut)
def reativar(
    usuario_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.suspender")),
) -> UsuarioOut:
    return UsuarioOut.model_validate(service.definir_suspensao(db, auth, usuario_id, False))


@router.post("/{usuario_id}/redefinir-senha", status_code=204)
def redefinir_senha(
    usuario_id: int,
    dados: RedefinirSenhaIn,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.redefinir_senha")),
) -> Response:
    service.redefinir_senha(db, auth, usuario_id, dados.senha_temporaria)
    return Response(status_code=204)


@router.delete("/{usuario_id}", status_code=204)
def excluir(
    usuario_id: int,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(exigir_permissao("usuarios.excluir")),
) -> Response:
    service.excluir(db, auth, usuario_id)
    return Response(status_code=204)
