from app.modules.rbac.catalog import PERMISSOES
from conftest import (
    EMAIL_ADMIN,
    SENHA_ADMIN,
    auditoria,
    consultar,
    criar_papel,
    criar_usuario,
    login,
)

API = "/api/v1"


def _papel_id(c, h, nome):
    return next(p["id"] for p in c.get(f"{API}/papeis", headers=h).json() if p["nome"] == nome)


def _admin(ambiente):
    c = ambiente.cliente()
    return c, login(c, EMAIL_ADMIN, SENHA_ADMIN)


def test_admin_cria_usuario_com_troca_obrigatoria_e_audita_sem_segredos(ambiente):
    c, h = _admin(ambiente)
    gerente = _papel_id(c, h, "Gerente")
    r = c.post(
        f"{API}/usuarios",
        headers=h,
        json={
            "nome": "Maria",
            "email": "Maria@Loja.com",
            "senha_temporaria": "Temporaria#123",
            "papeis": [gerente],
        },
    )
    assert r.status_code == 201
    u = r.json()
    assert u["email"] == "maria@loja.com" and u["must_change_password"] is True
    assert [p["nome"] for p in u["papeis"]] == ["Gerente"] and "senha_hash" not in u

    [log] = auditoria(ambiente, acao="CREATE", recurso="usuario", recurso_id=str(u["id"]))
    assert log["usuario_nome"] == "Admin Teste" and log["depois"]["email"] == "maria@loja.com"
    assert "senha_hash" not in log["depois"]
    assert "Temporaria#123" not in str(consultar(ambiente, "SELECT * FROM auditoria_log"))

    # entra com a temporária e fica preso na troca de senha
    h2 = login(ambiente.cliente(), "maria@loja.com", "Temporaria#123")
    assert ambiente.cliente().get(f"{API}/usuarios", headers=h2).status_code in (401, 403)


def test_criar_valida_email_duplicado_senha_e_papel(ambiente):
    c, h = _admin(ambiente)
    gerente = _papel_id(c, h, "Gerente")
    base = {
        "nome": "X",
        "email": "x@x.com",
        "senha_temporaria": "Temporaria#123",
        "papeis": [gerente],
    }
    assert c.post(f"{API}/usuarios", headers=h, json=base).status_code == 201
    assert (
        c.post(f"{API}/usuarios", headers=h, json=base).json()["erro"]["codigo"] == "email_em_uso"
    )
    assert (
        c.post(
            f"{API}/usuarios",
            headers=h,
            json={**base, "email": "y@x.com", "senha_temporaria": "123"},
        ).json()["erro"]["codigo"]
        == "senha_fraca"
    )
    assert (
        c.post(
            f"{API}/usuarios", headers=h, json={**base, "email": "z@x.com", "papeis": [99999]}
        ).json()["erro"]["codigo"]
        == "papel_invalido"
    )
    assert (
        c.post(f"{API}/usuarios", headers=h, json={**base, "email": "nao-e-email"}).status_code
        == 422
    )
    assert (
        c.post(
            f"{API}/usuarios", headers=h, json={**base, "email": "w@x.com", "papeis": []}
        ).status_code
        == 422
    )


def test_editar_registra_antes_e_depois_e_alteracao_de_papel(ambiente):
    c, h = _admin(ambiente)
    gerente, atendente = _papel_id(c, h, "Gerente"), _papel_id(c, h, "Atendente")
    uid = criar_usuario("Carlos", "carlos@x.com", papeis=("Gerente",))

    r = c.patch(f"{API}/usuarios/{uid}", headers=h, json={"nome": "Carlos Silva"})
    assert r.status_code == 200
    [log] = auditoria(ambiente, acao="UPDATE", recurso_id=str(uid), modulo="usuarios")
    assert log["campos_alterados"] == ["nome"]
    assert log["antes"]["nome"] == "Carlos" and log["depois"]["nome"] == "Carlos Silva"

    c.patch(f"{API}/usuarios/{uid}", headers=h, json={"papeis": [atendente]})
    [perm] = auditoria(ambiente, acao="ALTERACAO_PERMISSAO", recurso_id=str(uid))
    assert perm["antes"] == {"papeis": ["Gerente"]} and perm["depois"] == {"papeis": ["Atendente"]}
    assert gerente != atendente


