from conftest import EMAIL_ADMIN, SENHA_ADMIN, auditoria, criar_usuario, login

API = "/api/v1"


def test_semente_vem_do_ambiente_e_admin_edita_com_auditoria(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    assert c.get(f"{API}/configuracoes", headers=h).json() == {
        "nome_exibicao": "Teste",
        "timezone": "America/Fortaleza",
        "taxa_servico_pct": "0.00",
        "cancelamento_janela_min": 5,
    }
    r = c.patch(f"{API}/configuracoes", headers=h, json={"timezone": "America/Sao_Paulo"})
    assert r.status_code == 200 and r.json()["timezone"] == "America/Sao_Paulo"
    [log] = auditoria(ambiente, modulo="configuracoes")
    assert log["campos_alterados"] == ["timezone"]
    assert log["antes"]["timezone"] == "America/Fortaleza"


def test_valida_fuso(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    assert (
        c.patch(f"{API}/configuracoes", headers=h, json={"timezone": "Marte/Olympus"}).status_code
        == 422
    )


def test_gerente_ve_mas_nao_edita(ambiente):
    criar_usuario("G", "g@x.com", papeis=("Gerente",))
    c = ambiente.cliente()
    h = login(c, "g@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/configuracoes", headers=h).status_code == 200
    assert (
        c.patch(f"{API}/configuracoes", headers=h, json={"nome_exibicao": "X"}).status_code == 403
    )
