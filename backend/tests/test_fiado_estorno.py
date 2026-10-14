from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from conftest import auditoria, consultar, criar_usuario, login
from test_vendas import comanda_35, contagens, esperado, fechar_como, operador


def cliente_fiado(pdv, nome="Cliente Fiel", aceita=True, limite="0"):
    r = pdv.post(
        "/pessoas",
        {
            "tipo": "F",
            "nome": nome,
            "papeis": ["cliente"],
            "cliente": {"aceita_fiado": aceita, "limite_fiado": limite},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def vender_fiado(pdv, cliente, valor="35", cli=None, h=None, comanda=None, extra_pg=()):
    c = comanda or comanda_35(pdv, balcao=True)
    pagamentos = [*extra_pg, pdv.pg("fiado", valor)]
    return fechar_como(cli or pdv.c, h or pdv.h, c["id"], pagamentos, cliente_id=cliente["id"])


# --- fiado --------------------------------------------------------------------------------------


def test_fiado_gera_titulo_e_nao_entra_no_caixa(pdv):
    cliente = cliente_fiado(pdv)
    r = vender_fiado(pdv, cliente)
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["cliente"]["id"] == cliente["id"] and v["pagamentos"][0]["tipo"] == "fiado"
    assert esperado(pdv) == {"dinheiro": "100.00"}  # nada entrou no caixa
    assert contagens(pdv)["mov_caixa_venda"] == 0 and contagens(pdv)["titulos"] == 1

    [t] = pdv.get("/contas-receber").json()["itens"]
    assert (t["valor_original"], t["valor_pago"], t["saldo"], t["status"]) == (
        "35.00",
        "0.00",
        "35.00",
        "aberto",
    )
    assert (
        t["pessoa"]["id"] == cliente["id"]
        and t["venda_id"] == v["id"]
        and "fiado" in t["descricao"]
    )
    saldo = pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()
    assert (
        saldo["saldo_aberto"] == "35.00"
        and saldo["titulos_abertos"] == 1
        and saldo["limite_disponivel"] is None
    )


def test_fiado_misto_com_outra_forma(pdv):
    cliente = cliente_fiado(pdv)
    r = vender_fiado(pdv, cliente, valor="15", extra_pg=[pdv.pg("pix", "20")])
    assert r.status_code == 201
    assert esperado(pdv) == {"dinheiro": "100.00", "pix": "20.00"}
    assert pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()["saldo_aberto"] == "15.00"


def test_fiado_exige_permissao_cliente_e_habilitacao(pdv):
    cliente = cliente_fiado(pdv)
    frente, hf = operador(pdv, "Frente", "frente@x.com", "Frente de loja")
    c = comanda_35(pdv)
    r = vender_fiado(pdv, cliente, cli=frente, h=hf, comanda=c)
    assert (
        r.status_code == 403 and r.json()["erro"]["codigo"] == "sem_permissao"
    )  # frente não tem vendas.fiado

    sem_cliente = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("fiado", "35")])
    assert sem_cliente.json()["erro"]["codigo"] == "fiado_sem_cliente"
    nao_aceita = cliente_fiado(pdv, "Sem Fiado", aceita=False)
    assert vender_fiado(pdv, nao_aceita, comanda=c).json()["erro"]["codigo"] == "cliente_sem_fiado"
    fornecedor = pdv.post(
        "/pessoas", {"tipo": "J", "nome": "Atacado", "papeis": ["fornecedor"]}
    ).json()
    assert vender_fiado(pdv, fornecedor, comanda=c).json()["erro"]["codigo"] == "cliente_sem_fiado"
    assert vender_fiado(pdv, {"id": 9999}, comanda=c).json()["erro"]["codigo"] == "cliente_invalido"
    assert contagens(pdv)["vendas"] == 0 and contagens(pdv)["titulos"] == 0

    # com a permissão (gerente), passa
    ger, hg = operador(pdv, "Ger", "ger@x.com", "Gerente")
    assert vender_fiado(pdv, cliente, cli=ger, h=hg, comanda=c).status_code == 201


