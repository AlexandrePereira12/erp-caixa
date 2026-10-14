from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

from conftest import (
    auditoria,
    consultar,
    criar_papel,
    criar_usuario,
    login,
    novo_produto,
)


def _status_mesa(pdv, mesa):
    return next(m for m in pdv.get("/mesas").json() if m["id"] == mesa["id"])["status"]


def test_mesas_crud_ordem_natural_e_regras(admin):
    c, h = admin
    for nome in ("Mesa 10", "Mesa 2", "Mesa 1"):
        assert c.post("/api/v1/mesas", headers=h, json={"nome": nome}).status_code == 201
    assert [m["nome"] for m in c.get("/api/v1/mesas", headers=h).json()] == [
        "Mesa 1",
        "Mesa 2",
        "Mesa 10",
    ]
    assert (
        c.post("/api/v1/mesas", headers=h, json={"nome": "mesa 1"}).json()["erro"]["codigo"]
        == "mesa_nome_em_uso"
    )
    mesa = c.get("/api/v1/mesas", headers=h).json()[0]
    r = c.patch(
        f"/api/v1/mesas/{mesa['id']}", headers=h, json={"nome": "Varanda 1", "capacidade": 6}
    )
    assert r.json()["nome"] == "Varanda 1" and r.json()["capacidade"] == 6
    assert c.delete(f"/api/v1/mesas/{mesa['id']}", headers=h).status_code == 204
    assert len(c.get("/api/v1/mesas", headers=h).json()) == 2


def test_transicoes_manuais_de_status_da_mesa(pdv):
    m = pdv.mesa1
    assert pdv.post(f"/mesas/{m['id']}/reservar").json()["status"] == "reservada"
    assert pdv.post(f"/mesas/{m['id']}/reservar").json()["erro"]["codigo"] == "transicao_invalida"
    assert pdv.post(f"/mesas/{m['id']}/bloquear").json()["status"] == "bloqueada"
    assert pdv.post(f"/mesas/{m['id']}/liberar").json()["status"] == "livre"
    # mesa bloqueada não abre comanda
    pdv.post(f"/mesas/{m['id']}/bloquear")
    r = pdv.post("/comandas", {"tipo": "mesa", "mesa_id": m["id"]})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "mesa_indisponivel"
    pdv.post(f"/mesas/{m['id']}/liberar")
    # mesa reservada pode abrir comanda
    pdv.post(f"/mesas/{m['id']}/reservar")
    assert pdv.post("/comandas", {"tipo": "mesa", "mesa_id": m["id"]}).status_code == 201
    assert _status_mesa(pdv, m) == "ocupada"
    # com comanda em andamento não se mexe na mesa à mão
    assert pdv.post(f"/mesas/{m['id']}/bloquear").json()["erro"]["codigo"] == "transicao_invalida"
    assert (
        pdv.c.delete(f"/api/v1/mesas/{m['id']}", headers=pdv.h).json()["erro"]["codigo"]
        == "mesa_ocupada"
    )


def test_abrir_comandas_por_tipo_e_validacoes(pdv):
    assert pdv.post("/comandas", {"tipo": "mesa"}).json()["erro"]["codigo"] == "mesa_obrigatoria"
    assert (
        pdv.post("/comandas", {"tipo": "balcao", "mesa_id": pdv.mesa1["id"]}).json()["erro"][
            "codigo"
        ]
        == "mesa_invalida"
    )
    assert pdv.post("/comandas", {"tipo": "mesa", "mesa_id": 9999}).status_code == 404
    assert (
        pdv.post("/comandas", {"tipo": "delivery"}).json()["erro"]["codigo"]
        == "endereco_obrigatorio"
    )
    assert (
        pdv.post("/comandas", {"tipo": "balcao", "cliente_id": 9999}).json()["erro"]["codigo"]
        == "cliente_invalido"
    )
    balcao = pdv.post("/comandas", {"tipo": "balcao", "nome_cliente": "João"})
    assert balcao.status_code == 201 and balcao.json()["mesa"] is None
    entrega = pdv.post(
        "/comandas", {"tipo": "delivery", "endereco_entrega": "Rua A, 10", "nome_cliente": "Ana"}
    )
    assert entrega.status_code == 201 and entrega.json()["endereco_entrega"] == "Rua A, 10"
    assert pdv.post("/comandas", {"tipo": "retirada", "nome_cliente": "Lia"}).status_code == 201
    assert auditoria(pdv.ambiente, acao="CREATE", recurso="comanda")


