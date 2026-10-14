import jwt

from app.core.config import get_settings
from app.core.security import (
    decodificar_access_token,
    gerar_access_token,
    hash_refresh,
    hash_senha,
    validar_politica_senha,
    verificar_senha,
)


def test_senha_argon2id():
    h = hash_senha("SenhaForte#2026")
    assert h.startswith("$argon2id$")
    assert verificar_senha("SenhaForte#2026", h)
    assert not verificar_senha("outra", h)


def test_verificar_sem_hash_nunca_aceita():
    assert not verificar_senha("qualquer", None)


def test_politica_de_senha():
    assert validar_politica_senha("curta")
    assert validar_politica_senha("aaaaaaaaaaaa")
    assert validar_politica_senha("x" * 129)
    assert validar_politica_senha("SenhaForte#2026") is None


def test_access_token_ida_e_volta(ambiente):
    token, expira = gerar_access_token(42)
    assert expira == 15 * 60
    assert decodificar_access_token(token)[0] == 42


def test_access_token_adulterado_ou_de_outro_segredo_e_recusado(ambiente):
    assert decodificar_access_token("lixo") is None
    falso = jwt.encode({"sub": "1", "iat": 1, "exp": 9999999999}, "outro-segredo-" * 4, "HS256")
    assert decodificar_access_token(falso) is None
    sem_assinatura = jwt.encode({"sub": "1", "iat": 1, "exp": 9999999999}, "", "none")
    assert decodificar_access_token(sem_assinatura) is None
    assert get_settings().jwt_secret  # segredo carregado do ambiente


def test_hash_do_refresh_e_deterministico():
    assert hash_refresh("abc") == hash_refresh("abc")
    assert len(hash_refresh("abc")) == 64