def test_limite_de_fiado(pdv):
    cliente = cliente_fiado(pdv, limite="100")
    assert vender_fiado(pdv, cliente, valor="35").status_code == 201  # 35 em aberto
    r = vender_fiado(pdv, cliente, valor="35")  # 70
    assert r.status_code == 201
    saldo = pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()
    assert (
        saldo["saldo_aberto"] == "70.00"
        and saldo["limite_disponivel"] == "30.00"
        and saldo["limite_fiado"] == "100.00"
    )
    estoura = vender_fiado(pdv, cliente, valor="35")  # 105 > 100
    assert (
        estoura.status_code == 409 and estoura.json()["erro"]["codigo"] == "limite_fiado_excedido"
    )
    assert contagens(pdv)["vendas"] == 2 and contagens(pdv)["titulos"] == 2
    # pagar libera limite
    titulo = pdv.get("/contas-receber").json()["itens"][-1]
    pdv.post(
        f"/contas-receber/{titulo['id']}/baixas",
        {"valor": "35", "forma_pagamento_id": pdv.formas["pix"]},
    )
    assert vender_fiado(pdv, cliente, valor="35", comanda=None).status_code == 201


def test_limite_de_fiado_com_vendas_simultaneas(pdv):
    cliente = cliente_fiado(pdv, limite="50")
    comandas = [comanda_35(pdv, mesa=pdv.mesa1), comanda_35(pdv, mesa=pdv.mesa2)]

    def vender(c):
        with pdv.ambiente.cliente() as cli:
            return vender_fiado(pdv, cliente, valor="35", cli=cli, comanda=c).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        codigos = list(pool.map(vender, comandas))
    assert sorted(codigos) == [201, 409]  # só uma cabe no limite de 50
    assert pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()["saldo_aberto"] == "35.00"


def test_baixa_parcial_total_e_regras(pdv):
    cliente = cliente_fiado(pdv)
    vender_fiado(pdv, cliente)
    t = pdv.get("/contas-receber").json()["itens"][0]
    url = f"/contas-receber/{t['id']}/baixas"
    dinheiro, pix, fiado = pdv.formas["dinheiro"], pdv.formas["pix"], pdv.formas["fiado"]

    assert pdv.post(url, {"valor": "0", "forma_pagamento_id": dinheiro}).status_code == 422
    assert (
        pdv.post(url, {"valor": "10", "forma_pagamento_id": fiado}).json()["erro"]["codigo"]
        == "forma_invalida"
    )
    assert (
        pdv.post(url, {"valor": "35.01", "forma_pagamento_id": dinheiro}).json()["erro"]["codigo"]
        == "valor_acima_do_saldo"
    )

    r = pdv.post(url, {"valor": "10", "forma_pagamento_id": dinheiro, "observacao": "adiantamento"})
    assert r.status_code == 201
    assert (r.json()["valor_pago"], r.json()["saldo"], r.json()["status"]) == (
        "10.00",
        "25.00",
        "aberto",
    )
    assert esperado(pdv) == {"dinheiro": "110.00"}  # o recebimento entra no caixa de quem recebeu
    assert pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()["saldo_aberto"] == "25.00"

    r = pdv.post(url, {"valor": "25", "forma_pagamento_id": pix})
    assert (
        r.json()["status"] == "pago"
        and r.json()["saldo"] == "0.00"
        and len(r.json()["baixas"]) == 2
    )
    assert esperado(pdv) == {"dinheiro": "110.00", "pix": "25.00"}
    assert (
        pdv.post(url, {"valor": "1", "forma_pagamento_id": pix}).json()["erro"]["codigo"]
        == "titulo_nao_aberto"
    )
    assert pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()["saldo_aberto"] == "0.00"
    assert len(auditoria(pdv.ambiente, acao="PAGAMENTO", recurso="titulo_receber")) == 2
    assert pdv.get("/contas-receber", status="pago").json()["total"] == 1
    assert pdv.get("/contas-receber", pessoa_id=cliente["id"]).json()["total"] == 1


def test_baixa_exige_caixa_aberto_do_operador(pdv):
    cliente = cliente_fiado(pdv)
    vender_fiado(pdv, cliente)
    t = pdv.get("/contas-receber").json()["itens"][0]
    frente, hf = operador(pdv, "Frente", "frente@x.com", "Frente de loja", caixa=None)
    r = frente.post(
        f"/api/v1/contas-receber/{t['id']}/baixas",
        headers=hf,
        json={"valor": "5", "forma_pagamento_id": pdv.formas["pix"]},
    )
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "caixa_fechado"
    assert pdv.get(f"/contas-receber/{t['id']}").json()["valor_pago"] == "0.00"


