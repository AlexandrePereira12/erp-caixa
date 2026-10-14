import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()  # Argon2id
# Hash descartável: login de e-mail inexistente gasta o mesmo tempo de um existente.
_HASH_FALSO = _hasher.hash("senha-falsa-para-igualar-tempo")

SENHA_MIN = 10
SENHA_MAX = 128


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha: str, hash_: str | None) -> bool:
    try:
        return _hasher.verify(hash_ or _HASH_FALSO, senha) and hash_ is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def senha_precisa_rehash(hash_: str) -> bool:
    return _hasher.check_needs_rehash(hash_)


# Senhas que passam do tamanho mínimo mas estão em qualquer lista de ataque.
_SENHAS_COMUNS = frozenset(
    {
        "1234567890",
        "12345678910",
        "0123456789",
        "123456789012",
        "qwertyuiop",
        "qwerty12345",
        "senha12345",
        "senha123456",
        "password123",
        "password1234",
        "passw0rd123",
        "1q2w3e4r5t",
        "abcd123456",
        "abc1234567",
        "mudar12345",
        "mudar123456",
        "trocar12345",
        "admin12345",
        "admin123456",
        "administrador",
        "restaurante",
        "restaurante1",
        "restaurante123",
        "brasil12345",
        "brasil2026",
        "brasil2025",
        "iloveyou123",
        "letmein1234",
        "welcome1234",
        "000000000000",
        "111111111111",
        "123123123123",
        "a1b2c3d4e5",
        "q1w2e3r4t5",
    }
)


def validar_politica_senha(senha: str, email: str | None = None) -> str | None:
    """Devolve a mensagem de erro ou None se a senha for aceitável."""
    if len(senha) < SENHA_MIN:
        return f"A senha deve ter ao menos {SENHA_MIN} caracteres."
    if len(senha) > SENHA_MAX:
        return f"A senha deve ter no máximo {SENHA_MAX} caracteres."
    if len(set(senha)) < 4:
        return "A senha é muito repetitiva."
    if senha.lower() in _SENHAS_COMUNS:
        return "Esta senha é muito comum. Escolha outra."
    if email:
        usuario = email.split("@", 1)[0].lower()
        if len(usuario) >= 4 and usuario in senha.lower():
            return "A senha não pode conter o seu e-mail."
    return None


def gerar_access_token(usuario_id: int) -> tuple[str, int]:
    s = get_settings()
    agora = datetime.now(UTC)
    exp = agora + timedelta(minutes=s.access_token_minutes)
    payload = {
        "sub": str(usuario_id),
        # iat fracionário (NumericDate permite): a comparação com `tokens_invalidos_ate` precisa
        # de precisão menor que 1 s, senão o token emitido logo depois de uma troca de senha
        # pareceria anterior a ela.
        "iat": agora.timestamp(),
        "exp": exp,
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256"), s.access_token_minutes * 60


def decodificar_access_token(token: str) -> tuple[int, float] | None:
    """(id do usuário, instante de emissão em epoch) ou None se o token não vale."""
    try:
        dados = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat"]},
        )
        return int(dados["sub"]), float(dados["iat"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


def gerar_refresh_token() -> tuple[str, str]:
    """(token em claro para o cookie, hash SHA-256 para o banco)."""
    token = secrets.token_urlsafe(48)
    return token, hash_refresh(token)


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