def test_segunda_comanda_na_mesma_mesa_e_recusada(pdv):
    pdv.comanda()
    r = pdv.post("/comandas", {"tipo": "mesa", "mesa_id": pdv.mesa1["id"]})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "mesa_indisponivel"


def test_abertura_concorrente_na_mesma_mesa_gera_uma_comanda(pdv):
    def abrir(_):
        with pdv.ambiente.cliente() as cli:
            return cli.post(
                "/api/v1/comandas", headers=pdv.h, json={"tipo": "mesa", "mesa_id": pdv.mesa2["id"]}
            ).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codigos = list(pool.map(abrir, range(6)))
    assert sorted(codigos) == [201] + [409] * 5
    n = consultar(
        pdv.ambiente, "SELECT count(*) AS n FROM comanda WHERE mesa_id = %s", pdv.mesa2["id"]
    )[0]["n"]
    assert n == 1


def test_item_congela_o_preco_e_totais_sao_do_backend(pdv):
    c = pdv.comanda()
    r = pdv.item(c, pdv.refri, 2)
    assert r["totais"]["subtotal"] == "15.00" and r["itens"][0]["preco_unitario"] == "7.50"
    pdv.c.patch(
        f"/api/v1/produtos/{pdv.refri['id']}", headers=pdv.h, json={"preco_venda": "9"}
    )  # reajuste
    r = pdv.item(c, pdv.refri, 1)
    assert [i["preco_unitario"] for i in r["itens"]] == ["7.50", "9.00"]  # o antigo não muda
    assert r["totais"]["total"] == "24.00"
    assert r["totais"]["taxa_servico"] == "0.00"
    assert _status_mesa(pdv, pdv.mesa1) == "ocupada"


def test_taxa_de_servico_so_em_comanda_de_mesa(pdv):
    pdv.c.patch("/api/v1/configuracoes", headers=pdv.h, json={"taxa_servico_pct": "10"})
    mesa = pdv.comanda()
    pdv.item(mesa, pdv.refri, 2)
    r = pdv.get(f"/comandas/{mesa['id']}").json()
    assert (
        r["taxa_servico_pct"] == "10.00"
        and r["totais"]["taxa_servico"] == "1.50"
        and r["totais"]["total"] == "16.50"
    )
    balcao = pdv.post("/comandas", {"tipo": "balcao"}).json()
    pdv.item(balcao, pdv.refri, 2)
    assert pdv.get(f"/comandas/{balcao['id']}").json()["totais"]["taxa_servico"] == "0.00"
    # a taxa vale a da abertura: mudar depois não altera comanda já aberta
    pdv.c.patch("/api/v1/configuracoes", headers=pdv.h, json={"taxa_servico_pct": "0"})
    assert pdv.get(f"/comandas/{mesa['id']}").json()["totais"]["taxa_servico"] == "1.50"


def test_lancar_item_regras(pdv):
    c = pdv.comanda()
    url = f"/comandas/{c['id']}/itens"
    assert pdv.post(url, {"produto_id": pdv.refri["id"], "quantidade": "0"}).status_code == 422
    assert (
        pdv.post(url, {"produto_id": pdv.refri["id"], "quantidade": "1.5"}).json()["erro"]["codigo"]
        == "quantidade_fracionada"
    )
    assert pdv.post(url, {"produto_id": 9999, "quantidade": "1"}).status_code == 404
    assert (
        pdv.post(url, {"produto_id": pdv.pao["id"], "quantidade": "1"}).json()["erro"]["codigo"]
        == "produto_indisponivel"
    )  # insumo não é vendável
    inativo = novo_produto(pdv.c, pdv.h, "Descontinuado", ativo=False)
    assert (
        pdv.post(url, {"produto_id": inativo["id"], "quantidade": "1"}).json()["erro"]["codigo"]
        == "produto_indisponivel"
    )
    # produto preparado com ficha técnica é vendável
    assert (
        pdv.post(
            url, {"produto_id": pdv.hamb["id"], "quantidade": "2", "observacao": "sem cebola"}
        ).status_code
        == 201
    )


