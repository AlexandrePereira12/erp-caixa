from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from conftest import criar_usuario, login
from test_vendas import esperado

REF = "2026-10-14"  # quarta-feira; semana = 12 a 18/10; fuso da empresa = America/Fortaleza (UTC-3)


def hoje_local() -> str:
    """Hoje no fuso padrão da empresa (é o que os relatórios usam por padrão)."""
    return datetime.now(ZoneInfo("America/Fortaleza")).date().isoformat()


def utc(dia: str, hora: str) -> datetime:
    return datetime.fromisoformat(f"{dia}T{hora}:00+00:00").astimezone(UTC)


def vender(pdv, itens, pagamentos, quando: datetime, **extra):
    c = pdv.post("/comandas", {"tipo": "balcao"}).json()
    for produto, qtd in itens:
        pdv.item(c, produto, qtd)
    r = pdv.fechar(c, pagamentos, **extra)
    assert r.status_code == 201, r.text
    v = r.json()
    with pdv.ambiente.conexao_admin() as conn:
        # venda é append-only: o teste desliga o trigger só para antedatar a venda
        conn.execute("ALTER TABLE venda DISABLE TRIGGER USER")
        conn.execute("UPDATE venda SET created_at = %s WHERE id = %s", (quando, v["id"]))
        conn.execute("ALTER TABLE venda ENABLE TRIGGER USER")
    return v


def cenario(pdv):
    """Seis vendas válidas e uma estornada, espalhadas por dias/semana/mês."""
    r, h = pdv.refri, pdv.hamb
    return {
        "v1": vender(
            pdv, [(r, 2), (h, 1)], [pdv.pg("dinheiro", "35")], utc("2026-10-14", "15:00")
        ),  # 14/10 12:00 local
        "v2": vender(
            pdv, [(h, 1)], [pdv.pg("pix", "20")], utc("2026-10-12", "13:00")
        ),  # segunda da semana
        "v3": vender(
            pdv, [(r, 2)], [pdv.pg("pix", "15")], utc("2026-10-03", "13:00")
        ),  # outra semana do mês
        "v4": vender(
            pdv, [(r, 1)], [pdv.pg("pix", "7.50")], utc("2026-09-30", "13:00")
        ),  # mês anterior
        "v5": vender(
            pdv, [(r, 1)], [pdv.pg("pix", "7.50")], utc("2026-10-15", "02:30")
        ),  # 14/10 23:30 local
        "v7": vender(
            pdv, [(r, 1)], [pdv.pg("pix", "7.50")], utc("2026-10-14", "02:59")
        ),  # 13/10 23:59 local
    }


def test_dashboard_dia_semana_mes_no_fuso_da_empresa(pdv):
    cenario(pdv)
    d = pdv.get("/dashboard", referencia=REF).json()
    assert d["timezone"] == "America/Fortaleza" and d["data_referencia"] == REF
    # dia 14: v1 (35) + v5 (7,50, 23:30 local); v7 (02:59 UTC) ainda é dia 13 no fuso da empresa
    assert (d["dia"]["faturamento"], d["dia"]["vendas_qtd"], d["dia"]["ticket_medio"]) == (
        "42.50",
        2,
        "21.25",
    )
    assert d["dia"]["janela"] == {"de": "2026-10-14", "ate": "2026-10-14"}
    # semana 12–18/10: v1 + v5 + v7 + v2 = 35 + 7,5 + 7,5 + 20
    assert (d["semana"]["faturamento"], d["semana"]["vendas_qtd"], d["semana"]["ticket_medio"]) == (
        "70.00",
        4,
        "17.50",
    )
    assert d["semana"]["janela"] == {"de": "2026-10-12", "ate": "2026-10-18"}
    # mês: + v3 (15); v4 (30/09) fica de fora
    assert (d["mes"]["faturamento"], d["mes"]["vendas_qtd"], d["mes"]["ticket_medio"]) == (
        "85.00",
        5,
        "17.00",
    )
    assert d["mes"]["janela"] == {"de": "2026-10-01", "ate": "2026-10-31"}


