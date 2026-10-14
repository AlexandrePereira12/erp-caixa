from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from conftest import auditoria, consultar, criar_usuario, login


def operador(pdv, nome, email, papel, caixa="0"):
    """Cliente autenticado de outro usuário; abre o caixa dele quando `caixa` não é None."""
    criar_usuario(nome, email, papeis=(papel,))
    cli = pdv.ambiente.cliente()
    h = login(cli, email, "OutraSenha#2026")
    if caixa is not None:
        r = cli.post("/api/v1/caixas/abrir", headers=h, json={"valor_abertura": caixa})
        assert r.status_code == 201, r.text
    return cli, h


def fechar_como(cli, h, comanda_id, pagamentos, **extra):
    return cli.post(
        f"/api/v1/comandas/{comanda_id}/fechar", headers=h, json={"pagamentos": pagamentos, **extra}
    )


def comanda_35(pdv, mesa=None, balcao=False, **extra):
    """2 refrigerantes (15,00) + 1 hambúrguer (20,00) = 35,00. `balcao=True` não ocupa mesa."""
    c = (
        pdv.post("/comandas", {"tipo": "balcao", **extra}).json()
        if balcao
        else pdv.comanda(mesa, **extra)
    )
    pdv.item(c, pdv.refri, 2)
    pdv.item(c, pdv.hamb, 1)
    return c


def esperado(pdv, caixa_id=None):
    cx = pdv.get(f"/caixas/{caixa_id or pdv.caixa['id']}").json()
    return {e["tipo"]: e["esperado"] for e in cx["esperado"]}


def contagens(pdv):
    q = lambda sql: consultar(pdv.ambiente, sql)[0]["n"]  # noqa: E731
    return {
        "vendas": q("SELECT count(*) AS n FROM venda"),
        "pagamentos": q("SELECT count(*) AS n FROM venda_pagamento"),
        "mov_caixa_venda": q("SELECT count(*) AS n FROM movimento_caixa WHERE tipo = 'venda'"),
        "mov_estoque_venda": q("SELECT count(*) AS n FROM movimento_estoque WHERE tipo = 'venda'"),
        "titulos": q("SELECT count(*) AS n FROM titulo_receber"),
    }


# --- fechamento: caminho feliz ------------------------------------------------------------------


def test_fechar_comanda_em_dinheiro_com_troco_atualiza_tudo(pdv):
    c = comanda_35(pdv)
    r = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("dinheiro", "35", valor_recebido="50")])
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["total"] == "35.00" and v["subtotal"] == "35.00" and v["troco_total"] == "15.00"
    assert v["pagamentos"][0]["troco"] == "15.00" and v["pagamentos"][0]["tipo"] == "dinheiro"
    assert [i["descricao"] for i in v["itens"]] == ["Refrigerante", "Hambúrguer"]
    assert v["operador"] == "Admin Teste" and v["caixa_id"] == pdv.caixa["id"]

    comanda = pdv.get(f"/comandas/{c['id']}").json()
    assert (
        comanda["status"] == "fechada" and comanda["venda_id"] == v["id"] and comanda["fechada_em"]
    )
    assert (
        next(m for m in pdv.get("/mesas").json() if m["id"] == pdv.mesa1["id"])["status"] == "livre"
    )

    assert esperado(pdv) == {"dinheiro": "135.00"}  # abertura 100 + 35 (o troco não entra)
    assert pdv.saldo(pdv.refri) == 98
    assert pdv.saldo(pdv.pao) == 49  # ficha técnica: pão
    assert pdv.saldo(pdv.carne) == Decimal("9.85")  # ficha técnica: 0,150 kg
    assert contagens(pdv) == {
        "vendas": 1,
        "pagamentos": 1,
        "mov_caixa_venda": 1,
        "mov_estoque_venda": 3,
        "titulos": 0,
    }
    movs = consultar(
        pdv.ambiente, "SELECT origem_tipo, origem_id FROM movimento_estoque WHERE tipo = 'venda'"
    )
    assert {(m["origem_tipo"], m["origem_id"]) for m in movs} == {("venda", v["id"])}

    [f] = auditoria(pdv.ambiente, acao="FECHAMENTO_COMANDA")
    assert f["recurso_id"] == str(v["id"]) and f["usuario_nome"] == "Admin Teste"
    assert len(auditoria(pdv.ambiente, acao="PAGAMENTO")) == 1
    detalhe = pdv.get(f"/vendas/{v['id']}").json()
    assert detalhe["id"] == v["id"] and detalhe["estorno"] is None
    assert pdv.get("/vendas").json()["itens"][0]["estornada"] is False


