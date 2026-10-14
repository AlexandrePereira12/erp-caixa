from conftest import auditoria, novo_produto, unidade_id

API = "/api/v1"


def test_unidades_padrao_e_regras(admin):
    c, h = admin
    siglas = {u["sigla"]: u for u in c.get(f"{API}/unidades", headers=h).json()}
    assert {"UN", "KG", "G", "L", "ML", "CX", "PCT"} <= set(siglas)
    assert siglas["UN"]["casas_decimais"] == 0 and siglas["KG"]["casas_decimais"] == 3

    assert (
        c.post(f"{API}/unidades", headers=h, json={"sigla": "un", "nome": "Outra"}).json()["erro"][
            "codigo"
        ]
        == "sigla_em_uso"
    )
    nova = c.post(f"{API}/unidades", headers=h, json={"sigla": "dz", "nome": "Dúzia"})
    assert nova.status_code == 201 and nova.json()["sigla"] == "DZ"
    assert (
        c.patch(
            f"{API}/unidades/{nova.json()['id']}", headers=h, json={"nome": "Dúzia (12)"}
        ).status_code
        == 200
    )
    assert c.delete(f"{API}/unidades/{nova.json()['id']}", headers=h).status_code == 204

    novo_produto(c, h, "Coca", unidade_id=siglas["KG"]["id"])
    assert (
        c.delete(f"{API}/unidades/{siglas['KG']['id']}", headers=h).json()["erro"]["codigo"]
        == "unidade_em_uso"
    )
    r = c.patch(f"{API}/unidades/{siglas['KG']['id']}", headers=h, json={"casas_decimais": 1})
    assert r.json()["erro"]["codigo"] == "unidade_em_uso"


def test_categorias_crud_e_protecoes(admin, ambiente):
    c, h = admin
    cat = c.post(f"{API}/categorias", headers=h, json={"nome": "Bebidas"})
    assert cat.status_code == 201
    cid = cat.json()["id"]
    assert (
        c.post(f"{API}/categorias", headers=h, json={"nome": "bebidas"}).json()["erro"]["codigo"]
        == "categoria_nome_em_uso"
    )
    assert (
        c.patch(
            f"{API}/categorias/{cid}", headers=h, json={"nome": "Bebidas geladas", "ativo": False}
        ).json()["ativo"]
        is False
    )
    assert c.get(f"{API}/categorias", headers=h, params={"ativo": True}).json() == []
    novo_produto(c, h, "Suco", categoria_id=cid)
    assert (
        c.delete(f"{API}/categorias/{cid}", headers=h).json()["erro"]["codigo"]
        == "categoria_em_uso"
    )
    assert auditoria(ambiente, acao="UPDATE", recurso="categoria_produto")


def test_produto_defaults_por_tipo_e_dinheiro_como_string(admin):
    c, h = admin
    revenda = novo_produto(c, h, "Refrigerante", preco_venda="7.5")
    assert revenda["controla_estoque"] is True and revenda["vendavel"] is True
    assert revenda["preco_venda"] == "7.50" and revenda["saldo"] == "0.000"
    insumo = novo_produto(c, h, "Farinha", tipo="insumo", unidade_id=unidade_id(c, h, "KG"))
    assert insumo["vendavel"] is False and insumo["controla_estoque"] is True
    pizza = novo_produto(c, h, "Pizza", tipo="preparado", preco_venda=40)
    assert pizza["controla_estoque"] is False and pizza["saldo"] is None
    assert pizza["composicao"] == [] and pizza["custo_ficha"] is None


def test_validacoes_de_produto(admin):
    c, h = admin
    base = {"nome": "X", "tipo": "revenda", "unidade_id": unidade_id(c, h, "UN")}
    assert c.post(f"{API}/produtos", headers=h, json=base | {"preco_venda": -1}).status_code == 422
    # número JSON com ponto flutuante é recusado: dinheiro trafega como string
    assert (
        c.post(f"{API}/produtos", headers=h, json=base | {"preco_venda": 12.5}).status_code == 422
    )
    assert c.post(f"{API}/produtos", headers=h, json=base | {"tipo": "bebida"}).status_code == 422
    assert c.post(f"{API}/produtos", headers=h, json=base | {"unidade_id": 9999}).status_code == 404
    assert (
        c.post(f"{API}/produtos", headers=h, json=base | {"categoria_id": 9999}).status_code == 404
    )
    assert (
        c.post(f"{API}/produtos", headers=h, json=base | {"estoque_minimo": "1.5"}).json()["erro"][
            "codigo"
        ]
        == "quantidade_fracionada"
    )

    novo_produto(c, h, "A", codigo="001", codigo_barras="789")
    assert (
        c.post(f"{API}/produtos", headers=h, json=base | {"codigo": "001"}).json()["erro"]["codigo"]
        == "codigo_em_uso"
    )
    assert (
        c.post(f"{API}/produtos", headers=h, json=base | {"codigo_barras": "789"}).json()["erro"][
            "codigo"
        ]
        == "codigo_barras_em_uso"
    )


