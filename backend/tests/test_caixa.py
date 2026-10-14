from decimal import Decimal

import psycopg
import pytest

from conftest import (
    APP,
    OWNER,
    auditoria,
    consultar,
    criar_usuario,
    login,
)


def _esperado(caixa):
    return {e["tipo"]: e["esperado"] for e in caixa["esperado"]}


def test_abrir_caixa_registra_abertura_e_um_por_operador(admin, ambiente):
    c, h = admin
    r = c.post("/api/v1/caixas/abrir", headers=h, json={"valor_abertura": "150.5"})
    assert r.status_code == 201
    cx = r.json()
    assert (
        cx["status"] == "aberto"
        and cx["valor_abertura"] == "150.50"
        and cx["operador"]["nome"] == "Admin Teste"
    )
    assert _esperado(cx) == {"dinheiro": "150.50"}
    mov = consultar(
        ambiente,
        "SELECT tipo, valor, origem_tipo FROM movimento_caixa WHERE caixa_id = %s",
        cx["id"],
    )
    assert mov == [
        {"tipo": "abertura", "valor": Decimal("150.50"), "origem_tipo": "abertura_caixa"}
    ]
    assert c.get("/api/v1/caixas/atual", headers=h).json()["id"] == cx["id"]

    dup = c.post("/api/v1/caixas/abrir", headers=h, json={"valor_abertura": "0"})
    assert dup.status_code == 409 and dup.json()["erro"]["codigo"] == "caixa_ja_aberto"
    assert auditoria(ambiente, acao="CREATE", recurso="caixa")


def test_abertura_zero_nao_cria_movimento_e_caixa_atual_404_sem_caixa(admin, ambiente):
    c, h = admin
    assert c.get("/api/v1/caixas/atual", headers=h).status_code == 404
    cx = c.post("/api/v1/caixas/abrir", headers=h, json={}).json()
    assert cx["valor_abertura"] == "0.00" and cx["esperado"] == []
    assert consultar(ambiente, "SELECT count(*) AS n FROM movimento_caixa")[0]["n"] == 0