def test_comanda_fechada_e_imutavel(pdv):
    c = comanda_35(pdv)
    assert fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "35")]).status_code == 201
    item_id = pdv.get(f"/comandas/{c['id']}").json()["itens"][0]["id"]
    base = f"/comandas/{c['id']}"
    r = pdv.post(f"{base}/itens", {"produto_id": pdv.refri["id"], "quantidade": "1"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "comanda_nao_aberta"
    assert (
        pdv.c.patch(
            f"/api/v1{base}/itens/{item_id}", headers=pdv.h, json={"quantidade": "5"}
        ).status_code
        == 409
    )
    assert (
        pdv.post(f"{base}/itens/{item_id}/cancelar", {"motivo": "tarde demais"}).status_code == 409
    )
    assert pdv.post(f"{base}/cancelar", {"motivo": "tarde demais"}).status_code == 409
    assert (
        pdv.post(
            f"{base}/ajustes",
            {"tipo": "desconto", "modo": "valor", "valor": "1", "justificativa": "tarde"},
        ).status_code
        == 409
    )
    assert pdv.post(f"{base}/transferir", {"mesa_id": pdv.mesa2["id"]}).status_code == 409
    assert pdv.post(f"{base}/pedir-conta").status_code == 409
    again = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "35")])
    assert again.status_code == 409 and again.json()["erro"]["codigo"] == "comanda_nao_aberta"
    assert contagens(pdv)["vendas"] == 1


def test_pagamento_dividido_entra_por_forma_no_caixa(pdv):
    c = comanda_35(pdv)
    pagamentos = [
        pdv.pg("pix", "10"),
        pdv.pg("debito", "10"),
        pdv.pg("credito", "5", parcelas=2),
        pdv.pg("dinheiro", "10", valor_recebido="10"),
    ]
    r = fechar_como(pdv.c, pdv.h, c["id"], pagamentos)
    assert r.status_code == 201, r.text
    assert [p["tipo"] for p in r.json()["pagamentos"]] == ["pix", "debito", "credito", "dinheiro"]
    assert r.json()["pagamentos"][2]["parcelas"] == 2 and r.json()["troco_total"] == "0.00"
    assert esperado(pdv) == {
        "dinheiro": "110.00",
        "pix": "10.00",
        "debito": "10.00",
        "credito": "5.00",
    }
    assert (
        contagens(pdv)["mov_caixa_venda"] == 4
        and len(auditoria(pdv.ambiente, acao="PAGAMENTO")) == 4
    )


def test_totais_com_taxa_desconto_e_acrescimo_vem_do_backend(pdv):
    pdv.c.patch("/api/v1/configuracoes", headers=pdv.h, json={"taxa_servico_pct": "10"})
    c = comanda_35(pdv)
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "desconto", "modo": "percentual", "valor": "10", "justificativa": "fidelidade"},
    )
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "acrescimo", "modo": "valor", "valor": "2", "justificativa": "embalagem"},
    )
    # 35,00 - 3,50 = 31,50; taxa 10% = 3,15; + 2,00 = 36,65
    errado = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "35")])
    assert (
        errado.status_code == 422
        and errado.json()["erro"]["codigo"] == "pagamento_diferente_do_total"
    )
    assert errado.json()["erro"]["detalhes"] == {"total": "36.65", "informado": "35.00"}
    r = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "36.65")])
    v = r.json()
    assert (
        v["subtotal"],
        v["desconto_total"],
        v["acrescimo_total"],
        v["taxa_servico"],
        v["total"],
    ) == (
        "35.00",
        "3.50",
        "2.00",
        "3.15",
        "36.65",
    )


