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
        "cnpj": None,
        "telefone": None,
        "endereco": None,
        "email_contato": None,
        "pix_copia_e_cola": None,
        "pix_recebedor": None,
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


PIX = (
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR"
    "5913Fulano de Tal6008BRASILIA62070503***63041D3D"
)


def test_admin_salva_pix_com_recebedor_e_a_mudanca_sai_na_auditoria(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    # colado com quebra de linha e CRC em minúsculas: volta no formato canônico
    colado = PIX[:50] + "\n" + PIX[50:-4] + PIX[-4:].lower() + " "
    r = c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": colado})
    assert r.status_code == 200
    assert r.json()["pix_copia_e_cola"] == PIX
    assert r.json()["pix_recebedor"] == "Fulano de Tal"
    assert c.get(f"{API}/configuracoes", headers=h).json()["pix_copia_e_cola"] == PIX
    [log] = auditoria(ambiente, modulo="configuracoes")
    assert log["campos_alterados"] == ["pix_copia_e_cola"]
    assert log["antes"]["pix_copia_e_cola"] is None
    assert log["depois"]["pix_copia_e_cola"] == PIX  # destino do dinheiro: nada de mascarar


def test_outra_edicao_nao_apaga_o_pix_e_null_ou_vazio_apagam(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": PIX})
    r = c.patch(f"{API}/configuracoes", headers=h, json={"nome_exibicao": "Novo nome"})
    assert r.json()["pix_copia_e_cola"] == PIX
    for apagar in (None, "", "  "):
        c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": PIX})
        r = c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": apagar})
        assert r.json()["pix_copia_e_cola"] is None and r.json()["pix_recebedor"] is None


def test_pix_invalido_volta_422_com_mensagem_em_portugues_no_campo(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    r = c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": PIX[:-4] + "0000"})
    assert r.status_code == 422
    assert r.json()["erro"]["detalhes"] == [
        {
            "campo": "pix_copia_e_cola",
            "mensagem": "O código está incompleto ou foi alterado (o dígito verificador não confere).",
        }
    ]
    assert c.get(f"{API}/configuracoes", headers=h).json()["pix_copia_e_cola"] is None


def test_gerente_ve_o_pix_mas_nao_troca(ambiente):
    c = ambiente.cliente()
    h_admin = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    c.patch(f"{API}/configuracoes", headers=h_admin, json={"pix_copia_e_cola": PIX})
    criar_usuario("G", "g@x.com", papeis=("Gerente",))
    h = login(c, "g@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/configuracoes", headers=h).json()["pix_recebedor"] == "Fulano de Tal"
    r = c.patch(f"{API}/configuracoes", headers=h, json={"pix_copia_e_cola": None})
    assert r.status_code == 403
    assert c.get(f"{API}/configuracoes", headers=h).json()["pix_copia_e_cola"] == PIX


def test_caixa_le_o_pix_sem_ver_as_configuracoes(ambiente):
    c = ambiente.cliente()
    h_admin = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    assert c.get(f"{API}/configuracoes/pix", headers=h_admin).json() == {
        "pix_copia_e_cola": None,
        "pix_recebedor": None,
    }
    c.patch(f"{API}/configuracoes", headers=h_admin, json={"pix_copia_e_cola": PIX})
    criar_usuario("F", "f@x.com", papeis=("Frente de loja",))
    criar_usuario("A", "a@x.com", papeis=("Atendente",))
    h_frente = login(c, "f@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/configuracoes", headers=h_frente).status_code == 403
    r = c.get(f"{API}/configuracoes/pix", headers=h_frente)
    assert r.status_code == 200
    assert r.json() == {"pix_copia_e_cola": PIX, "pix_recebedor": "Fulano de Tal"}
    h_atendente = login(c, "a@x.com", "OutraSenha#2026")
    assert c.get(f"{API}/configuracoes/pix", headers=h_atendente).status_code == 403


CNPJ = "11222333000181"  # dígitos verificadores válidos


def test_admin_salva_dados_da_empresa_normalizados_e_o_cnpj_sai_mascarado_na_auditoria(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    r = c.patch(
        f"{API}/configuracoes",
        headers=h,
        json={
            "cnpj": "11.222.333/0001-81",
            "telefone": "(85) 99999-0000",
            "endereco": "  Rua das Oliveiras,   1234 - Centro ",
            "email_contato": " Contato@Restaurante.COM.br ",
        },
    )
    assert r.status_code == 200
    esperado = {
        "cnpj": CNPJ,
        "telefone": "85999990000",
        "endereco": "Rua das Oliveiras, 1234 - Centro",
        "email_contato": "Contato@restaurante.com.br",
    }
    assert {k: r.json()[k] for k in esperado} == esperado
    [log] = auditoria(ambiente, modulo="configuracoes")
    assert log["campos_alterados"] == ["cnpj", "email_contato", "endereco", "telefone"]
    assert log["depois"]["cnpj"] == "***81"  # a auditoria nunca guarda CNPJ completo


def test_dados_da_empresa_invalidos_voltam_422_em_portugues_no_campo(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    casos = {
        "cnpj": ("11222333000182", "CNPJ inválido: confira os 14 dígitos."),
        "telefone": ("1234", "Telefone inválido: informe o DDD e o número (10 ou 11 dígitos)."),
        "email_contato": ("sem-arroba", "E-mail inválido: confira o endereço."),
    }
    for campo, (valor, mensagem) in casos.items():
        r = c.patch(f"{API}/configuracoes", headers=h, json={campo: valor})
        assert r.status_code == 422, campo
        assert r.json()["erro"]["detalhes"] == [{"campo": campo, "mensagem": mensagem}]


def test_dado_da_empresa_se_apaga_com_null_ou_vazio_e_some_se_ausente(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    dados = {
        "cnpj": CNPJ,
        "telefone": "8533334444",
        "endereco": "Rua A",
        "email_contato": "a@b.com",
    }
    c.patch(f"{API}/configuracoes", headers=h, json=dados)
    r = c.patch(f"{API}/configuracoes", headers=h, json={"endereco": None, "telefone": "  "})
    assert (r.json()["endereco"], r.json()["telefone"]) == (None, None)
    assert (r.json()["cnpj"], r.json()["email_contato"]) == (CNPJ, "a@b.com")  # ausentes: intactos


def test_quem_nao_ve_as_configuracoes_le_os_dados_da_empresa_para_o_recibo(ambiente):
    c = ambiente.cliente()
    h_admin = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    c.patch(f"{API}/configuracoes", headers=h_admin, json={"cnpj": CNPJ, "endereco": "Rua A"})
    criar_usuario("F", "f@x.com", papeis=("Frente de loja",))
    criar_usuario("A", "a@x.com", papeis=("Atendente",))
    for email in ("f@x.com", "a@x.com"):
        h = login(c, email, "OutraSenha#2026")
        assert c.get(f"{API}/configuracoes", headers=h).status_code == 403
        assert c.get(f"{API}/configuracoes/empresa", headers=h).json() == {
            "nome_exibicao": "Teste",
            "cnpj": CNPJ,
            "telefone": None,
            "endereco": "Rua A",
            "email_contato": None,
        }
    assert c.get(f"{API}/configuracoes/empresa").status_code == 401
