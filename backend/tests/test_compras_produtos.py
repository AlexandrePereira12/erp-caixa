"""Entrada de estoque com fornecedor, relatório de compras e relatório de produtos (curva ABC)."""

from decimal import Decimal

import pytest
from sqlalchemy import event

from app.core.db import get_engine
from app.modules.reports.service import _curva
from conftest import auditoria, consultar, criar_usuario, login, novo_produto, unidade_id
from test_relatorios import utc, vender

API = "/api/v1"


def codigo(r) -> str:
    return r.json()["erro"]["codigo"]


def pessoa(c, h, nome, papeis=("fornecedor",), **extra):
    r = c.post(
        f"{API}/pessoas",
        headers=h,
        json={"tipo": "J", "nome": nome, "papeis": list(papeis)} | extra,
    )
    assert r.status_code == 201, r.text
    return r.json()


def antedatar(ambiente, tabela: str, coluna: str, registro_id: int, quando) -> None:
    """Tabelas append-only não deixam mudar a data: o teste desliga o trigger só para antedatar."""
    with ambiente.conexao_admin() as conn:
        conn.execute(f"ALTER TABLE {tabela} DISABLE TRIGGER USER")
        conn.execute(f"UPDATE {tabela} SET {coluna} = %s WHERE id = %s", (quando, registro_id))
        conn.execute(f"ALTER TABLE {tabela} ENABLE TRIGGER USER")