def test_comanda_de_valor_zero_fecha_sem_pagamento(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {
            "tipo": "desconto",
            "modo": "percentual",
            "valor": "100",
            "justificativa": "cortesia da casa",
        },
    )
    assert (
        fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "1")]).json()["erro"]["codigo"]
        == "pagamento_indevido"
    )
    r = fechar_como(pdv.c, pdv.h, c["id"], [])
    assert r.status_code == 201 and r.json()["total"] == "0.00" and r.json()["pagamentos"] == []
    assert pdv.saldo(pdv.refri) == 99  # o estoque baixa mesmo sendo cortesia
    assert contagens(pdv)["mov_caixa_venda"] == 0


def test_agrega_o_mesmo_produto_em_um_unico_movimento_de_estoque(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    pdv.item(c, pdv.refri, 2)
    pdv.item(c, pdv.hamb, 2)
    pdv.item(c, pdv.hamb, 1)
    r = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "82.50")])  # 3*7.50 + 3*20
    assert r.status_code == 201, r.text
    assert (
        pdv.saldo(pdv.refri) == 97
        and pdv.saldo(pdv.pao) == 47
        and pdv.saldo(pdv.carne) == Decimal("9.55")
    )
    por_produto = consultar(
        pdv.ambiente,
        "SELECT produto_id, quantidade FROM movimento_estoque WHERE tipo = 'venda' ORDER BY produto_id",
    )
    assert [(m["produto_id"], m["quantidade"]) for m in por_produto] == [
        (pdv.refri["id"], Decimal("-3")),
        (pdv.pao["id"], Decimal("-3")),
        (pdv.carne["id"], Decimal("-0.45")),
    ]


def test_item_cancelado_nao_entra_na_venda_nem_baixa_estoque(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 2)
    cancelado = pdv.item(c, pdv.hamb, 1)["itens"][1]
    pdv.post(f"/comandas/{c['id']}/itens/{cancelado['id']}/cancelar", {"motivo": "pedido errado"})
    r = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "15")])
    assert r.status_code == 201 and [i["descricao"] for i in r.json()["itens"]] == ["Refrigerante"]
    assert pdv.saldo(pdv.pao) == 50 and pdv.saldo(pdv.carne) == 10


# --- fechamento: validações ---------------------------------------------------------------------


def test_validacoes_de_pagamento(pdv):
    c = comanda_35(pdv)
    f = lambda pagamentos, **kw: fechar_como(pdv.c, pdv.h, c["id"], pagamentos, **kw)  # noqa: E731
    assert f([]).json()["erro"]["codigo"] == "pagamento_obrigatorio"
    assert f([pdv.pg("pix", "34.99")]).json()["erro"]["codigo"] == "pagamento_diferente_do_total"
    assert f([pdv.pg("pix", "35.01")]).json()["erro"]["codigo"] == "pagamento_diferente_do_total"
    assert f([pdv.pg("pix", "0")]).status_code == 422
    assert (
        f([pdv.pg("dinheiro", "35", valor_recebido="30")]).json()["erro"]["codigo"]
        == "valor_recebido_invalido"
    )
    assert (
        f([pdv.pg("pix", "35", valor_recebido="40")]).json()["erro"]["codigo"]
        == "valor_recebido_invalido"
    )
    assert (
        f([pdv.pg("dinheiro", "35", parcelas=2)]).json()["erro"]["codigo"] == "parcelas_invalidas"
    )
    assert f([{"forma_pagamento_id": 9999, "valor": "35"}]).status_code == 404
    assert f([pdv.pg("fiado", "10"), pdv.pg("fiado", "25")]).json()["erro"]["codigo"] in (
        "fiado_duplicado",
        "fiado_sem_cliente",
    )
    inativa = pdv.post("/formas-pagamento", {"nome": "Cheque", "tipo": "outro"}).json()
    pdv.c.patch(f"/api/v1/formas-pagamento/{inativa['id']}", headers=pdv.h, json={"ativa": False})
    assert (
        f([{"forma_pagamento_id": inativa["id"], "valor": "35"}]).json()["erro"]["codigo"]
        == "forma_inativa"
    )
    vazia = pdv.comanda(pdv.mesa2)
    assert (
        fechar_como(pdv.c, pdv.h, vazia["id"], [pdv.pg("pix", "1")]).json()["erro"]["codigo"]
        == "comanda_vazia"
    )
    assert contagens(pdv)["vendas"] == 0  # nenhuma tentativa deixou rastro
    assert pdv.get(f"/comandas/{c['id']}").json()["status"] == "aberta"