def test_editar_item_so_aumenta_e_cancelar_exige_motivo(pdv):
    c = pdv.comanda()
    r = pdv.item(c, pdv.refri, 2)
    item = r["itens"][0]
    base = f"/comandas/{c['id']}/itens/{item['id']}"
    assert (
        pdv.c.patch(
            f"/api/v1{base}", headers=pdv.h, json={"quantidade": "3", "observacao": "gelada"}
        ).json()["itens"][0]["quantidade"]
        == "3.000"
    )
    assert (
        pdv.c.patch(f"/api/v1{base}", headers=pdv.h, json={"quantidade": "1"}).json()["erro"][
            "codigo"
        ]
        == "reducao_de_quantidade"
    )
    assert pdv.post(f"{base}/cancelar", {"motivo": "x"}).status_code == 422
    r = pdv.post(f"{base}/cancelar", {"motivo": "cliente desistiu"}).json()
    assert r["itens"][0]["status"] == "cancelado" and r["totais"]["subtotal"] == "0.00"
    assert (
        pdv.post(f"{base}/cancelar", {"motivo": "de novo"}).json()["erro"]["codigo"]
        == "item_cancelado"
    )
    [log] = auditoria(pdv.ambiente, acao="CANCELAMENTO", recurso="comanda_item")
    assert "cliente desistiu" in log["descricao"]


def test_atendente_cancela_so_o_proprio_item_dentro_da_janela(pdv):
    criar_usuario("Ana", "ana@x.com", papeis=("Atendente",))
    criar_usuario("Beto", "beto@x.com", papeis=("Atendente",))
    ana, beto = pdv.ambiente.cliente(), pdv.ambiente.cliente()
    ha, hb = (
        login(ana, "ana@x.com", "OutraSenha#2026"),
        login(beto, "beto@x.com", "OutraSenha#2026"),
    )
    c = pdv.comanda()
    item_ana = ana.post(
        f"/api/v1/comandas/{c['id']}/itens",
        headers=ha,
        json={"produto_id": pdv.refri["id"], "quantidade": "1"},
    ).json()["itens"][0]
    corpo = {"motivo": "pedido errado"}
    url = f"/api/v1/comandas/{c['id']}/itens/{item_ana['id']}/cancelar"

    r = beto.post(url, headers=hb, json=corpo)  # item de outra pessoa
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "cancelamento_exige_gerente"

    # passada a janela (5 min), nem o próprio autor cancela
    consultar_ = pdv.ambiente.conexao_admin()
    with consultar_ as conn:
        conn.execute(
            "UPDATE comanda_item SET created_at = %s WHERE id = %s",
            (datetime.now(UTC) - timedelta(minutes=10), item_ana["id"]),
        )
    assert ana.post(url, headers=ha, json=corpo).status_code == 403
    # gerente cancela sempre
    assert (
        pdv.post(f"/comandas/{c['id']}/itens/{item_ana['id']}/cancelar", corpo).status_code == 200
    )

    novo = ana.post(
        f"/api/v1/comandas/{c['id']}/itens",
        headers=ha,
        json={"produto_id": pdv.refri["id"], "quantidade": "1"},
    ).json()["itens"][-1]
    assert (
        ana.post(
            f"/api/v1/comandas/{c['id']}/itens/{novo['id']}/cancelar", headers=ha, json=corpo
        ).status_code
        == 200
    )  # dentro da janela


def test_desconto_respeita_limite_do_papel_e_e_cumulativo(pdv):
    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    criar_usuario("Ger", "ger@x.com", papeis=("Gerente",))
    f, g = pdv.ambiente.cliente(), pdv.ambiente.cliente()
    hf, hg = login(f, "frente@x.com", "OutraSenha#2026"), login(g, "ger@x.com", "OutraSenha#2026")
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 4)  # 30.00

    def desconto(cli, h, modo, valor):
        return cli.post(
            f"/api/v1/comandas/{c['id']}/ajustes",
            headers=h,
            json={
                "tipo": "desconto",
                "modo": modo,
                "valor": str(valor),
                "justificativa": "cliente fiel",
            },
        )

    r = desconto(f, hf, "percentual", 5)  # limite da frente = 5%
    assert r.status_code == 201 and r.json()["totais"]["desconto"] == "1.50"
    r = desconto(f, hf, "valor", "0.30")  # 5% + 1% passa do limite
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "desconto_acima_do_limite"
    # o gerente (limite 20%) completa até 20%
    assert desconto(g, hg, "percentual", 15).status_code == 201
    r = desconto(g, hg, "percentual", 1)
    assert r.status_code == 403 and r.json()["erro"]["codigo"] == "desconto_acima_do_limite"
    # o administrador (limite 100%) passa
    assert desconto(pdv.c, pdv.h, "percentual", 10).status_code == 201

    final = pdv.get(f"/comandas/{c['id']}").json()
    assert final["totais"]["desconto"] == "9.00" and final["totais"]["total"] == "21.00"
    ajuste_id = final["ajustes"][0]["id"]
    r = pdv.c.delete(f"/api/v1/comandas/{c['id']}/ajustes/{ajuste_id}", headers=pdv.h)
    assert r.json()["totais"]["desconto"] == "7.50"
    assert [a["removido"] for a in r.json()["ajustes"]] == [True, False, False]
    assert auditoria(pdv.ambiente, acao="DESCONTO")