def test_dashboard_detalhes_mais_vendidos_formas_caixa_estoque_e_a_receber(pdv):
    cenario(pdv)
    pdv.c.patch(f"/api/v1/produtos/{pdv.pao['id']}", headers=pdv.h, json={"estoque_minimo": "100"})
    d = pdv.get("/dashboard", referencia=REF, periodo="mes").json()
    assert d["periodo_detalhe"] == "mes"
    mv = [(m["produto"], m["quantidade"], m["total"]) for m in d["mais_vendidos"]]
    assert mv == [("Refrigerante", "6.000", "45.00"), ("Hambúrguer", "2.000", "40.00")]
    formas = {f["tipo"]: (f["total"], f["pagamentos_qtd"]) for f in d["formas_pagamento"]}
    assert formas == {
        "pix": ("50.00", 4),
        "dinheiro": ("35.00", 1),
    }  # só vendas do mês e não estornadas
    assert [c["operador"] for c in d["caixas_abertos"]] == ["Admin Teste"]
    assert {e["tipo"]: e["total"] for e in d["caixas_abertos"][0]["esperado"]} == {
        "dinheiro": "135.00",
        "pix": "57.50",  # o caixa guarda tudo o que entrou, inclusive a venda de setembro
    }
    assert d["estoque_baixo_qtd"] >= 1 and d["estoque_baixo"][0]["produto"] == "Pão"
    assert d["contas_a_receber"] == {"titulos_abertos": 0, "saldo_aberto": "0.00"}

    # por dia só enxerga o dia
    dia = pdv.get("/dashboard", referencia=REF, periodo="dia").json()
    assert [m["produto"] for m in dia["mais_vendidos"]] == ["Refrigerante", "Hambúrguer"]
    assert dia["mais_vendidos"][0]["quantidade"] == "3.000"  # v1 (2) + v5 (1)


def test_venda_estornada_e_fiado_no_dashboard(pdv):
    v = vender(pdv, [(pdv.refri, 2)], [pdv.pg("pix", "15")], utc("2026-10-14", "15:00"))
    pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "teste"})
    cliente = pdv.post(
        "/pessoas",
        {"tipo": "F", "nome": "Fiel", "papeis": ["cliente"], "cliente": {"aceita_fiado": True}},
    ).json()
    vender(
        pdv,
        [(pdv.refri, 4)],
        [pdv.pg("fiado", "30")],
        utc("2026-10-14", "16:00"),
        cliente_id=cliente["id"],
    )
    d = pdv.get("/dashboard", referencia=REF).json()
    assert (
        d["dia"]["faturamento"] == "30.00" and d["dia"]["vendas_qtd"] == 1
    )  # a estornada não conta; fiado conta como venda
    assert d["contas_a_receber"] == {"titulos_abertos": 1, "saldo_aberto": "30.00"}
    assert {f["tipo"] for f in d["formas_pagamento"]} == {"fiado"}


def test_dashboard_sem_vendas_tem_ticket_zero(pdv):
    d = pdv.get("/dashboard", referencia=REF).json()
    assert d["dia"] == {
        "janela": {"de": REF, "ate": REF},
        "faturamento": "0.00",
        "vendas_qtd": 0,
        "ticket_medio": "0.00",
    }
    assert d["mais_vendidos"] == [] and d["formas_pagamento"] == []


def test_mudar_o_fuso_muda_a_que_dia_cada_venda_pertence(pdv):
    vender(pdv, [(pdv.refri, 1)], [pdv.pg("pix", "7.50")], utc("2026-10-15", "02:30"))
    assert pdv.get("/dashboard", referencia="2026-10-14").json()["dia"]["vendas_qtd"] == 1
    pdv.c.patch("/api/v1/configuracoes", headers=pdv.h, json={"timezone": "UTC"})
    assert pdv.get("/dashboard", referencia="2026-10-14").json()["dia"]["vendas_qtd"] == 0
    assert pdv.get("/dashboard", referencia="2026-10-15").json()["dia"]["vendas_qtd"] == 1


def test_relatorio_vendas_por_dia_forma_produto_e_operador(pdv):
    c = cenario(pdv)
    venda_estornada = vender(
        pdv, [(pdv.hamb, 1)], [pdv.pg("pix", "20")], utc("2026-10-14", "18:00")
    )
    pdv.post(f"/vendas/{venda_estornada['id']}/estornar", {"motivo": "erro"})
    assert c  # cenário criado
    periodo = {"de": "2026-10-01", "ate": "2026-10-31"}

    r = pdv.get("/relatorios/vendas", **periodo).json()
    assert r["agrupado_por"] == "dia" and r["janela"] == periodo
    assert (
        r["resumo"]["faturamento"] == "85.00"
        and r["resumo"]["vendas_qtd"] == 5
        and r["resumo"]["ticket_medio"] == "17.00"
    )
    assert (r["resumo"]["estornos_qtd"], r["resumo"]["estornos_total"]) == (1, "20.00")
    assert [(x["chave"], x["total"], x["vendas_qtd"]) for x in r["linhas"]] == [
        ("2026-10-03", "15.00", 1),
        ("2026-10-12", "20.00", 1),
        ("2026-10-13", "7.50", 1),
        ("2026-10-14", "42.50", 2),
    ]
    assert r["linhas"][-1]["rotulo"] == "14/10/2026"

    por_forma = pdv.get("/relatorios/vendas", agrupar="forma_pagamento", **periodo).json()["linhas"]
    assert [(x["rotulo"], x["total"]) for x in por_forma] == [
        ("PIX", "50.00"),
        ("Dinheiro", "35.00"),
    ]
    por_produto = pdv.get("/relatorios/vendas", agrupar="produto", **periodo).json()["linhas"]
    assert [(x["rotulo"], x["quantidade"], x["total"]) for x in por_produto] == [
        ("Refrigerante", "6.000", "45.00"),
        ("Hambúrguer", "2.000", "40.00"),
    ]
    por_operador = pdv.get("/relatorios/vendas", agrupar="operador", **periodo).json()["linhas"]
    assert [(x["rotulo"], x["total"], x["vendas_qtd"]) for x in por_operador] == [
        ("Admin Teste", "85.00", 5)
    ]


