from app.core.audit import MASCARA, campos_alterados, redigir


def test_redige_segredos_em_qualquer_nivel():
    dados = {
        "nome": "Ana",
        "senha": "x",
        "nova_senha": "y",
        "senha_hash": "$argon2",
        "refresh_token": "t",
        "pin": "1234",
        "numero_cartao": "4111111111111111",
        "aninhado": [{"access_token": "abc", "ok": 1}],
    }
    r = redigir(dados)
    assert r["nome"] == "Ana"
    for k in ("senha", "nova_senha", "senha_hash", "refresh_token", "pin", "numero_cartao"):
        assert r[k] == MASCARA
    assert r["aninhado"] == [{"access_token": MASCARA, "ok": 1}]


def test_cpf_nunca_completo():
    r = redigir(
        {"cpf": "123.456.789-09", "cnpj": "12.345.678/0001-95", "x": None, "documento": None}
    )
    assert r["cpf"] == "***09"
    assert r["cnpj"] == "***95"
    assert r["documento"] is None


def test_flag_must_change_password_nao_e_mascarada():
    assert redigir({"must_change_password": True}) == {"must_change_password": True}


def test_campos_alterados():
    assert campos_alterados({"a": 1, "b": 2, "c": 3}, {"a": 1, "b": 9, "d": 4}) == ["b", "c", "d"]
    assert campos_alterados(None, {"a": 1}) == ["a"]