def test_gerente_nao_mexe_em_administrador_nem_concede_papel_acima_do_seu(ambiente):
    criar_usuario("Gerente", "g@x.com", papeis=("Gerente",))
    admin_id = consultar(ambiente, "SELECT id FROM usuario WHERE email = %s", EMAIL_ADMIN)[0]["id"]
    c = ambiente.cliente()
    h = login(c, "g@x.com", "OutraSenha#2026")
    ids = {p["nome"]: p["id"] for p in c.get(f"{API}/papeis", headers=h).json()}

    r = c.patch(f"{API}/usuarios/{admin_id}", headers=h, json={"nome": "Hackeado"})
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "admin_protegido"
    assert c.post(f"{API}/usuarios/{admin_id}/suspender", headers=h).status_code == 403
    assert (
        c.post(
            f"{API}/usuarios/{admin_id}/redefinir-senha",
            headers=h,
            json={"senha_temporaria": "Temporaria#123"},
        ).status_code
        == 403
    )

    r = c.post(
        f"{API}/usuarios",
        headers=h,
        json={
            "nome": "Falso",
            "email": "falso@x.com",
            "senha_temporaria": "Temporaria#123",
            "papeis": [ids["Administrador"]],
        },
    )
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "papel_acima_do_seu"


def test_nao_deixa_a_empresa_sem_administrador(ambiente):
    # "Superior" tem TODAS as permissões e limite 100 (igual ao Administrador), mas não é o papel
    # Administrador: só assim pode alterar o único administrador e esbarrar na regra do último.
    criar_papel("Superior", [p.codigo for p in PERMISSOES], limite_desconto="100")
    criar_usuario("Sup", "sup@x.com", papeis=("Superior",))
    admin_id = consultar(ambiente, "SELECT id FROM usuario WHERE email = %s", EMAIL_ADMIN)[0]["id"]
    c = ambiente.cliente()
    h = login(c, "sup@x.com", "OutraSenha#2026")
    atendente = _papel_id(c, h, "Atendente")

    r = c.post(f"{API}/usuarios/{admin_id}/suspender", headers=h)
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "ultimo_administrador"
    assert (
        c.delete(f"{API}/usuarios/{admin_id}", headers=h).json()["erro"]["codigo"]
        == "ultimo_administrador"
    )
    r = c.patch(f"{API}/usuarios/{admin_id}", headers=h, json={"papeis": [atendente]})
    assert r.json()["erro"]["codigo"] == "ultimo_administrador"
    assert consultar(ambiente, "SELECT suspenso, deleted_at FROM usuario WHERE id = %s", admin_id)[
        0
    ] == {
        "suspenso": False,
        "deleted_at": None,
    }


def test_ninguem_suspende_nem_exclui_a_si_mesmo(ambiente):
    c, h = _admin(ambiente)
    me = c.get(f"{API}/auth/me", headers=h).json()["id"]
    assert (
        c.post(f"{API}/usuarios/{me}/suspender", headers=h).json()["erro"]["codigo"]
        == "acao_em_si_mesmo"
    )
    assert (
        c.delete(f"{API}/usuarios/{me}", headers=h).json()["erro"]["codigo"] == "acao_em_si_mesmo"
    )
    assert (
        c.post(
            f"{API}/usuarios/{me}/redefinir-senha",
            headers=h,
            json={"senha_temporaria": "Temporaria#123"},
        ).json()["erro"]["codigo"]
        == "acao_em_si_mesmo"
    )


def test_suspender_derruba_sessoes_e_reativar_devolve_o_acesso(ambiente):
    uid = criar_usuario("Ana", "ana@x.com", papeis=("Atendente",))
    ana = ambiente.cliente()
    login(ana, "ana@x.com", "OutraSenha#2026")
    c, h = _admin(ambiente)

    assert c.post(f"{API}/usuarios/{uid}/suspender", headers=h).json()["suspenso"] is True
    assert ana.post(f"{API}/auth/refresh").status_code in (401, 403)
    r = ambiente.cliente().post(
        f"{API}/auth/login", json={"email": "ana@x.com", "senha": "OutraSenha#2026"}
    )
    assert r.status_code == 403

    assert c.post(f"{API}/usuarios/{uid}/reativar", headers=h).json()["suspenso"] is False
    login(ambiente.cliente(), "ana@x.com", "OutraSenha#2026")
    logs = auditoria(ambiente, acao="UPDATE", recurso_id=str(uid), modulo="usuarios")
    assert [(x["antes"]["suspenso"], x["depois"]["suspenso"]) for x in logs] == [
        (False, True),
        (True, False),
    ]