def test_sangria_e_reforco(pdv):
    cid = pdv.caixa["id"]
    url = f"/caixas/{cid}/movimentos"
    assert (
        pdv.post(url, {"tipo": "reforco", "valor": "50", "descricao": "troco extra"}).status_code
        == 201
    )
    assert (
        pdv.post(
            url, {"tipo": "sangria", "valor": "120", "descricao": "pagar fornecedor"}
        ).status_code
        == 201
    )
    cx = pdv.get(f"/caixas/{cid}").json()
    assert (
        _esperado(cx) == {"dinheiro": "30.00"}
        and cx["sangrias"] == "120.00"
        and cx["reforcos"] == "50.00"
    )

    r = pdv.post(url, {"tipo": "sangria", "valor": "30.01", "descricao": "demais"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "saldo_dinheiro_insuficiente"
    assert pdv.post(url, {"tipo": "sangria", "valor": "30", "descricao": "tudo"}).status_code == 201
    assert pdv.post(url, {"tipo": "sangria", "valor": "0", "descricao": "zero"}).status_code == 422
    assert pdv.post(url, {"tipo": "sangria", "valor": "1", "descricao": "x"}).status_code == 422
    assert pdv.post(url, {"tipo": "troco", "valor": "1", "descricao": "abc"}).status_code == 422

    movs = pdv.get(f"/caixas/{cid}/movimentos").json()
    assert movs["total"] == 4 and [m["tipo"] for m in movs["itens"]][0] == "sangria"
    assert movs["itens"][0]["usuario_nome"] == "Admin Teste"
    assert len(auditoria(pdv.ambiente, acao="CREATE", recurso="movimento_caixa")) == 3


def test_fechamento_exige_conferencia_justificativa_e_nao_repete(pdv):
    cid = pdv.caixa["id"]
    pdv.post(
        f"/caixas/{cid}/movimentos", {"tipo": "reforco", "valor": "20", "descricao": "reforço"}
    )  # dinheiro esperado 120
    forma = pdv.formas["dinheiro"]

    r = pdv.post(f"/caixas/{cid}/fechar", {"conferencias": []})
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "conferencia_incompleta"
    assert r.json()["erro"]["detalhes"] == {"formas": ["Dinheiro"]}

    r = pdv.post(
        f"/caixas/{cid}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "118.50"}]},
    )
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "diferenca_sem_justificativa"
    assert r.json()["erro"]["detalhes"]["diferenca"] == "-1.50"
    assert pdv.get(f"/caixas/{cid}").json()["status"] == "aberto"  # nada mudou

    r = pdv.post(
        f"/caixas/{cid}/fechar",
        {
            "conferencias": [
                {
                    "forma_pagamento_id": forma,
                    "valor_contado": "118.50",
                    "justificativa": "troco dado a mais",
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    fechado = r.json()
    assert fechado["status"] == "fechado" and fechado["fechado_em"]
    conf = fechado["conferencias"][0]
    assert (conf["valor_esperado"], conf["valor_contado"], conf["diferenca"]) == (
        "120.00",
        "118.50",
        "-1.50",
    )
    [log] = auditoria(pdv.ambiente, acao="FECHAMENTO_CAIXA")
    assert log["depois"]["conferencias"][0]["diferenca"] == "-1.50"

    again = pdv.post(f"/caixas/{cid}/fechar", {"conferencias": []})
    assert again.status_code == 409 and again.json()["erro"]["codigo"] == "caixa_fechado"
    # caixa fechado não recebe lançamentos
    assert (
        pdv.post(
            f"/caixas/{cid}/movimentos", {"tipo": "reforco", "valor": "1", "descricao": "tarde"}
        ).json()["erro"]["codigo"]
        == "caixa_fechado"
    )
    assert pdv.get("/caixas/atual").status_code == 404


def test_fechamento_sem_diferenca_e_forma_repetida(pdv):
    cid, forma = pdv.caixa["id"], pdv.formas["dinheiro"]
    dup = pdv.post(
        f"/caixas/{cid}/fechar",
        {
            "conferencias": [
                {"forma_pagamento_id": forma, "valor_contado": "100"},
                {"forma_pagamento_id": forma, "valor_contado": "100"},
            ]
        },
    )
    assert dup.json()["erro"]["codigo"] == "conferencia_invalida"
    ok = pdv.post(
        f"/caixas/{cid}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "100"}]},
    )
    assert ok.status_code == 200 and ok.json()["conferencias"][0]["diferenca"] == "0.00"
    [log] = auditoria(pdv.ambiente, acao="FECHAMENTO_CAIXA")
    assert "sem diferenças" in log["descricao"]


def test_reabrir_caixa_novo_fechamento_e_regras(pdv):
    cid, forma = pdv.caixa["id"], pdv.formas["dinheiro"]
    pdv.post(
        f"/caixas/{cid}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "100"}]},
    )
    assert pdv.post(f"/caixas/{cid}/reabrir", {"justificativa": "x"}).status_code == 422

    r = pdv.post(f"/caixas/{cid}/reabrir", {"justificativa": "esqueci uma sangria"})
    assert r.status_code == 200 and r.json()["status"] == "aberto" and r.json()["rodada"] == 2
    assert (
        pdv.post(f"/caixas/{cid}/reabrir", {"justificativa": "de novo"}).json()["erro"]["codigo"]
        == "caixa_nao_fechado"
    )
    pdv.post(
        f"/caixas/{cid}/movimentos", {"tipo": "sangria", "valor": "10", "descricao": "esquecida"}
    )
    r = pdv.post(
        f"/caixas/{cid}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "90"}]},
    )
    assert (
        r.status_code == 200
        and r.json()["rodada"] == 2
        and r.json()["conferencias"][0]["diferenca"] == "0.00"
    )
    total = consultar(
        pdv.ambiente, "SELECT count(*) AS n FROM caixa_conferencia WHERE caixa_id = %s", cid
    )[0]["n"]
    assert total == 2  # uma conferência por rodada
    eventos = [
        e["tipo"]
        for e in consultar(
            pdv.ambiente, "SELECT tipo FROM caixa_evento WHERE caixa_id = %s ORDER BY id", cid
        )
    ]
    assert eventos == ["abertura", "fechamento", "reabertura", "fechamento"]


def test_reabrir_com_outro_caixa_aberto_do_operador_e_recusado(pdv):
    cid, forma = pdv.caixa["id"], pdv.formas["dinheiro"]
    pdv.post(
        f"/caixas/{cid}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "100"}]},
    )
    pdv.post("/caixas/abrir", {"valor_abertura": "0"})
    r = pdv.post(f"/caixas/{cid}/reabrir", {"justificativa": "preciso"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "caixa_ja_aberto"


def test_um_operador_nao_mexe_no_caixa_de_outro_mas_gerente_sim(pdv):
    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    f, g = pdv.ambiente.cliente(), pdv.ambiente.cliente()
    hf, hg = login(f, "frente@x.com", "OutraSenha#2026"), login(g, "ger@x.com", "OutraSenha#2026")
    cid, forma = pdv.caixa["id"], pdv.formas["dinheiro"]

    assert f.get(f"/api/v1/caixas/{cid}", headers=hf).status_code == 403
    assert f.get(f"/api/v1/caixas/{cid}/movimentos", headers=hf).status_code == 403
    assert (
        f.post(
            f"/api/v1/caixas/{cid}/movimentos",
            headers=hf,
            json={"tipo": "sangria", "valor": "1", "descricao": "roubo"},
        ).status_code
        == 403
    )
    assert (
        f.post(f"/api/v1/caixas/{cid}/fechar", headers=hf, json={"conferencias": []}).status_code
        == 403
    )
    assert f.get("/api/v1/caixas", headers=hf).status_code == 403  # histórico geral é do gerente

    assert g.get(f"/api/v1/caixas/{cid}", headers=hg).status_code == 200
    assert g.get("/api/v1/caixas", headers=hg).json()["total"] == 1
    r = g.post(
        f"/api/v1/caixas/{cid}/fechar",
        headers=hg,
        json={"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "100"}]},
    )
    assert r.status_code == 200  # gerente fecha o caixa de outro operador
    assert (
        g.post(
            f"/api/v1/caixas/{cid}/reabrir", headers=hg, json={"justificativa": "ajuste"}
        ).status_code
        == 200
    )
    assert (
        f.post(
            f"/api/v1/caixas/{cid}/reabrir", headers=hf, json={"justificativa": "ajuste"}
        ).status_code
        == 403
    )


def test_cada_operador_tem_o_seu_caixa(pdv):
    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    f = pdv.ambiente.cliente()
    hf = login(f, "frente@x.com", "OutraSenha#2026")
    r = f.post("/api/v1/caixas/abrir", headers=hf, json={"valor_abertura": "50"})
    assert r.status_code == 201 and r.json()["operador"]["nome"] == "Frente"
    assert f.get("/api/v1/caixas/atual", headers=hf).json()["id"] != pdv.caixa["id"]
    lista = pdv.get("/caixas", status="aberto").json()
    assert lista["total"] == 2


def test_movimentos_de_caixa_sao_append_only_e_origem_e_unica(pdv):
    with pdv.ambiente.conexao(APP) as conn:
        for comando in (
            "UPDATE movimento_caixa SET valor = 1",
            "DELETE FROM movimento_caixa",
            "TRUNCATE movimento_caixa",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match="permission denied"):
                conn.execute(comando)
    with pdv.ambiente.conexao(OWNER) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="append-only"):
            conn.execute("UPDATE movimento_caixa SET valor = 1")
    for tabela in ("caixa_evento", "comanda_evento", "titulo_receber_baixa"):
        with pdv.ambiente.conexao(APP) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(f"DELETE FROM {tabela}")
    # a mesma origem não lança duas vezes
    with pdv.ambiente.conexao_admin() as conn:
        sql = "INSERT INTO movimento_caixa (caixa_id, tipo, forma_pagamento_id, valor, origem_tipo, origem_id) VALUES (%s, 'venda', %s, 1, 'venda_pagamento', 999)"
        conn.execute(sql, (pdv.caixa["id"], pdv.formas["dinheiro"]))
        with pytest.raises(psycopg.errors.UniqueViolation):
            conn.execute(sql, (pdv.caixa["id"], pdv.formas["dinheiro"]))


def test_formas_de_pagamento_regras(admin):
    c, h = admin
    formas = c.get("/api/v1/formas-pagamento", headers=h).json()
    assert [f["tipo"] for f in formas] == ["dinheiro", "pix", "debito", "credito", "vale", "fiado"]
    por_tipo = {f["tipo"]: f for f in formas}
    assert (
        c.post(
            "/api/v1/formas-pagamento",
            headers=h,
            json={"nome": "Outro dinheiro", "tipo": "dinheiro"},
        ).json()["erro"]["codigo"]
        == "forma_tipo_unico"
    )
    assert (
        c.post("/api/v1/formas-pagamento", headers=h, json={"nome": "pix", "tipo": "pix"}).json()[
            "erro"
        ]["codigo"]
        == "forma_nome_em_uso"
    )
    nova = c.post(
        "/api/v1/formas-pagamento",
        headers=h,
        json={"nome": "Cartão Alelo", "tipo": "vale", "ordem": 9},
    )
    assert nova.status_code == 201
    assert (
        c.patch(
            f"/api/v1/formas-pagamento/{nova.json()['id']}", headers=h, json={"ativa": False}
        ).json()["ativa"]
        is False
    )
    assert (
        c.get("/api/v1/formas-pagamento", headers=h, params={"ativa": True}).json().__len__() == 6
    )
    assert (
        c.patch(
            f"/api/v1/formas-pagamento/{por_tipo['dinheiro']['id']}",
            headers=h,
            json={"ativa": False},
        ).json()["erro"]["codigo"]
        == "forma_protegida"
    )
    assert (
        c.delete(f"/api/v1/formas-pagamento/{por_tipo['fiado']['id']}", headers=h).json()["erro"][
            "codigo"
        ]
        == "forma_protegida"
    )
    assert c.delete(f"/api/v1/formas-pagamento/{nova.json()['id']}", headers=h).status_code == 204