def test_historico_e_saldo_do_cliente(pdv):
    cliente = cliente_fiado(pdv)
    c = comanda_35(pdv, cliente_id=cliente["id"])
    fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "20"), pdv.pg("fiado", "15")])
    h = pdv.get(f"/pessoas/{cliente['id']}/historico").json()
    assert [x["id"] for x in h["comandas"]] == [c["id"]] and h["comandas"][0]["total"] == "35.00"
    assert {(p["forma"], p["valor"]) for p in h["pagamentos"]} == {
        ("PIX", "20.00"),
        ("Fiado", "15.00"),
    }
    assert h["titulos"][0]["valor_original"] == "15.00"
    assert pdv.get("/pessoas/9999/historico").status_code == 404
    assert pdv.get("/pessoas/9999/saldo-aberto").status_code == 404


def test_categorias_financeiras(pdv):
    cats = pdv.get("/categorias-financeiras").json()
    assert [(c["nome"], c["tipo"]) for c in cats] == [("Vendas fiado", "receita")]
    nova = pdv.post("/categorias-financeiras", {"nome": "Aluguel", "tipo": "despesa"})
    assert nova.status_code == 201
    assert (
        pdv.post("/categorias-financeiras", {"nome": "aluguel", "tipo": "despesa"}).json()["erro"][
            "codigo"
        ]
        == "categoria_nome_em_uso"
    )
    assert (
        pdv.c.patch(
            f"/api/v1/categorias-financeiras/{nova.json()['id']}",
            headers=pdv.h,
            json={"ativa": False},
        ).json()["ativa"]
        is False
    )
    assert (
        pdv.c.delete(
            f"/api/v1/categorias-financeiras/{nova.json()['id']}", headers=pdv.h
        ).status_code
        == 204
    )
    cliente = cliente_fiado(pdv)
    vender_fiado(pdv, cliente)
    usada = cats[0]["id"]
    assert (
        pdv.c.delete(f"/api/v1/categorias-financeiras/{usada}", headers=pdv.h).json()["erro"][
            "codigo"
        ]
        == "categoria_em_uso"
    )


# --- estorno ------------------------------------------------------------------------------------


def test_estorno_devolve_caixa_e_estoque_sem_alterar_o_historico(pdv):
    c = comanda_35(pdv)
    v = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "20"), pdv.pg("dinheiro", "15")]).json()
    assert esperado(pdv) == {"dinheiro": "115.00", "pix": "20.00"}

    r = pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "pedido lançado errado"})
    assert r.status_code == 200, r.text
    e = r.json()["estorno"]
    assert e["motivo"] == "pedido lançado errado" and e["por"] == "Admin Teste"
    assert esperado(pdv) == {"dinheiro": "100.00", "pix": "0.00"}
    assert pdv.saldo(pdv.refri) == 100 and pdv.saldo(pdv.pao) == 50 and pdv.saldo(pdv.carne) == 10

    # o histórico original continua lá, e o estorno são lançamentos novos
    assert contagens(pdv)["vendas"] == 1 and contagens(pdv)["mov_caixa_venda"] == 2
    tipos = consultar(pdv.ambiente, "SELECT tipo, valor FROM movimento_caixa ORDER BY id")
    assert [(t["tipo"], t["valor"]) for t in tipos] == [
        ("abertura", Decimal(100)),
        ("venda", Decimal(20)),
        ("venda", Decimal(15)),
        ("estorno_venda", Decimal(-20)),
        ("estorno_venda", Decimal(-15)),
    ]
    est = consultar(
        pdv.ambiente, "SELECT tipo, quantidade FROM movimento_estoque WHERE tipo = 'estorno_venda'"
    )
    assert len(est) == 3 and all(m["quantidade"] > 0 for m in est)
    assert pdv.get(f"/vendas/{v['id']}").json()["total"] == "35.00"
    [log] = auditoria(pdv.ambiente, acao="ESTORNO")
    assert log["recurso_id"] == str(v["id"]) and "pedido lançado errado" in log["descricao"]

    lista = pdv.get("/vendas").json()["itens"]
    assert lista[0]["estornada"] is True
    assert pdv.get("/vendas", status="estornadas").json()["total"] == 1
    assert pdv.get("/vendas", status="validas").json()["total"] == 0
    cx = pdv.get(f"/caixas/{pdv.caixa['id']}").json()
    # o que entrou no caixa não muda retroativamente; a devolução aparece como estorno
    assert (cx["vendas_qtd"], cx["vendas_total"], cx["estornos_total"]) == (1, "35.00", "35.00")