def test_atendente_nao_aplica_desconto_e_regras_de_ajuste(pdv):
    criar_usuario("Ana", "ana@x.com", papeis=("Atendente",))
    a = pdv.ambiente.cliente()
    ha = login(a, "ana@x.com", "OutraSenha#2026")
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 2)
    corpo = {"tipo": "desconto", "modo": "percentual", "valor": "1", "justificativa": "teste"}
    assert (
        a.post(f"/api/v1/comandas/{c['id']}/ajustes", headers=ha, json=corpo).status_code == 403
    )  # sem comandas.desconto

    vazia = pdv.comanda(pdv.mesa2)
    assert (
        pdv.post(f"/comandas/{vazia['id']}/ajustes", corpo).json()["erro"]["codigo"]
        == "comanda_vazia"
    )
    assert (
        pdv.post(f"/comandas/{c['id']}/ajustes", corpo | {"justificativa": "x"}).status_code == 422
    )
    assert pdv.post(f"/comandas/{c['id']}/ajustes", corpo | {"valor": "101"}).json()["erro"][
        "codigo"
    ] in ("ajuste_invalido", "validacao")
    assert (
        pdv.post(
            f"/comandas/{c['id']}/ajustes", corpo | {"modo": "valor", "valor": "15.01"}
        ).json()["erro"]["codigo"]
        == "desconto_excede_consumo"
    )
    acresc = pdv.post(
        f"/comandas/{c['id']}/ajustes",
        {"tipo": "acrescimo", "modo": "valor", "valor": "2", "justificativa": "embalagem"},
    )
    assert acresc.status_code == 201 and acresc.json()["totais"]["total"] == "17.00"


