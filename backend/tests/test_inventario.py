from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from conftest import auditoria, consultar, criar_usuario, login, novo_produto, unidade_id

API = "/api/v1"


def _entrada(c, h, produto_id, qtd):
    r = c.post(
        f"{API}/estoque/entradas",
        headers=h,
        json={"produto_id": produto_id, "quantidade": str(qtd)},
    )
    assert r.status_code == 201, r.text


def _contar(c, h, inv_id, produto_id, qtd):
    return c.put(
        f"{API}/inventarios/{inv_id}/itens/{produto_id}",
        headers=h,
        json={"quantidade_contada": str(qtd)},
    )


def _saldo(ambiente, produto_id):
    return consultar(
        ambiente, "SELECT quantidade FROM estoque_saldo WHERE produto_id = %s", produto_id
    )[0]["quantidade"]


def _cenario(c, h):
    a = novo_produto(c, h, "Arroz", unidade_id=unidade_id(c, h, "KG"))
    b = novo_produto(c, h, "Bala")
    d = novo_produto(c, h, "Dado")
    novo_produto(c, h, "Pizza", tipo="preparado")  # sem controle de estoque: fora do inventário
    for p, q in ((a, "10"), (b, 20), (d, 5)):
        _entrada(c, h, p["id"], q)
    return a, b, d


def test_abre_inventario_com_os_produtos_controlados(admin, ambiente):
    c, h = admin
    a, b, d = _cenario(c, h)
    r = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Mensal"})
    assert r.status_code == 201
    inv = r.json()
    assert inv["status"] == "aberto" and inv["total_itens"] == 3 and inv["itens_contados"] == 0
    assert [i["produto_nome"] for i in inv["itens"]] == ["Arroz", "Bala", "Dado"]
    assert (
        inv["itens"][0]["quantidade_sistema"] == "10.000"
        and inv["itens"][0]["quantidade_contada"] is None
    )
    assert auditoria(ambiente, acao="CREATE", recurso="inventario", recurso_id=str(inv["id"]))

    parcial = c.post(
        f"{API}/inventarios", headers=h, json={"descricao": "Só bebidas", "produto_ids": [b["id"]]}
    )
    assert parcial.json()["total_itens"] == 1
    assert (
        c.post(
            f"{API}/inventarios", headers=h, json={"descricao": "x", "produto_ids": [9999]}
        ).json()["erro"]["codigo"]
        == "produto_invalido"
    )


def test_fechar_aplica_diferencas_como_movimentos_de_inventario(admin, ambiente):
    c, h = admin
    a, b, d = _cenario(c, h)
    inv = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Mensal"}).json()
    assert (
        _contar(c, h, inv["id"], a["id"], "9.5").json()["itens_contados"] == 1
    )  # faltou meio quilo
    _contar(c, h, inv["id"], b["id"], 25)  # sobrou
    _contar(c, h, inv["id"], d["id"], 5)  # igual: sem movimento
    # uma venda entra no meio da contagem: o ajuste usa o saldo VIGENTE no fechamento
    c.post(
        f"{API}/estoque/ajustes",
        headers=h,
        json={"produto_id": b["id"], "tipo": "perda", "quantidade": "2", "justificativa": "quebra"},
    )

    r = c.post(f"{API}/inventarios/{inv['id']}/fechar", headers=h)
    assert r.status_code == 200, r.text
    fechado = r.json()
    assert (
        fechado["status"] == "fechado"
        and fechado["ajustados"] == 2
        and fechado["nao_contados"] == 0
    )
    dif = {i["produto_nome"]: i["diferenca"] for i in fechado["itens"]}
    assert dif == {"Arroz": "-0.500", "Bala": "7.000", "Dado": "0.000"}

    assert _saldo(ambiente, a["id"]) == Decimal("9.5")
    assert _saldo(ambiente, b["id"]) == Decimal("25")
    assert _saldo(ambiente, d["id"]) == Decimal("5")
    movs = consultar(
        ambiente,
        "SELECT produto_id, quantidade, origem_tipo, origem_id FROM movimento_estoque WHERE tipo = 'inventario' ORDER BY id",
    )
    assert [(m["origem_tipo"], m["origem_id"]) for m in movs] == [("inventario", inv["id"])] * 2
    [log] = auditoria(
        ambiente, acao="AJUSTE_ESTOQUE", recurso="inventario", recurso_id=str(inv["id"])
    )
    assert log["depois"] == {"status": "fechado", "ajustados": 2, "nao_contados": 0}