def test_estorno_so_uma_vez_e_com_motivo(pdv):
    v = fechar_como(pdv.c, pdv.h, comanda_35(pdv)["id"], [pdv.pg("pix", "35")]).json()
    assert pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "x"}).status_code == 422
    assert pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "primeiro"}).status_code == 200
    r = pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "segundo"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "venda_ja_estornada"
    assert pdv.post("/vendas/9999/estornar", {"motivo": "nao existe"}).status_code == 404
    assert pdv.saldo(pdv.refri) == 100  # estoque devolvido uma única vez
    assert (
        len(consultar(pdv.ambiente, "SELECT 1 FROM movimento_estoque WHERE tipo = 'estorno_venda'"))
        == 3
    )


def test_estornos_simultaneos_da_mesma_venda_aplicam_uma_vez(pdv):
    v = fechar_como(pdv.c, pdv.h, comanda_35(pdv)["id"], [pdv.pg("dinheiro", "35")]).json()

    def estornar(_):
        with pdv.ambiente.cliente() as cli:
            return cli.post(
                f"/api/v1/vendas/{v['id']}/estornar", headers=pdv.h, json={"motivo": "corrida"}
            ).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codigos = list(pool.map(estornar, range(6)))
    assert sorted(codigos) == [200] + [409] * 5
    assert esperado(pdv) == {"dinheiro": "100.00"} and pdv.saldo(pdv.refri) == 100


def test_estorno_exige_permissao_e_caixa_aberto_de_quem_estorna(pdv):
    v = fechar_como(pdv.c, pdv.h, comanda_35(pdv)["id"], [pdv.pg("dinheiro", "35")]).json()
    frente, hf = operador(pdv, "Frente", "frente@x.com", "Frente de loja")
    assert (
        frente.post(
            f"/api/v1/vendas/{v['id']}/estornar", headers=hf, json={"motivo": "quero"}
        ).status_code
        == 403
    )

    ger, hg = operador(pdv, "Ger", "ger@x.com", "Gerente", caixa=None)
    r = ger.post(
        f"/api/v1/vendas/{v['id']}/estornar", headers=hg, json={"motivo": "pedido do cliente"}
    )
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "caixa_fechado"
    assert contagens(pdv)["vendas"] == 1 and pdv.saldo(pdv.refri) == 98  # nada foi desfeito

    # caixa vazio: não há dinheiro na gaveta para devolver os 35,00
    ger.post("/api/v1/caixas/abrir", headers=hg, json={"valor_abertura": "0"})
    r = ger.post(
        f"/api/v1/vendas/{v['id']}/estornar", headers=hg, json={"motivo": "pedido do cliente"}
    )
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "saldo_dinheiro_insuficiente"
    assert pdv.saldo(pdv.refri) == 98  # nada foi desfeito
    ger.post(
        f"/api/v1/caixas/{ger.get('/api/v1/caixas/atual', headers=hg).json()['id']}/movimentos",
        headers=hg,
        json={"tipo": "reforco", "valor": "100", "descricao": "troco para devoluções"},
    )
    assert (
        ger.post(
            f"/api/v1/vendas/{v['id']}/estornar", headers=hg, json={"motivo": "pedido do cliente"}
        ).status_code
        == 200
    )
    # o inverso entra no caixa do gerente, que devolveu o dinheiro; o do admin segue com o original
    caixa_ger = ger.get("/api/v1/caixas/atual", headers=hg).json()
    assert {e["tipo"]: e["esperado"] for e in caixa_ger["esperado"]} == {"dinheiro": "65.00"}
    assert caixa_ger["estornos_total"] == "35.00"
    assert esperado(pdv) == {"dinheiro": "135.00"}


def test_estorno_de_venda_fiado_cancela_o_titulo(pdv):
    cliente = cliente_fiado(pdv)
    v = vender_fiado(pdv, cliente).json()
    ger, hg = operador(
        pdv, "Ger", "ger@x.com", "Gerente", caixa=None
    )  # sem caixa: não há dinheiro a devolver
    r = ger.post(
        f"/api/v1/vendas/{v['id']}/estornar", headers=hg, json={"motivo": "venda indevida"}
    )
    assert r.status_code == 200, r.text
    t = pdv.get("/contas-receber").json()["itens"][0]
    assert t["status"] == "cancelado" and "venda indevida" in t["cancelado_motivo"]
    assert pdv.get(f"/pessoas/{cliente['id']}/saldo-aberto").json()["saldo_aberto"] == "0.00"
    r = pdv.post(
        f"/contas-receber/{t['id']}/baixas", {"valor": "1", "forma_pagamento_id": pdv.formas["pix"]}
    )
    assert r.json()["erro"]["codigo"] == "titulo_nao_aberto"


