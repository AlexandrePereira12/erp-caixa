import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.audit import Acao, registrar
from app.core.config import get_settings
from app.core.context import get_context
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.security import (
    gerar_access_token,
    gerar_refresh_token,
    hash_refresh,
    hash_senha,
    senha_precisa_rehash,
    validar_politica_senha,
    verificar_senha,
)
from app.modules.auth.models import RefreshToken
from app.modules.users.models import Usuario

MAX_FALHAS_LOGIN = 8
BLOQUEIO_MINUTOS = 15


def _agora() -> datetime:
    return datetime.now(UTC)


def _email_para_auditoria(email: str) -> str:
    """Só guarda o que parece e-mail: quem digita a senha no campo errado não a deixa na trilha."""
    texto = email.strip().lower()
    if len(texto) <= 120 and re.fullmatch(r"[^@\s]+@[^@\s]+", texto):
        return texto
    return "(formato de e-mail inválido)"


def _contar_falha(usuario: Usuario) -> bool:
    """Soma uma falha; devolve True se a conta acabou de ser bloqueada."""
    usuario.falhas_login = (usuario.falhas_login or 0) + 1
    if usuario.falhas_login >= MAX_FALHAS_LOGIN:
        usuario.bloqueado_ate = _agora() + timedelta(minutes=BLOQUEIO_MINUTOS)
        usuario.falhas_login = 0
        return True
    return False


def invalidar_tokens(usuario: Usuario) -> None:
    """Todo access token emitido até agora deixa de valer (os refresh são revogados à parte)."""
    usuario.tokens_invalidos_ate = _agora()


def _definir_usuario_no_contexto(usuario: Usuario) -> str | None:
    papeis = ", ".join(p.nome for p in usuario.papeis if p.deleted_at is None) or None
    ctx = get_context()
    ctx.usuario_id, ctx.usuario_nome, ctx.papel = usuario.id, usuario.nome, papeis
    return papeis


def _emitir_refresh(db: Session, usuario: Usuario, familia: uuid.UUID) -> tuple[str, RefreshToken]:
    token, hash_ = gerar_refresh_token()
    ctx = get_context()
    rt = RefreshToken(
        usuario_id=usuario.id,
        familia_id=familia,
        token_hash=hash_,
        expira_em=_agora() + timedelta(days=get_settings().refresh_token_days),
        ip=ctx.ip,
        user_agent=(ctx.user_agent or None) and ctx.user_agent[:300],
    )
    db.add(rt)
    db.flush()
    return token, rt


def _revogar_familia(db: Session, familia: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.familia_id == familia, RefreshToken.revogado_em.is_(None))
        .values(revogado_em=_agora())
    )


def revogar_todos(db: Session, usuario_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.usuario_id == usuario_id, RefreshToken.revogado_em.is_(None))
        .values(revogado_em=_agora())
    )


def login(db: Session, email: str, senha: str) -> tuple[str, int, str, bool]:
    """Devolve (access_token, expires_in, refresh_token, must_change_password)."""
    email_norm = email.strip().lower()
    usuario = db.scalar(
        select(Usuario).where(func.lower(Usuario.email) == email_norm, Usuario.deleted_at.is_(None))
    )
    if usuario is not None and usuario.bloqueado_ate and usuario.bloqueado_ate > _agora():
        restante = int((usuario.bloqueado_ate - _agora()).total_seconds()) + 1
        registrar(
            db,
            Acao.LOGIN_FALHA,
            "auth",
            "usuario",
            usuario.id,
            "Login recusado: conta bloqueada temporariamente por excesso de falhas.",
            usuario_id=usuario.id,
            usuario_nome=usuario.nome,
        )
        db.commit()
        raise AppError(
            429,
            "conta_bloqueada",
            "Muitas tentativas incorretas. Tente de novo em alguns minutos ou peça a um administrador.",
            headers={"Retry-After": str(restante)},
        )
    senha_ok = verificar_senha(senha, usuario.senha_hash if usuario else None)
    if usuario is None or not senha_ok:
        bloqueou = False
        if usuario is not None:
            bloqueou = _contar_falha(usuario)
        # Na própria sessão e com commit antes do erro: sobrevive ao 401 sem abrir 2ª conexão.
        registrar(
            db,
            Acao.LOGIN_FALHA,
            "auth",
            "usuario",
            usuario.id if usuario else None,
            f"Falha de login para {_email_para_auditoria(email_norm)}."
            + (" Conta bloqueada temporariamente." if bloqueou else ""),
        )
        db.commit()
        raise AppError(401, "credenciais_invalidas", "E-mail ou senha incorretos.")
    if usuario.suspenso:
        registrar(
            db,
            Acao.LOGIN_FALHA,
            "auth",
            "usuario",
            usuario.id,
            "Login bloqueado: conta suspensa.",
            usuario_id=usuario.id,
            usuario_nome=usuario.nome,
        )
        db.commit()
        raise AppError(403, "conta_suspensa", "Acesso suspenso. Procure um administrador.")

    usuario.falhas_login = 0
    usuario.bloqueado_ate = None
    papeis = _definir_usuario_no_contexto(usuario)
    if senha_precisa_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_senha(senha)
    usuario.ultimo_login_em = _agora()
    refresh, _ = _emitir_refresh(db, usuario, uuid.uuid4())
    registrar(db, Acao.LOGIN, "auth", "usuario", usuario.id, "Login realizado.", papel=papeis)
    db.commit()
    access, expira = gerar_access_token(usuario.id)
    return access, expira, refresh, usuario.must_change_password


