"""O contrato OpenAPI é a fonte dos tipos do frontend: precisa descrever o que a API devolve."""

from app.main import create_app
from conftest import EMAIL_ADMIN, SENHA_ADMIN, login

API = "/api/v1"


def test_todo_erro_do_contrato_usa_o_envelope_da_api(ambiente):
    spec = create_app().openapi()
    assert "ErroOut" in spec["components"]["schemas"]
    assert "HTTPValidationError" not in spec["components"]["schemas"]
    erro = {"$ref": "#/components/schemas/ErroOut"}
    for caminho, operacoes in spec["paths"].items():
        for metodo, op in operacoes.items():
            assert {"401", "403", "404", "409", "422"} <= set(op["responses"]), (
                f"{metodo} {caminho}"
            )
            for status in ("401", "403", "404", "409", "422"):
                assert op["responses"][status]["content"]["application/json"]["schema"] == erro


def test_dinheiro_e_quantidade_sao_string_no_contrato_de_saida(ambiente):
    spec = create_app().openapi()
    saidas = {
        "VendaOut": ("total", "subtotal", "troco_total"),
        "ComandaOut": ("totais",),
        "TotaisOut": ("total", "subtotal", "desconto", "acrescimo", "taxa_servico"),
        "CaixaOut": ("valor_abertura", "vendas_total"),
        "SaldoOut": ("saldo", "custo_medio", "valor_em_estoque"),
        "TituloOut": ("valor_original", "valor_pago", "saldo"),
    }
    for modelo, campos in saidas.items():
        propriedades = spec["components"]["schemas"][modelo]["properties"]
        for campo in campos:
            if campo == "totais":
                continue
            assert propriedades[campo].get("type") == "string", f"{modelo}.{campo} não é string"


def test_limite_de_desconto_do_papel_e_editavel_e_validado(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    papeis = {p["nome"]: p for p in c.get(f"{API}/papeis", headers=h).json()}
    assert [
        papeis[n]["limite_desconto_pct"]
        for n in ("Administrador", "Gerente", "Frente de loja", "Atendente")
    ] == [
        "100.00",
        "20.00",
        "5.00",
        "0.00",
    ]
    r = c.patch(
        f"{API}/papeis/{papeis['Frente de loja']['id']}",
        headers=h,
        json={"limite_desconto_pct": "7.5"},
    )
    assert r.status_code == 200 and r.json()["limite_desconto_pct"] == "7.50"
    assert (
        c.patch(
            f"{API}/papeis/{papeis['Gerente']['id']}",
            headers=h,
            json={"limite_desconto_pct": "101"},
        ).status_code
        == 422
    )
    assert (
        c.patch(
            f"{API}/papeis/{papeis['Gerente']['id']}", headers=h, json={"limite_desconto_pct": "-1"}
        ).status_code
        == 422
    )
    novo = c.post(
        f"{API}/papeis", headers=h, json={"nome": "Supervisor", "limite_desconto_pct": "12"}
    )
    assert novo.status_code == 201 and novo.json()["limite_desconto_pct"] == "12.00"


def test_paginacao_tem_teto(ambiente):
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    for caminho in (
        "/usuarios",
        "/pessoas",
        "/produtos",
        "/comandas",
        "/vendas",
        "/auditoria",
        "/estoque/movimentos",
    ):
        assert c.get(f"{API}{caminho}", headers=h, params={"limite": 201}).status_code == 422, (
            caminho
        )
        assert c.get(f"{API}{caminho}", headers=h, params={"limite": 200}).status_code == 200, (
            caminho
        )
