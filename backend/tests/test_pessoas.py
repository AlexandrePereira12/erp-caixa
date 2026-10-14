from conftest import auditoria, consultar, criar_papel, criar_usuario, login

API = "/api/v1"
CPF = "529.982.247-25"
CNPJ = "11.222.333/0001-81"


def _pessoa(**extra):
    return {"tipo": "F", "nome": "Maria Souza", "papeis": ["cliente"]} | extra


def test_cria_pessoa_fisica_cliente_normaliza_cpf_e_audita_sem_cpf_completo(admin, ambiente):
    c, h = admin
    r = c.post(
        f"{API}/pessoas",
        headers=h,
        json=_pessoa(
            documento=CPF,
            telefone="(85) 99999-0000",
            email="maria@x.com",
            enderecos=[{"logradouro": "Rua A", "numero": "10", "cidade": "Fortaleza", "uf": "ce"}],
        ),
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["documento"] == "52998224725" and p["papeis"] == ["cliente"]
    assert p["enderecos"][0]["uf"] == "CE" and p["enderecos"][0]["principal"] is True
    assert p["cliente"] == {"aceita_fiado": False, "limite_fiado": "0.00"}

    [log] = auditoria(ambiente, acao="CREATE", recurso="pessoa", recurso_id=str(p["id"]))
    assert log["depois"]["documento"] == "***25"
    assert "52998224725" not in str(consultar(ambiente, "SELECT * FROM auditoria_log"))
    assert "529.982.247-25" not in str(consultar(ambiente, "SELECT * FROM auditoria_log"))


def test_documento_invalido_duplicado_e_pessoa_juridica(admin):
    c, h = admin
    assert (
        c.post(f"{API}/pessoas", headers=h, json=_pessoa(documento="111.111.111-11")).json()[
            "erro"
        ]["codigo"]
        == "documento_invalido"
    )
    assert c.post(f"{API}/pessoas", headers=h, json=_pessoa(documento=CPF)).status_code == 201
    dup = c.post(f"{API}/pessoas", headers=h, json=_pessoa(nome="Outra", documento="52998224725"))
    assert dup.status_code == 409 and dup.json()["erro"]["codigo"] == "documento_em_uso"
    pj = c.post(
        f"{API}/pessoas",
        headers=h,
        json={"tipo": "J", "nome": "Atacado Ltda", "documento": CNPJ, "papeis": ["fornecedor"]},
    )
    assert pj.status_code == 201 and pj.json()["cliente"] is None
    # CPF num cadastro PJ é recusado
    erro = c.post(
        f"{API}/pessoas",
        headers=h,
        json={"tipo": "J", "nome": "X", "documento": CPF, "papeis": ["fornecedor"]},
    )
    assert erro.json()["erro"]["codigo"] == "documento_invalido"


def test_validacoes_de_papeis_cliente_e_enderecos(admin):
    c, h = admin
    base = {"tipo": "F", "nome": "X"}
    assert c.post(f"{API}/pessoas", headers=h, json=base | {"papeis": []}).status_code == 422
    r = c.post(
        f"{API}/pessoas",
        headers=h,
        json=base | {"papeis": ["fornecedor"], "cliente": {"aceita_fiado": False}},
    )
    assert r.json()["erro"]["codigo"] == "cliente_sem_papel"
    dois = [
        {"logradouro": "A", "cidade": "B", "uf": "CE", "principal": True},
        {"logradouro": "C", "cidade": "D", "uf": "CE", "principal": True},
    ]
    r = c.post(f"{API}/pessoas", headers=h, json=base | {"papeis": ["cliente"], "enderecos": dois})
    assert r.json()["erro"]["codigo"] == "endereco_principal_duplicado"
    assert (
        c.post(
            f"{API}/pessoas",
            headers=h,
            json=base
            | {
                "papeis": ["cliente"],
                "enderecos": [{"logradouro": "A", "cidade": "B", "uf": "CEA"}],
            },
        ).status_code
        == 422
    )
    assert (
        c.post(f"{API}/pessoas", headers=h, json=base | {"papeis": ["gerente"]}).status_code == 422
    )


def test_fiado_so_com_permissao_especifica(ambiente):
    criar_papel("Cadastrador", ["pessoas.listar", "pessoas.criar", "pessoas.editar"])
    criar_usuario("Cad", "cad@x.com", papeis=("Cadastrador",))
    cad = ambiente.cliente()
    hc = login(cad, "cad@x.com", "OutraSenha#2026")
    com_fiado = _pessoa(cliente={"aceita_fiado": True, "limite_fiado": "150"})
    r = cad.post(f"{API}/pessoas", headers=hc, json=com_fiado)
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "sem_permissao"
    ok = cad.post(f"{API}/pessoas", headers=hc, json=_pessoa())
    assert ok.status_code == 201
    r = cad.patch(
        f"{API}/pessoas/{ok.json()['id']}", headers=hc, json={"cliente": {"aceita_fiado": True}}
    )
    assert r.status_code == 403

    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    ger = ambiente.cliente()
    hg = login(ger, "ger@x.com", "OutraSenha#2026")
    r = ger.patch(
        f"{API}/pessoas/{ok.json()['id']}",
        headers=hg,
        json={"cliente": {"aceita_fiado": True, "limite_fiado": "150.5"}},
    )
    assert r.status_code == 200
    assert r.json()["cliente"] == {"aceita_fiado": True, "limite_fiado": "150.50"}


def test_cadastro_rapido_do_balcao(ambiente):
    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    c = ambiente.cliente()
    h = login(c, "frente@x.com", "OutraSenha#2026")
    r = c.post(
        f"{API}/pessoas/rapido", headers=h, json={"nome": "João", "telefone": "(85) 98888-7777"}
    )
    assert r.status_code == 201
    p = r.json()
    assert p["papeis"] == ["cliente"] and p["cliente"]["aceita_fiado"] is False
    assert (
        c.post(
            f"{API}/pessoas/rapido", headers=h, json={"nome": "X", "telefone": "abc12345"}
        ).json()["erro"]["codigo"]
        == "telefone_invalido"
    )
    # quem só tem cadastro rápido não cria cadastro completo nem edita
    assert c.post(f"{API}/pessoas", headers=h, json=_pessoa()).status_code == 403
    assert c.patch(f"{API}/pessoas/{p['id']}", headers=h, json={"nome": "Z"}).status_code == 403
    assert c.get(f"{API}/pessoas", headers=h).status_code == 200


def test_editar_audita_diff_e_substitui_listas(admin, ambiente):
    c, h = admin
    p = c.post(
        f"{API}/pessoas",
        headers=h,
        json=_pessoa(
            documento=CPF,
            enderecos=[{"logradouro": "Rua A", "cidade": "Fortaleza", "uf": "CE"}],
        ),
    ).json()

    r = c.patch(f"{API}/pessoas/{p['id']}", headers=h, json={"nome": "Maria S. Souza"})
    assert r.status_code == 200
    [log] = auditoria(ambiente, acao="UPDATE", recurso="pessoa", recurso_id=str(p["id"]))
    assert log["campos_alterados"] == ["nome"]

    r = c.patch(
        f"{API}/pessoas/{p['id']}",
        headers=h,
        json={
            "papeis": ["cliente", "colaborador"],
            "enderecos": [
                {"logradouro": "Rua B", "cidade": "Sobral", "uf": "CE"},
                {"logradouro": "Rua C", "cidade": "Sobral", "uf": "CE", "principal": True},
            ],
            "telefone": None,
        },
    )
    assert r.status_code == 200
    novo = r.json()
    assert novo["papeis"] == ["cliente", "colaborador"]
    assert [e["logradouro"] for e in novo["enderecos"]] == ["Rua C", "Rua B"]
    assert novo["enderecos"][0]["principal"] is True

    # mudar o documento aparece no diff mesmo com a máscara (mesmos 2 últimos dígitos)
    r = c.patch(f"{API}/pessoas/{p['id']}", headers=h, json={"documento": "111.444.777-35"})
    assert r.status_code == 200
    ultimo = auditoria(ambiente, acao="UPDATE", recurso="pessoa", recurso_id=str(p["id"]))[-1]
    assert ultimo["campos_alterados"] == ["documento"]
    assert ultimo["antes"]["documento"] == "***25" and ultimo["depois"]["documento"] == "***35"

    # retirar o papel cliente remove os dados de cliente
    r = c.patch(f"{API}/pessoas/{p['id']}", headers=h, json={"papeis": ["colaborador"]})
    assert r.json()["cliente"] is None


def test_listagem_busca_filtros_e_paginacao(admin):
    c, h = admin
    c.post(f"{API}/pessoas", headers=h, json=_pessoa(nome="Ana Lima", telefone="(85) 91111-2222"))
    c.post(f"{API}/pessoas", headers=h, json=_pessoa(nome="Bruno Dias", documento=CPF))
    c.post(
        f"{API}/pessoas",
        headers=h,
        json={
            "tipo": "J",
            "nome": "Frutas Ltda",
            "documento": CNPJ,
            "papeis": ["fornecedor"],
            "ativo": False,
        },
    )

    def total(**params):
        return c.get(f"{API}/pessoas", headers=h, params=params).json()["total"]

    assert total() == 3
    assert total(q="ana") == 1
    assert total(q="91111") == 1  # por parte do telefone (só dígitos)
    assert total(q="529982") == 1  # por prefixo do documento
    assert total(q="529.982") == 1
    assert total(papel="fornecedor") == 1
    assert total(ativo=False) == 1
    nomes = [
        p["nome"] for p in c.get(f"{API}/pessoas", headers=h, params={"limite": 2}).json()["itens"]
    ]
    assert nomes == ["Ana Lima", "Bruno Dias"]  # ordem alfabética


def test_excluir_e_logico_e_libera_o_documento(admin, ambiente):
    c, h = admin
    p = c.post(f"{API}/pessoas", headers=h, json=_pessoa(documento=CPF)).json()
    assert c.delete(f"{API}/pessoas/{p['id']}", headers=h).status_code == 204
    assert c.get(f"{API}/pessoas/{p['id']}", headers=h).status_code == 404
    assert c.delete(f"{API}/pessoas/{p['id']}", headers=h).status_code == 404
    assert consultar(ambiente, "SELECT deleted_at FROM pessoa WHERE id = %s", p["id"])[0][
        "deleted_at"
    ]
    assert auditoria(ambiente, acao="DELETE", recurso="pessoa", recurso_id=str(p["id"]))
    assert c.post(f"{API}/pessoas", headers=h, json=_pessoa(documento=CPF)).status_code == 201