def test_relatorio_vendas_soma_descontos_acrescimos_e_taxa(pdv):
    pdv.c.patch("/api/v1/configuracoes", headers=pdv.h, json={"taxa_servico_pct": "10"})
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 4)  # 30,00
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "desconto", "modo": "valor", "valor": "3", "justificativa": "teste"},
    )
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "acrescimo", "modo": "valor", "valor": "1", "justificativa": "teste"},
    )
    # 30 - 3 = 27; taxa 2,70; +1 = 30,70
    v = pdv.fechar(c, [pdv.pg("pix", "30.70")])
    assert v.status_code == 201
    hoje = hoje_local()
    resumo = pdv.get("/relatorios/vendas", de=hoje, ate=hoje).json()["resumo"]
    assert (
        resumo["subtotal_itens"],
        resumo["descontos"],
        resumo["acrescimos"],
        resumo["taxa_servico"],
        resumo["faturamento"],
    ) == (
        "30.00",
        "3.00",
        "1.00",
        "2.70",
        "30.70",
    )


def test_relatorio_de_vendas_validacoes_e_permissoes(pdv):
    assert (
        pdv.get("/relatorios/vendas", de="2026-10-10", ate="2026-10-01").json()["erro"]["codigo"]
        == "periodo_invalido"
    )
    assert (
        pdv.get("/relatorios/vendas", de="2025-01-01", ate="2026-10-01").json()["erro"]["codigo"]
        == "periodo_invalido"
    )
    assert pdv.get("/relatorios/vendas", agrupar="mes").status_code == 422
    vazio = pdv.get("/relatorios/vendas", de="2026-01-01", ate="2026-01-31").json()
    assert vazio["resumo"]["faturamento"] == "0.00" and vazio["linhas"] == []

    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    f, g = pdv.ambiente.cliente(), pdv.ambiente.cliente()
    hf, hg = login(f, "frente@x.com", "OutraSenha#2026"), login(g, "ger@x.com", "OutraSenha#2026")
    for caminho in (
        "/dashboard",
        "/relatorios/vendas",
        "/relatorios/caixa",
        "/relatorios/estoque",
        "/relatorios/perdas",
    ):
        assert f.get(f"/api/v1{caminho}", headers=hf).status_code == 403, caminho
        assert g.get(f"/api/v1{caminho}", headers=hg).status_code == 200, caminho


def test_relatorio_de_caixa_com_diferencas(pdv):
    cid, forma = pdv.caixa["id"], pdv.formas["dinheiro"]
    hoje = hoje_local()
    vender(
        pdv,
        [(pdv.refri, 2)],
        [
            pdv.pg("dinheiro", "15"),
        ],
        datetime.now(UTC),
    )
    pdv.post(
        f"/caixas/{cid}/movimentos", {"tipo": "sangria", "valor": "20", "descricao": "fornecedor"}
    )
    pdv.post(
        f"/caixas/{cid}/fechar",
        {
            "conferencias": [
                {
                    "forma_pagamento_id": forma,
                    "valor_contado": "93",
                    "justificativa": "troco errado",
                }
            ]
        },
    )
    r = pdv.get("/relatorios/caixa", de=hoje, ate=hoje).json()
    assert r["caixas_qtd"] == 1 and r["diferenca_total"] == "-2.00"
    cx = r["caixas"][0]
    assert (
        cx["operador"],
        cx["status"],
        cx["valor_abertura"],
        cx["vendas_qtd"],
        cx["vendas_total"],
    ) == ("Admin Teste", "fechado", "100.00", 1, "15.00")
    assert (cx["sangrias"], cx["reforcos"], cx["esperado_total"], cx["diferenca_total"]) == (
        "20.00",
        "0.00",
        "95.00",
        "-2.00",
    )
    assert [(x["forma"], x["esperado"], x["contado"], x["diferenca"]) for x in r["por_forma"]] == [
        ("Dinheiro", "95.00", "93.00", "-2.00")
    ]
    assert (
        pdv.get("/relatorios/caixa", de=hoje, ate=hoje, operador_id=9999).json()["caixas_qtd"] == 0
    )
    assert esperado(pdv)  # caixa fechado continua consultável