def test_redefinir_senha_forca_troca_e_revoga_sessoes(ambiente):
    uid = criar_usuario("Bia", "bia@x.com", papeis=("Atendente",))
    bia = ambiente.cliente()
    login(bia, "bia@x.com", "OutraSenha#2026")
    c, h = _admin(ambiente)

    assert (
        c.post(
            f"{API}/usuarios/{uid}/redefinir-senha", headers=h, json={"senha_temporaria": "x"}
        ).json()["erro"]["codigo"]
        == "senha_fraca"
    )
    assert (
        c.post(
            f"{API}/usuarios/{uid}/redefinir-senha",
            headers=h,
            json={"senha_temporaria": "Reset#Temp123"},
        ).status_code
        == 204
    )
    assert bia.post(f"{API}/auth/refresh").status_code == 401
    assert c.get(f"{API}/usuarios/{uid}", headers=h).json()["must_change_password"] is True
    login(ambiente.cliente(), "bia@x.com", "Reset#Temp123")
    assert "Reset#Temp123" not in str(consultar(ambiente, "SELECT * FROM auditoria_log"))


def test_excluir_e_logico_audita_e_libera_o_email(ambiente):
    uid = criar_usuario("Dani", "dani@x.com", papeis=("Atendente",))
    c, h = _admin(ambiente)
    assert c.delete(f"{API}/usuarios/{uid}", headers=h).status_code == 204
    assert c.get(f"{API}/usuarios/{uid}", headers=h).status_code == 404
    assert "dani@x.com" not in [
        u["email"] for u in c.get(f"{API}/usuarios", headers=h).json()["itens"]
    ]
    linha = consultar(ambiente, "SELECT deleted_at, deleted_by FROM usuario WHERE id = %s", uid)[0]
    assert linha["deleted_at"] is not None and linha["deleted_by"] is not None
    [log] = auditoria(ambiente, acao="DELETE", recurso_id=str(uid))
    assert log["antes"]["email"] == "dani@x.com" and log["depois"] is None

    assert (
        ambiente.cliente()
        .post(f"{API}/auth/login", json={"email": "dani@x.com", "senha": "OutraSenha#2026"})
        .status_code
        == 401
    )
    novo = c.post(
        f"{API}/usuarios",
        headers=h,
        json={
            "nome": "Dani 2",
            "email": "dani@x.com",
            "senha_temporaria": "Temporaria#123",
            "papeis": [_papel_id(c, h, "Atendente")],
        },
    )
    assert novo.status_code == 201


def test_listagem_filtra_e_pagina(ambiente):
    for i in range(5):
        criar_usuario(f"Pessoa {i}", f"p{i}@x.com", papeis=("Atendente",), suspenso=(i == 0))
    c, h = _admin(ambiente)
    pag = c.get(f"{API}/usuarios", headers=h, params={"limite": 2, "deslocamento": 1}).json()
    assert pag["total"] == 6 and len(pag["itens"]) == 2 and pag["limite"] == 2
    assert c.get(f"{API}/usuarios", headers=h, params={"suspenso": True}).json()["total"] == 1
    assert c.get(f"{API}/usuarios", headers=h, params={"q": "pessoa 3"}).json()["total"] == 1
    assert c.get(f"{API}/usuarios", headers=h, params={"limite": 500}).status_code == 422


def test_created_by_e_updated_by_preenchidos_automaticamente(ambiente):
    c, h = _admin(ambiente)
    admin_id = c.get(f"{API}/auth/me", headers=h).json()["id"]
    r = c.post(
        f"{API}/usuarios",
        headers=h,
        json={
            "nome": "Eva",
            "email": "eva@x.com",
            "senha_temporaria": "Temporaria#123",
            "papeis": [_papel_id(c, h, "Atendente")],
        },
    )
    uid = r.json()["id"]
    c.patch(f"{API}/usuarios/{uid}", headers=h, json={"nome": "Eva 2"})
    linha = consultar(
        ambiente, "SELECT created_by, updated_by, updated_at FROM usuario WHERE id = %s", uid
    )[0]
    assert (
        linha["created_by"] == admin_id and linha["updated_by"] == admin_id and linha["updated_at"]
    )
