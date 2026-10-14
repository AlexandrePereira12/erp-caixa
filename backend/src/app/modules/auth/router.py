from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import (
    AuthContext,
    autenticado_permitindo_troca_senha,
)
from app.modules.auth import service
from app.modules.auth.schemas import LoginIn, MeOut, TokenOut, TrocaSenhaIn

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "pdv_refresh"
COOKIE_PATH = "/api/v1/auth"


def _definir_cookie(resp: Response, token: str) -> None:
    s = get_settings()
    resp.set_cookie(
        COOKIE,
        token,
        max_age=s.refresh_token_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )


def _limpar_cookie(resp: Response) -> None:
    resp.delete_cookie(
        COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="strict",
    )


@router.post("/login", response_model=TokenOut)
def login(dados: LoginIn, resp: Response, db: Session = Depends(get_db)) -> TokenOut:
    access, expira, refresh, trocar = service.login(db, dados.email, dados.senha)
    _definir_cookie(resp, refresh)
    return TokenOut(access_token=access, expires_in=expira, must_change_password=trocar)


@router.post("/refresh", response_model=TokenOut)
def refresh(
    resp: Response,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=COOKIE),
) -> TokenOut:
    access, expira, novo, trocar = service.renovar(db, token)
    _definir_cookie(resp, novo)
    return TokenOut(access_token=access, expires_in=expira, must_change_password=trocar)


@router.post("/logout", status_code=204)
def logout(
    resp: Response,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=COOKIE),
) -> Response:
    service.sair(db, token)
    _limpar_cookie(resp)
    resp.status_code = 204
    return resp


@router.get("/me", response_model=MeOut)
def me(auth: AuthContext = Depends(autenticado_permitindo_troca_senha)) -> MeOut:
    u = auth.usuario
    return MeOut(
        id=u.id,
        nome=u.nome,
        email=u.email,
        papeis=auth.papeis,
        permissoes=sorted(auth.permissoes),
        must_change_password=u.must_change_password,
    )


@router.post("/change-password", response_model=TokenOut)
def change_password(
    dados: TrocaSenhaIn,
    resp: Response,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(autenticado_permitindo_troca_senha),
) -> TokenOut:
    access, expira, novo = service.trocar_senha(db, auth, dados.senha_atual, dados.nova_senha)
    _definir_cookie(resp, novo)
    return TokenOut(access_token=access, expires_in=expira, must_change_password=False)