def test_relatorio_de_estoque_posicao_e_valor(pdv):
    c = pdv.c
    cat = c.post("/api/v1/categorias", headers=pdv.h, json={"nome": "Bebidas"}).json()
    c.patch(
        f"/api/v1/produtos/{pdv.refri['id']}",
        headers=pdv.h,
        json={"categoria_id": cat["id"], "estoque_minimo": "150"},
    )
    c.post(
        "/api/v1/estoque/entradas",
        headers=pdv.h,
        json={"produto_id": pdv.pao["id"], "quantidade": "10", "custo_unitario": "1.5"},
    )
    # saldos: refri 100 (mín 150, custo 0), pão 60 (custo médio (50*0.5 + 10*1.5)/60 = 0.6667), carne 10 (custo 30)
    r = pdv.get("/relatorios/estoque").json()
    linhas = {x["produto"]: x for x in r["linhas"]}
    assert set(linhas) == {"Refrigerante", "Pão", "Carne"}  # o preparado não controla estoque
    assert (
        linhas["Refrigerante"]["abaixo_minimo"] is True
        and linhas["Refrigerante"]["categoria"] == "Bebidas"
    )
    assert linhas["Pão"]["custo_medio"] == "0.6667" and linhas["Pão"]["valor_em_estoque"] == "40.00"
    assert linhas["Carne"]["valor_em_estoque"] == "300.00"
    assert (
        r["produtos_qtd"] == 3
        and r["abaixo_minimo_qtd"] == 1
        and r["valor_total_em_estoque"] == "340.00"
    )
    assert pdv.get("/relatorios/estoque", abaixo_minimo=True).json()["produtos_qtd"] == 1
    assert pdv.get("/relatorios/estoque", tipo="insumo").json()["produtos_qtd"] == 2
    assert pdv.get("/relatorios/estoque", categoria_id=cat["id"]).json()["produtos_qtd"] == 1


def test_relatorio_de_perdas_usa_o_custo_da_hora(pdv):
    c = pdv.c
    carne = pdv.carne  # custo inicial 30

    def perda(qtd):
        return c.post(
            "/api/v1/estoque/ajustes",
            headers=pdv.h,
            json={
                "produto_id": carne["id"],
                "tipo": "perda",
                "quantidade": qtd,
                "justificativa": "estragou",
            },
        )

    assert perda("1").status_code == 201  # 1 kg a R$ 30,00
    c.post(
        "/api/v1/estoque/entradas",
        headers=pdv.h,
        json={"produto_id": carne["id"], "quantidade": "9", "custo_unitario": "50"},
    )  # custo médio sobe para 41,00... (9*30+9*50)/18 = 40
    assert perda("2").status_code == 201  # 2 kg ao custo médio da hora (R$ 40,00)
    pdv.c.post(
        "/api/v1/estoque/ajustes",
        headers=pdv.h,
        json={
            "produto_id": pdv.refri["id"],
            "tipo": "saida",
            "quantidade": "3",
            "justificativa": "consumo interno",
        },
    )
    hoje = hoje_local()
    r = pdv.get("/relatorios/perdas", de=hoje, ate=hoje).json()
    assert [
        (x["produto"], x["quantidade"], x["ocorrencias"], x["custo_estimado"]) for x in r["linhas"]
    ] == [("Carne", "3.000", 2, "110.00")]  # 1*30 + 2*40
    assert (
        r["custo_total"] == "110.00" and r["ocorrencias"] == 2
    )  # saída/consumo não entra como perda
    assert pdv.get("/relatorios/perdas", de="2020-01-01", ate="2020-01-31").json()["linhas"] == []
    mov = pdv.get("/estoque/movimentos", tipo="perda").json()["itens"]
    assert [m["custo_unitario"] for m in mov] == [
        "40.0000",
        "30.0000",
    ]  # custo congelado no movimento


def test_custo_da_hora_e_gravado_em_vendas_e_ajustes_mas_nao_na_entrada_sem_custo(pdv):
    pdv.c.post(
        "/api/v1/estoque/entradas",
        headers=pdv.h,
        json={"produto_id": pdv.refri["id"], "quantidade": "1"},
    )
    entradas = pdv.get("/estoque/movimentos", tipo="entrada", produto_id=pdv.refri["id"]).json()[
        "itens"
    ]
    assert entradas[0]["custo_unitario"] is None
    assert Decimal(pdv.get(f"/produtos/{pdv.carne['id']}").json()["custo_medio"]) == Decimal("30")