def test_estorno_de_venda_fiado_ja_parcialmente_paga_devolve_os_recebimentos(pdv):
    cliente = cliente_fiado(pdv)
    v = vender_fiado(pdv, cliente).json()
    t = pdv.get("/contas-receber").json()["itens"][0]
    pdv.post(
        f"/contas-receber/{t['id']}/baixas",
        {"valor": "10", "forma_pagamento_id": pdv.formas["dinheiro"]},
    )
    assert esperado(pdv) == {"dinheiro": "110.00"}

    # sem caixa aberto não dá para devolver o dinheiro que o cliente pagou
    ger, hg = operador(pdv, "Ger", "ger@x.com", "Gerente", caixa=None)
    r = ger.post(
        f"/api/v1/vendas/{v['id']}/estornar", headers=hg, json={"motivo": "venda indevida"}
    )
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "caixa_fechado"
    assert pdv.get(f"/contas-receber/{t['id']}").json()["status"] == "aberto"

    assert pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "venda indevida"}).status_code == 200
    t = pdv.get(f"/contas-receber/{t['id']}").json()
    assert (t["status"], t["valor_pago"]) == ("cancelado", "0.00")
    assert [b["valor"] for b in t["baixas"]] == ["10.00", "-10.00"] and t["baixas"][1][
        "estorno_de_id"
    ] == t["baixas"][0]["id"]
    assert esperado(pdv) == {"dinheiro": "100.00"}


# --- invariantes --------------------------------------------------------------------------------


def test_invariantes_de_caixa_e_estoque_depois_de_uma_sequencia_mista(pdv):
    cliente = cliente_fiado(pdv)
    for _ in range(3):
        c = comanda_35(pdv, balcao=True)
        fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "20"), pdv.pg("dinheiro", "15")])
    v = vender_fiado(pdv, cliente).json()
    t = pdv.get("/contas-receber").json()["itens"][0]
    pdv.post(
        f"/contas-receber/{t['id']}/baixas",
        {"valor": "12.34", "forma_pagamento_id": pdv.formas["dinheiro"]},
    )
    pdv.post(f"/vendas/{v['id']}/estornar", {"motivo": "teste de invariante"})
    primeira = pdv.get("/vendas").json()["itens"][-1]
    pdv.post(f"/vendas/{primeira['id']}/estornar", {"motivo": "outra"})
    pdv.post(
        f"/caixas/{pdv.caixa['id']}/movimentos",
        {"tipo": "sangria", "valor": "20", "descricao": "sangria"},
    )

    # saldo de cada produto = soma dos seus movimentos
    divergentes = consultar(
        pdv.ambiente,
        """SELECT s.produto_id FROM estoque_saldo s
           LEFT JOIN movimento_estoque m ON m.produto_id = s.produto_id
           GROUP BY s.produto_id, s.quantidade
           HAVING s.quantidade <> COALESCE(SUM(m.quantidade), 0)""",
    )
    assert divergentes == []
    # o último saldo_apos de cada produto bate com o saldo
    ultimos = consultar(
        pdv.ambiente,
        """SELECT s.produto_id FROM estoque_saldo s
           JOIN LATERAL (SELECT saldo_apos FROM movimento_estoque m WHERE m.produto_id = s.produto_id ORDER BY id DESC LIMIT 1) u ON true
           WHERE u.saldo_apos <> s.quantidade""",
    )
    assert ultimos == []
    # caixa: esperado por forma = soma dos movimentos
    por_forma = {
        e["tipo"]: Decimal(e["esperado"])
        for e in pdv.get(f"/caixas/{pdv.caixa['id']}").json()["esperado"]
    }
    soma = consultar(
        pdv.ambiente,
        "SELECT f.tipo, sum(m.valor) AS s FROM movimento_caixa m JOIN forma_pagamento f ON f.id = m.forma_pagamento_id GROUP BY f.tipo",
    )
    assert {r["tipo"]: r["s"] for r in soma} == por_forma
    # todo movimento de caixa e de estoque de origem de venda aponta para uma venda real
    orfaos = consultar(
        pdv.ambiente,
        "SELECT count(*) AS n FROM movimento_estoque m WHERE m.origem_tipo IN ('venda', 'estorno_venda') AND NOT EXISTS (SELECT 1 FROM venda v WHERE v.id = m.origem_id)",
    )
    assert orfaos[0]["n"] == 0
    # títulos: valor_pago = soma líquida das baixas, nunca acima do original
    t_inconsistentes = consultar(
        pdv.ambiente,
        """SELECT t.id FROM titulo_receber t
           LEFT JOIN titulo_receber_baixa b ON b.titulo_id = t.id
           GROUP BY t.id, t.valor_pago, t.valor_original
           HAVING t.valor_pago <> COALESCE(SUM(b.valor), 0) OR t.valor_pago > t.valor_original""",
    )
    assert t_inconsistentes == []