def test_composicao_ficha_tecnica(admin, ambiente):
    c, h = admin
    kg, un = unidade_id(c, h, "KG"), unidade_id(c, h, "UN")
    farinha = novo_produto(c, h, "Farinha", tipo="insumo", unidade_id=kg, custo_inicial="4")
    queijo = novo_produto(c, h, "Queijo", tipo="insumo", unidade_id=kg, custo_inicial="30")
    caixa = novo_produto(c, h, "Caixa", tipo="embalagem", unidade_id=un, custo_inicial="1.2")
    pizza = novo_produto(c, h, "Pizza", tipo="preparado", preco_venda="40")

    r = c.put(
        f"{API}/produtos/{pizza['id']}/composicao",
        headers=h,
        json={
            "itens": [
                {"insumo_id": farinha["id"], "quantidade": "0.3"},
                {"insumo_id": queijo["id"], "quantidade": "0.2"},
                {"insumo_id": caixa["id"], "quantidade": "1"},
            ]
        },
    )
    assert r.status_code == 200, r.text
    ficha = r.json()
    assert [i["insumo_nome"] for i in ficha["composicao"]] == ["Farinha", "Queijo", "Caixa"]
    assert (
        ficha["composicao"][0]["quantidade"] == "0.300"
        and ficha["composicao"][0]["custo_item"] == "1.20"
    )
    assert ficha["custo_ficha"] == "8.4000"  # 0.3*4 + 0.2*30 + 1*1.2
    [log] = auditoria(ambiente, acao="UPDATE", recurso="produto", recurso_id=str(pizza["id"]))
    assert log["antes"]["composicao"] == [] and len(log["depois"]["composicao"]) == 3

    # substituir a lista inteira
    r = c.put(
        f"{API}/produtos/{pizza['id']}/composicao",
        headers=h,
        json={"itens": [{"insumo_id": caixa["id"], "quantidade": "2"}]},
    )
    assert len(r.json()["composicao"]) == 1


def test_composicao_regras(admin):
    c, h = admin
    kg, un = unidade_id(c, h, "KG"), unidade_id(c, h, "UN")
    farinha = novo_produto(c, h, "Farinha", tipo="insumo", unidade_id=kg)
    caixa = novo_produto(c, h, "Caixa", tipo="embalagem", unidade_id=un)
    pizza = novo_produto(c, h, "Pizza", tipo="preparado")
    refri = novo_produto(c, h, "Refri")
    url = f"{API}/produtos/{pizza['id']}/composicao"

    def put(itens, produto=pizza):
        return c.put(f"{API}/produtos/{produto['id']}/composicao", headers=h, json={"itens": itens})

    assert (
        put([{"insumo_id": refri["id"], "quantidade": "1"}], produto=refri).json()["erro"]["codigo"]
        == "composicao_invalida"
    )
    assert (
        put(
            [
                {"insumo_id": farinha["id"], "quantidade": "1"},
                {"insumo_id": farinha["id"], "quantidade": "2"},
            ]
        ).json()["erro"]["codigo"]
        == "composicao_invalida"
    )
    assert (
        put([{"insumo_id": 9999, "quantidade": "1"}]).json()["erro"]["codigo"] == "insumo_invalido"
    )
    assert put([{"insumo_id": farinha["id"], "quantidade": "0"}]).status_code == 422
    assert (
        put([{"insumo_id": caixa["id"], "quantidade": "1.5"}]).json()["erro"]["codigo"]
        == "quantidade_fracionada"
    )
    assert put([{"insumo_id": pizza["id"], "quantidade": "1"}]).json()["erro"]["codigo"] in (
        "composicao_invalida",
        "insumo_invalido",
    )

    # insumo sem controle de estoque, ou com ficha própria, não vale
    outra = novo_produto(c, h, "Calzone", tipo="preparado")
    assert (
        put([{"insumo_id": outra["id"], "quantidade": "1"}]).json()["erro"]["codigo"]
        == "insumo_invalido"
    )

    ok = put([{"insumo_id": farinha["id"], "quantidade": "0.25"}])
    assert ok.status_code == 200
    assert (
        c.delete(f"{API}/produtos/{farinha['id']}", headers=h).json()["erro"]["codigo"]
        == "produto_em_uso"
    )
    ficha_na_ficha = novo_produto(c, h, "Mix", tipo="revenda")
    c.put(
        f"{API}/produtos/{ficha_na_ficha['id']}/composicao", headers=h, json={"itens": []}
    )  # 422: não é preparado
    assert (
        c.patch(f"{API}/produtos/{pizza['id']}", headers=h, json={"tipo": "revenda"}).json()[
            "erro"
        ]["codigo"]
        == "tipo_invalido"
    )
    assert (
        c.patch(f"{API}/produtos/{farinha['id']}", headers=h, json={"tipo": "preparado"}).json()[
            "erro"
        ]["codigo"]
        == "tipo_invalido"
    )
    assert url