def entrada(c, h, ambiente, produto, qtd, custo=None, fornecedor=None, quando=None) -> dict:
    corpo: dict = {"produto_id": produto["id"], "quantidade": str(qtd)}
    if custo is not None:
        corpo["custo_unitario"] = str(custo)
    if fornecedor is not None:
        corpo["fornecedor_id"] = fornecedor["id"]
    r = c.post(f"{API}/estoque/entradas", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    if quando is not None:
        antedatar(ambiente, "movimento_estoque", "ocorrido_em", r.json()["id"], quando)
    return r.json()


# --- entrada com fornecedor --------------------------------------------------------------------


def test_entrada_aceita_fornecedor_e_o_movimento_o_expoe(admin, ambiente):
    c, h = admin
    forn = pessoa(c, h, "Distribuidora Alfa")
    refri = novo_produto(c, h, "Refrigerante")

    com = entrada(c, h, ambiente, refri, 10, custo="2.5", fornecedor=forn)
    sem = entrada(c, h, ambiente, refri, 5)
    assert com["fornecedor"] == {"id": forn["id"], "nome": "Distribuidora Alfa"}
    assert sem["fornecedor"] is None

    lista = c.get(f"{API}/estoque/movimentos", headers=h, params={"tipo": "entrada"}).json()
    assert [(m["id"], m["fornecedor"]) for m in lista["itens"]] == [
        (sem["id"], None),
        (com["id"], {"id": forn["id"], "nome": "Distribuidora Alfa"}),
    ]
    # outros tipos de movimento não têm fornecedor
    r = c.post(
        f"{API}/estoque/ajustes",
        headers=h,
        json={
            "produto_id": refri["id"],
            "tipo": "perda",
            "quantidade": "1",
            "justificativa": "quebrou",
        },
    )
    assert r.status_code == 201 and r.json()["fornecedor"] is None

    [log] = auditoria(ambiente, recurso="movimento_estoque", recurso_id=str(com["id"]))
    assert log["depois"]["fornecedor_id"] == forn["id"]
    assert "do fornecedor Distribuidora Alfa" in log["descricao"]
    [log_sem] = auditoria(ambiente, recurso="movimento_estoque", recurso_id=str(sem["id"]))
    assert "fornecedor" not in log_sem["descricao"]


def test_entrada_recusa_fornecedor_sem_papel_inativo_ou_inexistente_sem_mexer_no_estoque(
    admin, ambiente
):
    c, h = admin
    cliente = pessoa(c, h, "Só Cliente", papeis=("cliente",))
    inativo = pessoa(c, h, "Fornecedor Inativo")
    c.patch(f"{API}/pessoas/{inativo['id']}", headers=h, json={"ativo": False})
    refri = novo_produto(c, h, "Refrigerante")
    for fornecedor_id, trecho in (
        (cliente["id"], "papel de fornecedor"),
        (inativo["id"], "inativo"),
        (999999, "não encontrado"),
    ):
        r = c.post(
            f"{API}/estoque/entradas",
            headers=h,
            json={"produto_id": refri["id"], "quantidade": "5", "fornecedor_id": fornecedor_id},
        )
        assert r.status_code == 422 and codigo(r) == "fornecedor_invalido", fornecedor_id
        assert trecho in r.json()["erro"]["mensagem"]
    assert consultar(ambiente, "SELECT count(*) AS n FROM movimento_estoque")[0]["n"] == 0
    assert (
        consultar(ambiente, "SELECT count(*) AS n FROM estoque_saldo WHERE quantidade <> 0")[0]["n"]
        == 0
    )


def test_listagem_de_movimentos_com_fornecedor_nao_faz_n_mais_1(admin, ambiente):
    c, h = admin
    refri = novo_produto(c, h, "Refrigerante")
    consultas = []

    @event.listens_for(get_engine(), "before_cursor_execute")
    def contar(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        consultas.append(statement)

    try:
        entrada(c, h, ambiente, refri, 1, fornecedor=pessoa(c, h, "Fornecedor 0"))
        consultas.clear()
        assert c.get(f"{API}/estoque/movimentos", headers=h).json()["total"] == 1
        com_um = len(consultas)
        for i in range(1, 10):
            entrada(c, h, ambiente, refri, 1, fornecedor=pessoa(c, h, f"Fornecedor {i}"))
        consultas.clear()
        itens = c.get(f"{API}/estoque/movimentos", headers=h).json()["itens"]
        assert len(itens) == 10 and all(m["fornecedor"] for m in itens)
        assert len(consultas) == com_um, (
            f"{com_um} consultas com 1 movimento, {len(consultas)} com 10"
        )
    finally:
        event.remove(get_engine(), "before_cursor_execute", contar)


# --- relatório de compras ----------------------------------------------------------------------


@pytest.fixture
def compras(admin, ambiente):
    """Seis entradas (uma fora do período, uma sem custo e fornecedor), com valores fechados à mão."""
    c, h = admin
    kg = unidade_id(c, h, "KG")
    bebidas = c.post(f"{API}/categorias", headers=h, json={"nome": "Bebidas"}).json()
    insumos = c.post(f"{API}/categorias", headers=h, json={"nome": "Insumos"}).json()
    refri = novo_produto(c, h, "Refrigerante", categoria_id=bebidas["id"])
    pao = novo_produto(c, h, "Pão", tipo="insumo", categoria_id=insumos["id"])
    carne = novo_produto(c, h, "Carne", tipo="insumo", unidade_id=kg)  # sem categoria
    f1 = pessoa(c, h, "Distribuidora Alfa")
    f2 = pessoa(c, h, "Frigorífico Beta")
    e = lambda *a, **k: entrada(c, h, ambiente, *a, **k)  # noqa: E731
    e(refri, 10, "2.50", f1, utc("2026-10-10", "15:00"))  # 25,00
    e(pao, 20, "0.50", f1, utc("2026-10-10", "18:00"))  # 10,00
    e(carne, 5, "30", f2, utc("2026-10-12", "13:00"))  # 150,00
    e(refri, 4, "3.00", f2, utc("2026-10-14", "02:00"))  # 12,00; 23:00 de 13/10 em Fortaleza
    e(pao, 10, None, None, utc("2026-10-15", "13:00"))  # sem custo e sem fornecedor
    e(refri, 100, "1.00", f1, utc("2026-09-30", "13:00"))  # fora do período
    return {"c": c, "h": h, "f1": f1, "f2": f2, "refri": refri, "pao": pao, "carne": carne}


PERIODO = {"de": "2026-10-01", "ate": "2026-10-31"}


def relatorio(k, **params):
    r = k["c"].get(f"{API}/relatorios/compras", headers=k["h"], params=PERIODO | params)
    assert r.status_code == 200, r.text
    return r.json()


def linhas(r):
    return [
        (x["rotulo"], x["valor"], x["entradas_qtd"], x["entradas_sem_custo"]) for x in r["linhas"]
    ]


def test_compras_por_dia_no_fuso_da_empresa_com_totais(compras):
    r = relatorio(compras)  # agrupar padrão = dia
    assert r["agrupado_por"] == "dia" and r["janela"] == PERIODO
    assert r["resumo"] == {
        "valor_total": "197.00",
        "quantidade_entradas": 5,
        "itens": 3,
        "entradas_sem_custo": 1,
    }
    assert [x["chave"] for x in r["linhas"]] == [
        "2026-10-10",
        "2026-10-12",
        "2026-10-13",  # a entrada de 02:00 UTC do dia 14 é das 23:00 do dia 13 em Fortaleza
        "2026-10-15",
    ]
    assert linhas(r) == [
        ("10/10/2026", "35.00", 2, 0),
        ("12/10/2026", "150.00", 1, 0),
        ("13/10/2026", "12.00", 1, 0),
        ("15/10/2026", "0.00", 1, 1),
    ]
    assert all(x["quantidade"] is None and x["unidade"] is None for x in r["linhas"])


def test_compras_por_fornecedor_produto_e_categoria_do_maior_para_o_menor(compras):
    f1, f2 = compras["f1"]["id"], compras["f2"]["id"]
    r = relatorio(compras, agrupar="fornecedor")
    assert linhas(r) == [
        ("Frigorífico Beta", "162.00", 2, 0),
        ("Distribuidora Alfa", "35.00", 2, 0),
        ("Sem fornecedor", "0.00", 1, 1),
    ]
    assert [x["chave"] for x in r["linhas"]] == [str(f2), str(f1), "sem_fornecedor"]

    r = relatorio(compras, agrupar="produto")
    assert linhas(r) == [
        ("Carne", "150.00", 1, 0),
        ("Refrigerante", "37.00", 2, 0),
        ("Pão", "10.00", 2, 1),
    ]
    assert [(x["quantidade"], x["unidade"]) for x in r["linhas"]] == [
        ("5.000", "KG"),
        ("14.000", "UN"),
        ("30.000", "UN"),
    ]

    r = relatorio(compras, agrupar="categoria")
    assert linhas(r) == [
        ("Sem categoria", "150.00", 1, 0),
        ("Bebidas", "37.00", 2, 0),
        ("Insumos", "10.00", 2, 1),
    ]
    assert r["linhas"][0]["chave"] == "sem_categoria"


def test_compras_o_total_nao_depende_do_agrupamento_e_as_linhas_fecham_com_ele(compras):
    for agrupar in ("dia", "fornecedor", "produto", "categoria"):
        r = relatorio(compras, agrupar=agrupar)
        assert r["resumo"]["valor_total"] == "197.00", agrupar
        assert sum(Decimal(x["valor"]) for x in r["linhas"]) == Decimal("197.00"), agrupar
        assert sum(x["entradas_qtd"] for x in r["linhas"]) == 5, agrupar
        assert sum(x["entradas_sem_custo"] for x in r["linhas"]) == 1, agrupar


def test_compras_filtros_periodo_e_validacoes(compras):
    f1 = compras["f1"]["id"]
    r = relatorio(compras, fornecedor_id=f1)
    assert r["resumo"]["valor_total"] == "35.00" and r["resumo"]["itens"] == 2
    assert r["resumo"]["quantidade_entradas"] == 2
    # um dia só, no fuso da empresa
    dia13 = relatorio(compras, de="2026-10-13", ate="2026-10-13")
    assert dia13["resumo"]["valor_total"] == "12.00" and dia13["resumo"]["quantidade_entradas"] == 1
    dia14 = relatorio(compras, de="2026-10-14", ate="2026-10-14")
    assert dia14["resumo"]["quantidade_entradas"] == 0 and dia14["linhas"] == []
    assert dia14["resumo"]["valor_total"] == "0.00"
    # setembro: só a entrada de 30/09
    assert (
        relatorio(compras, de="2026-09-01", ate="2026-09-30")["resumo"]["valor_total"] == "100.00"
    )
    # sem datas: mês corrente (não há entradas antedatadas nele além das do cenário)
    c, h = compras["c"], compras["h"]
    assert c.get(f"{API}/relatorios/compras", headers=h).status_code == 200

    def get(**p):
        return c.get(f"{API}/relatorios/compras", headers=h, params=p)

    assert get(agrupar="mes").status_code == 422
    r = get(de="2026-10-10", ate="2026-10-01")
    assert r.status_code == 422 and codigo(r) == "periodo_invalido"
    r = get(de="2025-01-01", ate="2026-10-01")
    assert r.status_code == 422 and codigo(r) == "periodo_invalido"


def test_compras_cada_entrada_arredonda_a_centavos_e_custo_zero_nao_e_sem_custo(admin, ambiente):
    c, h = admin
    p = novo_produto(c, h, "Parafuso")
    for _ in range(3):  # 3 × 0,3333: cada entrada vale 0,33; sem arredondar seria 1,00
        entrada(c, h, ambiente, p, 1, custo="0.3333")
    entrada(c, h, ambiente, p, 1, custo="0")  # custo zero informado: não é "sem custo"
    entrada(c, h, ambiente, p, 1)  # sem custo informado
    r = c.get(f"{API}/relatorios/compras", headers=h).json()
    assert r["resumo"] == {
        "valor_total": "0.99",
        "quantidade_entradas": 5,
        "itens": 1,
        "entradas_sem_custo": 1,
    }
    [linha] = c.get(f"{API}/relatorios/compras", headers=h, params={"agrupar": "produto"}).json()[
        "linhas"
    ]
    assert (linha["valor"], linha["quantidade"], linha["entradas_sem_custo"]) == (
        "0.99",
        "5.000",
        1,
    )


# --- relatório de produtos ---------------------------------------------------------------------


@pytest.fixture
def loja(pdv):
    """Cinco produtos vendidos em outubro (uma venda estornada e uma de setembro de fora), um
    vendido só em setembro, um cardápio sem venda, e cada custo conhecido ao centavo."""
    c, h = pdv.c, pdv.h
    bebidas = c.post(f"{API}/categorias", headers=h, json={"nome": "Bebidas"}).json()

    def com_estoque(nome, preco, custo, qtd=100, **extra):
        p = novo_produto(c, h, nome, preco_venda=preco, **extra)
        r = c.post(
            f"{API}/estoque/entradas",
            headers=h,
            json={"produto_id": p["id"], "quantidade": str(qtd), "custo_unitario": custo},
        )
        assert r.status_code == 201, r.text
        return p

    k = {"pdv": pdv, "bebidas": bebidas}
    k["picanha"] = com_estoque("Picanha", "100", "60")
    k["cerveja"] = com_estoque("Cerveja", "10", "4", categoria_id=bebidas["id"])
    k["agua"] = com_estoque("Água", "4", "1.5", categoria_id=bebidas["id"])
    k["pudim"] = com_estoque("Pudim", "12", "5", qtd=7)
    k["chiclete"] = novo_produto(c, h, "Chiclete", preco_venda="1", controla_estoque=False)
    k["combo"] = novo_produto(c, h, "Combo", tipo="preparado", preco_venda="30")  # nunca vendido
    descontinuado = novo_produto(c, h, "Descontinuado", preco_venda="9")
    c.patch(f"{API}/produtos/{descontinuado['id']}", headers=h, json={"ativo": False})
    removido = novo_produto(c, h, "Cardápio removido", preco_venda="9")
    c.delete(f"{API}/produtos/{removido['id']}", headers=h).raise_for_status()

    def v(itens, quando):
        total = sum(Decimal(p["preco_venda"]) * q for p, q in itens)
        return vender(pdv, itens, [pdv.pg("pix", total)], quando)

    v([(k["picanha"], 3), (k["cerveja"], 5)], utc("2026-10-10", "15:00"))  # 300 + 50
    v([(pdv.hamb, 2), (k["agua"], 10)], utc("2026-10-12", "15:00"))  # 40 + 40
    v([(k["cerveja"], 10)], utc("2026-10-13", "15:00"))  # 100
    v([(k["chiclete"], 7)], utc("2026-10-14", "15:00"))  # 7
    estornada = v([(k["picanha"], 10)], utc("2026-10-11", "15:00"))  # 1000, estornada
    assert (
        pdv.post(
            f"/vendas/{estornada['id']}/estornar", {"motivo": "erro de lançamento"}
        ).status_code
        == 200
    )
    v([(k["pudim"], 1)], utc("2026-09-30", "15:00"))  # setembro
    return k


def produtos(k, **params):
    r = k["pdv"].get("/relatorios/produtos", **(PERIODO | params))
    assert r.status_code == 200, r.text
    return r.json()


def resumo_das_linhas(r):
    return [
        (
            x["produto"],
            x["quantidade"],
            x["receita"],
            x["custo"],
            x["margem"],
            x["margem_pct"],
            x["participacao_pct"],
            x["acumulado_pct"],
            x["curva"],
            x["sem_custo"],
        )
        for x in r["linhas"]
    ]


def test_produtos_receita_custo_margem_participacao_e_curva_abc(loja):
    r = produtos(loja)
    assert r["ordenado_por"] == "receita" and r["janela"] == PERIODO
    # a venda estornada (Picanha × 10) e a de setembro não entram
    assert resumo_das_linhas(r) == [
        ("Picanha", "3.000", "300.00", "180.00", "120.00", "40.00", "55.87", "55.87", "A", False),
        ("Cerveja", "15.000", "150.00", "60.00", "90.00", "60.00", "27.93", "83.80", "A", False),
        ("Água", "10.000", "40.00", "15.00", "25.00", "62.50", "7.45", "91.25", "B", False),
        # ficha técnica: 1 pão (0,50) + 0,15 kg de carne (30,00) = 5,00 por hambúrguer
        ("Hambúrguer", "2.000", "40.00", "10.00", "30.00", "75.00", "7.45", "98.70", "B", False),
        # sem controle de estoque nem ficha: não há custo, a margem vem cheia e sinalizada
        ("Chiclete", "7.000", "7.00", "0.00", "7.00", "100.00", "1.30", "100.00", "C", True),
    ]
    assert r["resumo"] == {
        "receita_total": "537.00",
        "custo_total": "265.00",
        "margem_total": "272.00",
        "margem_pct_total": "50.65",
        "produtos_vendidos": 5,
        "produtos_sem_custo": 1,
        "sem_venda_qtd": 3,
    }
    primeira = r["linhas"][0]
    assert (primeira["tipo"], primeira["categoria"], primeira["unidade"]) == ("revenda", None, "UN")
    assert r["linhas"][1]["categoria"] == "Bebidas"


def test_produtos_o_custo_e_o_congelado_na_venda_nao_o_de_hoje(loja):
    pdv = loja["pdv"]
    antes = produtos(loja)["resumo"]["custo_total"]
    # nova compra de cerveja a custo muito maior muda o custo médio, não o das vendas já feitas
    r = pdv.post(
        "/estoque/entradas",
        {"produto_id": loja["cerveja"]["id"], "quantidade": "100", "custo_unitario": "9"},
    )
    assert r.status_code == 201
    assert Decimal(pdv.get(f"/produtos/{loja['cerveja']['id']}").json()["custo_medio"]) > 6
    depois = produtos(loja)
    assert depois["resumo"]["custo_total"] == antes == "265.00"
    assert next(x for x in depois["linhas"] if x["produto"] == "Cerveja")["custo"] == "60.00"


def test_produtos_ordenacao_limite_e_a_curva_vale_sobre_todos_os_produtos(loja):
    por = lambda **p: [x["produto"] for x in produtos(loja, **p)["linhas"]]  # noqa: E731
    assert por(ordenar="quantidade") == ["Cerveja", "Água", "Chiclete", "Picanha", "Hambúrguer"]
    assert por(ordenar="margem") == ["Picanha", "Cerveja", "Hambúrguer", "Água", "Chiclete"]
    # reordenar não muda a classe de ninguém
    curvas = {x["produto"]: x["curva"] for x in produtos(loja, ordenar="quantidade")["linhas"]}
    assert curvas == {
        "Picanha": "A",
        "Cerveja": "A",
        "Água": "B",
        "Hambúrguer": "B",
        "Chiclete": "C",
    }

    r = produtos(loja, limite=2)
    assert [x["produto"] for x in r["linhas"]] == ["Picanha", "Cerveja"]
    # limite corta só as linhas: totais e curva são do conjunto inteiro
    assert r["resumo"]["receita_total"] == "537.00" and r["resumo"]["produtos_vendidos"] == 5
    assert r["linhas"][1]["acumulado_pct"] == "83.80"
    assert len(produtos(loja, limite=500)["linhas"]) == 5


def test_produtos_filtros_por_categoria_e_tipo_refazem_a_curva_sobre_o_filtrado(loja):
    r = produtos(loja, categoria_id=loja["bebidas"]["id"])
    # só Cerveja (150) e Água (40): a Água começa antes dos 80% acumulados, então também é A
    assert resumo_das_linhas(r) == [
        ("Cerveja", "15.000", "150.00", "60.00", "90.00", "60.00", "78.95", "78.95", "A", False),
        ("Água", "10.000", "40.00", "15.00", "25.00", "62.50", "21.05", "100.00", "A", False),
    ]
    assert r["resumo"]["receita_total"] == "190.00" and r["resumo"]["margem_pct_total"] == "60.53"
    assert r["sem_venda"] == []

    r = produtos(loja, tipo="preparado")
    assert [(x["produto"], x["participacao_pct"], x["curva"]) for x in r["linhas"]] == [
        ("Hambúrguer", "100.00", "A")
    ]
    assert [x["produto"] for x in r["sem_venda"]] == ["Combo"]


def test_produtos_curva_o_primeiro_item_que_sozinho_passa_de_80_por_cento_e_a(loja):
    r = produtos(loja, de="2026-10-10", ate="2026-10-10")  # Picanha 300 + Cerveja 50
    assert [
        (x["produto"], x["participacao_pct"], x["acumulado_pct"], x["curva"]) for x in r["linhas"]
    ] == [
        ("Picanha", "85.71", "85.71", "A"),
        ("Cerveja", "14.29", "100.00", "B"),
    ]


def test_produtos_sem_venda_lista_vendaveis_ativos_com_saldo(loja):
    r = produtos(loja)
    # Pudim só vendeu em setembro; Refrigerante nunca vendeu; Combo é preparado (sem estoque).
    # Descontinuado (inativo) e Cardápio removido (excluído) não aparecem.
    assert [(x["produto"], x["tipo"], x["unidade"], x["saldo"]) for x in r["sem_venda"]] == [
        ("Combo", "preparado", "UN", None),
        ("Pudim", "revenda", "UN", "6.000"),
        ("Refrigerante", "revenda", "UN", "100.000"),
    ]
    assert not {x["produto_id"] for x in r["sem_venda"]} & {x["produto_id"] for x in r["linhas"]}
    # insumos (pão, carne) não são vendáveis: nunca entram como "sem venda"
    assert "Pão" not in {x["produto"] for x in r["sem_venda"]}

    vazio = produtos(loja, de="2026-01-01", ate="2026-01-31")
    assert vazio["linhas"] == [] and vazio["resumo"] == {
        "receita_total": "0.00",
        "custo_total": "0.00",
        "margem_total": "0.00",
        "margem_pct_total": None,
        "produtos_vendidos": 0,
        "produtos_sem_custo": 0,
        "sem_venda_qtd": 8,
    }
    assert len(vazio["sem_venda"]) == 8


def test_produtos_validacoes_e_permissao(loja):
    pdv = loja["pdv"]
    for params in (
        {"ordenar": "lucro"},
        {"limite": 0},
        {"limite": 501},
        {"tipo": "servico"},
    ):
        assert pdv.get("/relatorios/produtos", **params).status_code == 422, params
    r = pdv.get("/relatorios/produtos", de="2026-10-10", ate="2026-10-01")
    assert r.status_code == 422 and codigo(r) == "periodo_invalido"
    assert pdv.get("/relatorios/produtos").status_code == 200  # mês corrente por padrão

    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    f = pdv.ambiente.cliente()
    hf = login(f, "frente@x.com", "OutraSenha#2026")
    assert f.get(f"{API}/relatorios/produtos", headers=hf).status_code == 403


@pytest.mark.parametrize(
    ("antes", "total", "esperada"),
    [
        ("0", "100", "A"),
        ("79.99", "100", "A"),
        ("80", "100", "B"),  # no limite exato já é B: A é "até 80%"
        ("94.99", "100", "B"),
        ("95", "100", "C"),
        ("100", "100", "C"),
        ("0", "0", "C"),  # sem receita no período, ninguém é A
    ],
)
def test_curva_abc_nos_limites(antes, total, esperada):
    assert _curva(Decimal(antes), Decimal(total)) == esperada