def test_transferir_comanda_entre_mesas(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    r = pdv.post(f"/comandas/{c['id']}/transferir", {"mesa_id": pdv.mesa2["id"]})
    assert r.status_code == 200 and r.json()["mesa"]["nome"] == "Mesa 2"
    assert _status_mesa(pdv, pdv.mesa1) == "livre" and _status_mesa(pdv, pdv.mesa2) == "ocupada"
    assert (
        pdv.post(f"/comandas/{c['id']}/transferir", {"mesa_id": pdv.mesa2["id"]}).json()["erro"][
            "codigo"
        ]
        == "transferencia_invalida"
    )
    outra = pdv.comanda(pdv.mesa1)
    assert (
        pdv.post(f"/comandas/{outra['id']}/transferir", {"mesa_id": pdv.mesa2["id"]}).json()[
            "erro"
        ]["codigo"]
        == "mesa_indisponivel"
    )
    balcao = pdv.post("/comandas", {"tipo": "balcao"}).json()
    assert (
        pdv.post(f"/comandas/{balcao['id']}/transferir", {"mesa_id": pdv.mesa1["id"]}).json()[
            "erro"
        ]["codigo"]
        == "transferencia_invalida"
    )
    assert auditoria(pdv.ambiente, acao="UPDATE", recurso="comanda")


def test_pedir_conta_trava_itens_e_reabrir_destrava(pdv):
    c = pdv.comanda()
    assert pdv.post(f"/comandas/{c['id']}/pedir-conta").json()["erro"]["codigo"] == "comanda_vazia"
    pdv.item(c, pdv.refri, 1)
    r = pdv.post(f"/comandas/{c['id']}/pedir-conta")
    assert (
        r.json()["status"] == "aguardando_pagamento"
        and _status_mesa(pdv, pdv.mesa1) == "aguardando_pagamento"
    )
    r = pdv.post(f"/comandas/{c['id']}/itens", {"produto_id": pdv.refri["id"], "quantidade": "1"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "comanda_nao_aberta"
    # desconto ainda pode ser dado na hora de fechar a conta
    assert (
        pdv.post(
            f"/comandas/{c['id']}/ajustes",
            {"tipo": "desconto", "modo": "valor", "valor": "1", "justificativa": "cortesia"},
        ).status_code
        == 201
    )
    assert pdv.post(f"/comandas/{c['id']}/reabrir").json()["status"] == "aberta"
    assert _status_mesa(pdv, pdv.mesa1) == "ocupada"
    assert (
        pdv.post(f"/comandas/{c['id']}/reabrir").json()["erro"]["codigo"]
        == "comanda_nao_aguardando"
    )


def test_cancelar_comanda_libera_a_mesa_e_nao_cancela_fechada(pdv):
    c = pdv.comanda()
    pdv.item(c, pdv.refri, 1)
    assert pdv.post(f"/comandas/{c['id']}/cancelar", {"motivo": "x"}).status_code == 422
    r = pdv.post(f"/comandas/{c['id']}/cancelar", {"motivo": "cliente foi embora"})
    assert (
        r.json()["status"] == "cancelada" and r.json()["cancelada_motivo"] == "cliente foi embora"
    )
    assert _status_mesa(pdv, pdv.mesa1) == "livre"
    assert (
        pdv.post(f"/comandas/{c['id']}/cancelar", {"motivo": "de novo"}).json()["erro"]["codigo"]
        == "comanda_nao_aberta"
    )
    assert (
        pdv.post(
            f"/comandas/{c['id']}/itens", {"produto_id": pdv.refri["id"], "quantidade": "1"}
        ).status_code
        == 409
    )
    assert (
        pdv.post("/comandas", {"tipo": "mesa", "mesa_id": pdv.mesa1["id"]}).status_code == 201
    )  # mesa reutilizável
    # estoque intacto: cancelar antes do pagamento não baixa nada
    assert pdv.saldo(pdv.refri) == 100


def test_divisao_por_pessoas_e_mapa_de_mesas(pdv):
    c = pdv.comanda(num_pessoas=3)
    pdv.item(c, pdv.refri, 4)
    pdv.item(c, pdv.hamb, 1)  # 30 + 20 = 50.00
    d = pdv.get(f"/comandas/{c['id']}/divisao", pessoas=3).json()
    assert d["total"] == "50.00" and d["partes"] == ["16.67", "16.67", "16.66"]
    assert pdv.get(f"/comandas/{c['id']}/divisao", pessoas=0).status_code == 422

    mapa = {m["nome"]: m for m in pdv.get("/mesas/mapa").json()}
    assert mapa["Mesa 2"]["status"] == "livre" and mapa["Mesa 2"]["comanda"] is None
    resumo = mapa["Mesa 1"]["comanda"]
    assert (
        resumo["id"] == c["id"]
        and resumo["total_parcial"] == "50.00"
        and resumo["itens_ativos"] == 2
    )


def test_listagem_de_comandas_filtros(pdv):
    a = pdv.comanda()
    pdv.item(a, pdv.refri, 1)
    b = pdv.post("/comandas", {"tipo": "balcao", "nome_cliente": "Zeca"}).json()
    pdv.post(f"/comandas/{b['id']}/cancelar", {"motivo": "teste"})
    lista = pdv.get("/comandas").json()
    assert lista["total"] == 2 and lista["itens"][0]["id"] == b["id"]
    assert pdv.get("/comandas", status="aberta").json()["total"] == 1
    assert pdv.get("/comandas", tipo="balcao").json()["total"] == 1
    assert pdv.get("/comandas", q="zeca").json()["total"] == 1
    assert pdv.get("/comandas", q=str(a["id"])).json()["total"] == 1
    assert pdv.get("/comandas", mesa_id=pdv.mesa1["id"]).json()["total"] == 1
    assert pdv.get("/comandas", status="inexistente").status_code == 422


def test_permissoes_de_operacao_por_papel(pdv):
    criar_papel("So Olha", ["comandas.listar", "mesas.listar"])
    criar_usuario("Olha", "olha@x.com", papeis=("So Olha",))
    o = pdv.ambiente.cliente()
    ho = login(o, "olha@x.com", "OutraSenha#2026")
    c = pdv.comanda()
    assert o.get(f"/api/v1/comandas/{c['id']}", headers=ho).status_code == 200
    assert o.post("/api/v1/comandas", headers=ho, json={"tipo": "balcao"}).status_code == 403
    assert (
        o.post(
            f"/api/v1/comandas/{c['id']}/itens",
            headers=ho,
            json={"produto_id": pdv.refri["id"], "quantidade": "1"},
        ).status_code
        == 403
    )
    assert o.post(f"/api/v1/comandas/{c['id']}/fechar", headers=ho, json={}).status_code == 403
    assert (
        o.post(
            f"/api/v1/comandas/{c['id']}/cancelar", headers=ho, json={"motivo": "abc"}
        ).status_code
        == 403
    )