def test_sem_caixa_aberto_nao_fecha(pdv):
    cli, h = operador(pdv, "Frente", "frente@x.com", "Frente de loja", caixa=None)
    c = comanda_35(pdv)
    r = fechar_como(cli, h, c["id"], [pdv.pg("pix", "35")])
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "caixa_fechado"
    assert contagens(pdv)["vendas"] == 0


def test_caixa_fechado_no_meio_barra_o_fechamento(pdv):
    c = comanda_35(pdv)
    forma = pdv.formas["dinheiro"]
    pdv.post(
        f"/caixas/{pdv.caixa['id']}/fechar",
        {"conferencias": [{"forma_pagamento_id": forma, "valor_contado": "100"}]},
    )
    assert (
        fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", "35")]).json()["erro"]["codigo"]
        == "caixa_fechado"
    )


def test_frente_de_loja_fecha_o_proprio_caixa(pdv):
    cli, h = operador(pdv, "Frente", "frente@x.com", "Frente de loja", caixa="50")
    c = comanda_35(pdv)
    r = fechar_como(cli, h, c["id"], [pdv.pg("dinheiro", "35", valor_recebido="40")])
    assert r.status_code == 201 and r.json()["operador"] == "Frente"
    mine = cli.get("/api/v1/caixas/atual", headers=h).json()
    assert {e["tipo"]: e["esperado"] for e in mine["esperado"]} == {"dinheiro": "85.00"}
    assert esperado(pdv) == {"dinheiro": "100.00"}  # o caixa do admin não foi tocado
    assert r.json()["caixa_id"] == mine["id"]


# --- estoque: tudo ou nada ----------------------------------------------------------------------


def test_falta_de_estoque_desfaz_a_venda_inteira(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 2)
    pdv.item(c, pdv.hamb, 67)  # pão: 67 > 50 em estoque (carne 10,05 > 10 também)
    total = pdv.get(f"/comandas/{c['id']}").json()["totais"]["total"]
    antes = {p["nome"]: pdv.saldo(p) for p in (pdv.refri, pdv.pao, pdv.carne)}

    r = fechar_como(pdv.c, pdv.h, c["id"], [pdv.pg("pix", total)])
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "estoque_insuficiente"
    assert r.json()["erro"]["detalhes"]["produto_id"] == pdv.pao["id"]

    # nada foi gravado: sem venda, sem pagamento, sem caixa, sem movimento de estoque, sem baixa
    assert contagens(pdv) == {
        "vendas": 0,
        "pagamentos": 0,
        "mov_caixa_venda": 0,
        "mov_estoque_venda": 0,
        "titulos": 0,
    }
    assert {p["nome"]: pdv.saldo(p) for p in (pdv.refri, pdv.pao, pdv.carne)} == antes
    assert esperado(pdv) == {"dinheiro": "100.00"}
    comanda = pdv.get(f"/comandas/{c['id']}").json()
    assert comanda["status"] == "aberta" and comanda["venda_id"] is None
    assert (
        next(m for m in pdv.get("/mesas").json() if m["id"] == pdv.mesa1["id"])["status"]
        == "ocupada"
    )
    assert not auditoria(pdv.ambiente, acao="FECHAMENTO_COMANDA")
    assert (
        consultar(pdv.ambiente, "SELECT count(*) AS n FROM comanda_evento WHERE tipo = 'fechada'")[
            0
        ]["n"]
        == 0
    )