def test_editar_e_excluir_produto(admin, ambiente):
    c, h = admin
    p = novo_produto(c, h, "Cerveja", codigo="C1", preco_venda="8")
    r = c.patch(
        f"{API}/produtos/{p['id']}",
        headers=h,
        json={"preco_venda": "9.9", "nome": "Cerveja Long Neck"},
    )
    assert r.status_code == 200 and r.json()["preco_venda"] == "9.90"
    [log] = auditoria(ambiente, acao="UPDATE", recurso="produto", recurso_id=str(p["id"]))
    assert log["campos_alterados"] == ["nome", "preco_venda"]
    # limpar código
    assert (
        c.patch(f"{API}/produtos/{p['id']}", headers=h, json={"codigo": None}).json()["codigo"]
        is None
    )

    c.post(f"{API}/estoque/entradas", headers=h, json={"produto_id": p["id"], "quantidade": "5"})
    assert (
        c.patch(
            f"{API}/produtos/{p['id']}", headers=h, json={"unidade_id": unidade_id(c, h, "KG")}
        ).json()["erro"]["codigo"]
        == "unidade_em_uso"
    )
    assert (
        c.patch(f"{API}/produtos/{p['id']}", headers=h, json={"controla_estoque": False}).json()[
            "erro"
        ]["codigo"]
        == "produto_com_saldo"
    )
    assert (
        c.delete(f"{API}/produtos/{p['id']}", headers=h).json()["erro"]["codigo"]
        == "produto_com_saldo"
    )

    c.post(
        f"{API}/estoque/ajustes",
        headers=h,
        json={"produto_id": p["id"], "tipo": "perda", "quantidade": "5", "justificativa": "quebra"},
    )
    assert c.delete(f"{API}/produtos/{p['id']}", headers=h).status_code == 204
    assert c.get(f"{API}/produtos/{p['id']}", headers=h).status_code == 404


def test_listagem_de_produtos_filtros(admin):
    c, h = admin
    cat = c.post(f"{API}/categorias", headers=h, json={"nome": "Pratos"}).json()
    novo_produto(c, h, "Prato Feito", categoria_id=cat["id"], codigo="PF")
    novo_produto(c, h, "Água", codigo_barras="7890000000001", estoque_minimo="5")
    novo_produto(c, h, "Sal", tipo="insumo", unidade_id=unidade_id(c, h, "KG"))
    novo_produto(c, h, "Inativo", ativo=False)

    def lista(**params):
        return [
            p["nome"] for p in c.get(f"{API}/produtos", headers=h, params=params).json()["itens"]
        ]

    assert lista(q="feito") == ["Prato Feito"]
    assert lista(q="PF") == ["Prato Feito"]
    assert lista(q="7890000000001") == ["Água"]
    assert lista(tipo="insumo") == ["Sal"]
    assert lista(categoria_id=cat["id"]) == ["Prato Feito"]
    assert lista(ativo=False) == ["Inativo"]
    assert lista(vendavel=False) == ["Sal"]
    assert lista(abaixo_minimo=True) == ["Água"]  # saldo 0 <= mínimo 5
    assert c.get(f"{API}/produtos", headers=h, params={"limite": 2}).json()["total"] == 4