def test_produto_sem_contagem_fica_intacto_e_inventario_fechado_e_imutavel(admin, ambiente):
    c, h = admin
    a, b, d = _cenario(c, h)
    inv = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Parcial"}).json()
    _contar(c, h, inv["id"], a["id"], 8)
    r = c.post(f"{API}/inventarios/{inv['id']}/fechar", headers=h).json()
    assert r["ajustados"] == 1 and r["nao_contados"] == 2
    assert _saldo(ambiente, b["id"]) == Decimal("20")

    assert (
        c.post(f"{API}/inventarios/{inv['id']}/fechar", headers=h).json()["erro"]["codigo"]
        == "inventario_nao_aberto"
    )
    assert _contar(c, h, inv["id"], a["id"], 1).json()["erro"]["codigo"] == "inventario_nao_aberto"
    assert (
        c.post(f"{API}/inventarios/{inv['id']}/cancelar", headers=h).json()["erro"]["codigo"]
        == "inventario_nao_aberto"
    )
    assert (
        consultar(
            ambiente, "SELECT count(*) AS n FROM movimento_estoque WHERE tipo = 'inventario'"
        )[0]["n"]
        == 1
    )


def test_contagem_valida_e_cancelamento(admin, ambiente):
    c, h = admin
    a, b, _ = _cenario(c, h)
    inv = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Teste"}).json()
    assert (
        _contar(c, h, inv["id"], b["id"], "1.5").json()["erro"]["codigo"] == "quantidade_fracionada"
    )
    assert _contar(c, h, inv["id"], b["id"], -1).status_code == 422
    assert _contar(c, h, inv["id"], 9999, 1).status_code == 404
    assert _contar(c, h, 9999, b["id"], 1).status_code == 404
    _contar(c, h, inv["id"], b["id"], 3)
    r = c.post(f"{API}/inventarios/{inv['id']}/cancelar", headers=h)
    assert r.json()["status"] == "cancelado"
    assert _saldo(ambiente, b["id"]) == Decimal("20")  # cancelar não mexe no estoque
    assert auditoria(ambiente, acao="CANCELAMENTO", recurso="inventario")


def test_fechamento_concorrente_aplica_uma_unica_vez(admin, ambiente):
    c, h = admin
    a, b, d = _cenario(c, h)
    inv = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Corrida"}).json()
    for p, q in ((a, 7), (b, 18), (d, 2)):
        _contar(c, h, inv["id"], p["id"], q)

    def fechar(_):
        with ambiente.cliente() as cli:
            return cli.post(f"{API}/inventarios/{inv['id']}/fechar", headers=h).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codigos = list(pool.map(fechar, range(6)))
    assert sorted(codigos) == [200] + [409] * 5
    assert (
        consultar(
            ambiente, "SELECT count(*) AS n FROM movimento_estoque WHERE tipo = 'inventario'"
        )[0]["n"]
        == 3
    )
    assert [_saldo(ambiente, p["id"]) for p in (a, b, d)] == [Decimal(7), Decimal(18), Decimal(2)]


def test_listagem_e_permissoes(admin, ambiente):
    c, h = admin
    _cenario(c, h)
    c.post(f"{API}/inventarios", headers=h, json={"descricao": "Um"})
    inv2 = c.post(f"{API}/inventarios", headers=h, json={"descricao": "Dois"}).json()
    c.post(f"{API}/inventarios/{inv2['id']}/cancelar", headers=h)
    lista = c.get(f"{API}/inventarios", headers=h).json()
    assert lista["total"] == 2 and lista["itens"][0]["descricao"] == "Dois"
    assert c.get(f"{API}/inventarios", headers=h, params={"status": "aberto"}).json()["total"] == 1
    assert c.get(f"{API}/inventarios/{inv2['id']}", headers=h).json()["status"] == "cancelado"

    criar_usuario("Frente", "frente@x.com", papeis=("Frente de loja",))
    f = ambiente.cliente()
    hf = login(f, "frente@x.com", "OutraSenha#2026")
    assert f.get(f"{API}/inventarios", headers=hf).status_code == 403
    assert f.post(f"{API}/inventarios", headers=hf, json={"descricao": "x"}).status_code == 403