# --- fluxo ponta a ponta pela API ----------------------------------------------------------------


def test_fluxo_completo_login_mesa_itens_fechamento_caixa_e_estoque(pdv):
    """login -> abrir caixa -> abrir mesa -> lançar itens -> pedir conta -> fechar comanda ->
    conferir caixa e estoque -> fechar caixa."""
    criar_usuario("Maria Frente", "maria@x.com", papeis=("Frente de loja",))
    cli = pdv.ambiente.cliente()
    h = login(cli, "maria@x.com", "OutraSenha#2026")
    api = lambda caminho: f"/api/v1{caminho}"  # noqa: E731

    cx = cli.post(api("/caixas/abrir"), headers=h, json={"valor_abertura": "200"}).json()
    c = cli.post(
        api("/comandas"),
        headers=h,
        json={"tipo": "mesa", "mesa_id": pdv.mesa1["id"], "num_pessoas": 2},
    ).json()
    for produto, qtd in ((pdv.refri, 2), (pdv.hamb, 2)):
        cli.post(
            api(f"/comandas/{c['id']}/itens"),
            headers=h,
            json={"produto_id": produto["id"], "quantidade": str(qtd)},
        )
    conta = cli.post(api(f"/comandas/{c['id']}/pedir-conta"), headers=h).json()
    assert (
        conta["status"] == "aguardando_pagamento" and conta["totais"]["total"] == "55.00"
    )  # 15 + 40

    partes = cli.get(api(f"/comandas/{c['id']}/divisao"), headers=h, params={"pessoas": 2}).json()[
        "partes"
    ]
    assert partes == ["27.50", "27.50"]
    pagamentos = [
        {"forma_pagamento_id": pdv.formas["pix"], "valor": partes[0]},
        {"forma_pagamento_id": pdv.formas["dinheiro"], "valor": partes[1], "valor_recebido": "50"},
    ]
    venda = cli.post(
        api(f"/comandas/{c['id']}/fechar"), headers=h, json={"pagamentos": pagamentos}
    ).json()
    assert venda["total"] == "55.00" and venda["troco_total"] == "22.50"

    meu = cli.get(api("/caixas/atual"), headers=h).json()
    assert {e["tipo"]: e["esperado"] for e in meu["esperado"]} == {
        "dinheiro": "227.50",
        "pix": "27.50",
    }
    assert meu["vendas_qtd"] == 1 and meu["vendas_total"] == "55.00"
    assert (
        pdv.saldo(pdv.refri) == 98
        and pdv.saldo(pdv.pao) == 48
        and pdv.saldo(pdv.carne) == Decimal("9.7")
    )

    fechado = cli.post(
        api(f"/caixas/{cx['id']}/fechar"),
        headers=h,
        json={
            "conferencias": [
                {"forma_pagamento_id": pdv.formas["dinheiro"], "valor_contado": "227.50"},
                {"forma_pagamento_id": pdv.formas["pix"], "valor_contado": "27.50"},
            ]
        },
    )
    assert fechado.status_code == 200 and fechado.json()["status"] == "fechado"
    assert [x["diferenca"] for x in fechado.json()["conferencias"]] == ["0.00", "0.00"]
    assert cli.get(api("/caixas/atual"), headers=h).status_code == 404
    # trilha de auditoria completa, com o operador certo
    acoes = {a["acao"] for a in auditoria(pdv.ambiente, usuario_nome="Maria Frente")}
    assert {"LOGIN", "FECHAMENTO_COMANDA", "PAGAMENTO", "FECHAMENTO_CAIXA"} <= acoes
