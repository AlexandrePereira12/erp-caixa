from conftest import EMAIL_ADMIN, SENHA_ADMIN, criar_papel, criar_usuario, login

API = "/api/v1"


def test_consulta_filtra_pagina_e_ordena_do_mais_recente(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    c.post(f"{API}/auth/login", json={"email": EMAIL_ADMIN, "senha": "errada"})

    todos = c.get(f"{API}/auditoria", headers=h).json()
    ids = [i["id"] for i in todos["itens"]]
    assert ids == sorted(ids, reverse=True) and todos["total"] >= 3

    falhas = c.get(f"{API}/auditoria", headers=h, params={"acao": "LOGIN_FALHA"}).json()
    assert falhas["total"] == 1 and falhas["itens"][0]["acao"] == "LOGIN_FALHA"

    um = c.get(f"{API}/auditoria", headers=h, params={"limite": 1, "deslocamento": 1}).json()
    assert len(um["itens"]) == 1 and um["total"] == todos["total"]

    item = falhas["itens"][0]
    assert c.get(f"{API}/auditoria/{item['id']}", headers=h).json()["id"] == item["id"]
    assert c.get(f"{API}/auditoria/999999", headers=h).status_code == 404
    por_req = c.get(f"{API}/auditoria", headers=h, params={"request_id": item["request_id"]}).json()
    assert por_req["total"] == 1


def test_filtro_de_periodo(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    assert (
        c.get(f"{API}/auditoria", headers=h, params={"ate": "2000-01-01T00:00:00Z"}).json()["total"]
        == 0
    )
    assert (
        c.get(f"{API}/auditoria", headers=h, params={"de": "2000-01-01T00:00:00Z"}).json()["total"]
        >= 1
    )


def test_so_quem_tem_permissao_consulta(ambiente):
    criar_papel("Vazio", [])
    criar_usuario("V", "v@x.com", papeis=("Vazio",))
    c = ambiente.cliente()
    h = login(c, "v@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/auditoria", headers=h).status_code == 403