def renovar(db: Session, refresh_token: str | None) -> tuple[str, int, str, bool]:
    if not refresh_token:
        raise AppError(401, "sessao_invalida", "Sessão inválida. Faça login novamente.")
    rt = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh(refresh_token))
        .with_for_update()
    )
    if rt is None:
        raise AppError(401, "sessao_invalida", "Sessão inválida. Faça login novamente.")
    usuario = db.get(Usuario, rt.usuario_id)
    assert usuario is not None  # FK garante

    if rt.revogado_em is not None:
        # Token já usado/revogado sendo apresentado de novo: tratar como roubo, derrubar a família.
        _revogar_familia(db, rt.familia_id)
        _definir_usuario_no_contexto(usuario)
        registrar(
            db,
            Acao.ACESSO_NEGADO,
            "auth",
            "refresh_token",
            rt.id,
            "Reuso de refresh token detectado: sessão revogada.",
        )
        db.commit()
        raise AppError(401, "sessao_invalida", "Sessão inválida. Faça login novamente.")
    if rt.expira_em <= _agora():
        raise AppError(401, "sessao_expirada", "Sessão expirada. Faça login novamente.")
    if usuario.deleted_at is not None or usuario.suspenso:
        _revogar_familia(db, rt.familia_id)
        db.commit()
        raise AppError(403, "conta_suspensa", "Acesso suspenso. Procure um administrador.")

    _definir_usuario_no_contexto(usuario)
    novo, novo_rt = _emitir_refresh(db, usuario, rt.familia_id)
    rt.revogado_em = _agora()
    rt.substituido_por_id = novo_rt.id
    db.commit()
    access, expira = gerar_access_token(usuario.id)
    return access, expira, novo, usuario.must_change_password


def sair(db: Session, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    rt = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(refresh_token))
    )
    if rt is None:
        return
    usuario = db.get(Usuario, rt.usuario_id)
    assert usuario is not None
    _definir_usuario_no_contexto(usuario)
    _revogar_familia(db, rt.familia_id)
    invalidar_tokens(usuario)
    registrar(db, Acao.LOGOUT, "auth", "usuario", usuario.id, "Logout realizado.")
    db.commit()


def trocar_senha(
    db: Session, auth: AuthContext, senha_atual: str, nova_senha: str
) -> tuple[str, int, str]:
    usuario = auth.usuario
    if not verificar_senha(senha_atual, usuario.senha_hash):
        # Conta como tentativa de adivinhar a senha (token roubado de 15 min não pode testar à vontade).
        bloqueou = _contar_falha(usuario)
        registrar(
            db,
            Acao.LOGIN_FALHA,
            "auth",
            "usuario",
            usuario.id,
            "Troca de senha recusada: senha atual incorreta."
            + (" Conta bloqueada temporariamente." if bloqueou else ""),
        )
        db.commit()
        raise AppError(422, "senha_atual_incorreta", "Senha atual incorreta.")
    if senha_atual == nova_senha:
        raise AppError(422, "senha_repetida", "A nova senha deve ser diferente da atual.")
    erro = validar_politica_senha(nova_senha, usuario.email)
    if erro:
        raise AppError(422, "senha_fraca", erro)

    antes = {"must_change_password": usuario.must_change_password}
    usuario.senha_hash = hash_senha(nova_senha)
    usuario.must_change_password = False
    usuario.falhas_login = 0
    usuario.bloqueado_ate = None
    revogar_todos(db, usuario.id)
    invalidar_tokens(usuario)
    refresh, _ = _emitir_refresh(db, usuario, uuid.uuid4())
    registrar(
        db,
        Acao.UPDATE,
        "auth",
        "usuario",
        usuario.id,
        "Senha alterada pelo próprio usuário.",
        antes=antes,
        depois={"must_change_password": False},
    )
    db.commit()
    access, expira = gerar_access_token(usuario.id)
    return access, expira, refresh
