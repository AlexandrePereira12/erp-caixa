from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar
from app.core.context import get_context
from app.core.db import get_db
from app.core.errors import AppError, proibido
from app.core.security import decodificar_access_token
from app.modules.users.models import Usuario

_bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    usuario: Usuario
    permissoes: frozenset[str]
    papeis: list[str]


def _nao_autenticado(codigo: str = "nao_autenticado") -> AppError:
    return AppError(401, codigo, "Autenticação necessária.", headers={"WWW-Authenticate": "Bearer"})


def _carregar(db: Session, cred: HTTPAuthorizationCredentials | None) -> AuthContext:
    if cred is None:
        raise _nao_autenticado()
    decodificado = decodificar_access_token(cred.credentials)
    if decodificado is None:
        raise _nao_autenticado("token_invalido")
    usuario_id, emitido_em = decodificado
    usuario = db.get(Usuario, usuario_id)
    if usuario is None or usuario.deleted_at is not None:
        raise _nao_autenticado("token_invalido")
    # Logout, troca/redefinição de senha, suspensão e exclusão invalidam os tokens já emitidos.
    if (
        usuario.tokens_invalidos_ate is not None
        and emitido_em < usuario.tokens_invalidos_ate.timestamp()
    ):
        raise _nao_autenticado("token_invalido")
    if usuario.suspenso:
        raise proibido("conta_suspensa", "Acesso suspenso. Procure um administrador.")

    papeis = [p for p in usuario.papeis if p.deleted_at is None]
    permissoes = frozenset(perm.codigo for p in papeis for perm in p.permissoes)
    ctx = get_context()
    ctx.usuario_id, ctx.usuario_nome = usuario.id, usuario.nome
    ctx.papel = ", ".join(p.nome for p in papeis) or None
    return AuthContext(usuario, permissoes, [p.nome for p in papeis])


def autenticado_permitindo_troca_senha(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    return _carregar(db, cred)


autenticado_permitindo_troca_senha.__autenticado__ = True  # type: ignore[attr-defined]


def autenticado(
    auth: AuthContext = Depends(autenticado_permitindo_troca_senha),
) -> AuthContext:
    if auth.usuario.must_change_password:
        raise proibido("senha_expirada", "Troque a senha antes de continuar.")
    return auth


autenticado.__autenticado__ = True  # type: ignore[attr-defined]


def exigir_permissao(codigo: str) -> Callable[..., AuthContext]:
    """Dependência de rota: 401 sem login, 403 sem a permissão `modulo.acao`."""

    def dependencia(
        auth: AuthContext = Depends(autenticado), db: Session = Depends(get_db)
    ) -> AuthContext:
        if codigo not in auth.permissoes:
            # Na própria sessão da requisição (mesma conexão): nada a desfazer neste ponto, e uma
            # segunda conexão aqui esgotaria o pool sob uma enxurrada de acessos negados.
            registrar(
                db,
                Acao.ACESSO_NEGADO,
                "auth",
                "permissao",
                codigo,
                f"Acesso negado: faltou a permissão {codigo}.",
            )
            db.commit()
            raise proibido("sem_permissao", "Você não tem permissão para esta ação.")
        return auth

    dependencia.__permissao__ = codigo  # type: ignore[attr-defined]
    return dependencia