def test_estoque_negativo_so_com_permissao_e_justificativa(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.hamb, 67)
    total = pdv.get(f"/comandas/{c['id']}").json()["totais"]["total"]
    frente, hf = operador(pdv, "Frente", "frente@x.com", "Frente de loja")
    pg = [pdv.pg("pix", total)]
    r = fechar_como(
        frente, hf, c["id"], pg, permitir_estoque_negativo=True, justificativa_estoque="urgente"
    )
    assert r.status_code == 403  # frente não tem estoque.permitir_negativo

    ger, hg = operador(pdv, "Ger", "ger@x.com", "Gerente")
    sem = fechar_como(ger, hg, c["id"], pg, permitir_estoque_negativo=True)
    assert sem.status_code == 422 and sem.json()["erro"]["codigo"] == "justificativa_obrigatoria"
    assert contagens(pdv)["vendas"] == 0

    ok = fechar_como(
        ger,
        hg,
        c["id"],
        pg,
        permitir_estoque_negativo=True,
        justificativa_estoque="inventário atrasado",
    )
    assert ok.status_code == 201, ok.text
    assert pdv.saldo(pdv.pao) == -17 and pdv.saldo(pdv.carne) == Decimal("-0.05")
    mov = consultar(
        pdv.ambiente,
        "SELECT justificativa FROM movimento_estoque WHERE produto_id = %s AND tipo = 'venda'",
        pdv.pao["id"],
    )[0]
    assert mov["justificativa"] == "inventário atrasado"


# --- concorrência -------------------------------------------------------------------------------


def test_fechamento_concorrente_da_mesma_comanda_gera_uma_unica_venda(pdv):
    c = comanda_35(pdv)

    def fechar(_):
        with pdv.ambiente.cliente() as cli:
            return fechar_como(cli, pdv.h, c["id"], [pdv.pg("dinheiro", "35")]).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codigos = list(pool.map(fechar, range(8)))
    assert sorted(codigos) == [201] + [409] * 7
    assert contagens(pdv) == {
        "vendas": 1,
        "pagamentos": 1,
        "mov_caixa_venda": 1,
        "mov_estoque_venda": 3,
        "titulos": 0,
    }
    assert esperado(pdv) == {"dinheiro": "135.00"}
    assert (
        pdv.saldo(pdv.refri) == 98
        and pdv.saldo(pdv.pao) == 49
        and pdv.saldo(pdv.carne) == Decimal("9.85")
    )
    assert len(auditoria(pdv.ambiente, acao="FECHAMENTO_COMANDA")) == 1


def test_vendas_simultaneas_de_comandas_diferentes_somam_corretamente(pdv):
    comandas = []
    for _ in range(8):
        c = pdv.post("/comandas", {"tipo": "balcao"}).json()
        pdv.item(c, pdv.refri, 1)
        comandas.append(c)

    def fechar(c):
        with pdv.ambiente.cliente() as cli:
            return fechar_como(cli, pdv.h, c["id"], [pdv.pg("pix", "7.50")]).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codigos = list(pool.map(fechar, comandas))
    assert codigos == [201] * 8
    assert pdv.saldo(pdv.refri) == 92
    assert esperado(pdv) == {"dinheiro": "100.00", "pix": "60.00"}
    assert contagens(pdv)["vendas"] == 8


def test_fechar_caixa_e_vender_ao_mesmo_tempo_nao_perde_lancamento(pdv):
    """Ou a venda entra antes do fechamento (e é conferida), ou é recusada: nunca fica de fora."""
    c = comanda_35(pdv)
    forma = pdv.formas["dinheiro"]

    def vender(_):
        with pdv.ambiente.cliente() as cli:
            return fechar_como(cli, pdv.h, c["id"], [pdv.pg("dinheiro", "35")]).status_code

    def fechar_caixa(_):
        with pdv.ambiente.cliente() as cli:
            return cli.post(
                f"/api/v1/caixas/{pdv.caixa['id']}/fechar",
                headers=pdv.h,
                json={
                    "conferencias": [
                        {"forma_pagamento_id": forma, "valor_contado": "135", "justificativa": "ok"}
                    ]
                },
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        venda, fechamento = pool.map(lambda f: f(0), [vender, fechar_caixa])
    movimentos = consultar(
        pdv.ambiente,
        "SELECT sum(valor) AS s FROM movimento_caixa WHERE caixa_id = %s",
        pdv.caixa["id"],
    )[0]["s"]
    conf = consultar(
        pdv.ambiente,
        "SELECT valor_esperado FROM caixa_conferencia WHERE caixa_id = %s",
        pdv.caixa["id"],
    )
    if venda == 201:
        assert movimentos == Decimal("135")
        if fechamento == 200:
            assert conf[0]["valor_esperado"] == Decimal("135")  # fechou depois da venda: conferida
    else:
        assert venda == 409 and fechamento == 200 and movimentos == Decimal("100")
        assert conf[0]["valor_esperado"] == Decimal("100")
