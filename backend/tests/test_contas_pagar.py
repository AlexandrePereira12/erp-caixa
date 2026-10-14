"""Contas a pagar: fluxo, recusas, idempotência, concorrência, permissões, auditoria, fuso e migration."""

import os
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
import pytest
from psycopg import sql
from sqlalchemy import event

from app.core.db import get_engine, get_sessionmaker
from app.seed_demo import semear
from conftest import (
    APP,
    BACKEND,
    EMAIL_ADMIN,
    SENHA_ADMIN,
    _base_env,
    auditoria,
    consultar,
    criar_papel,
    criar_usuario,
    login,
)
from test_rbac_rotas import _politica, _rotas
from test_relatorios import hoje_local

API = "/api/v1"
FORTALEZA = ZoneInfo("America/Fortaleza")


def em(dias: int, base: str | None = None) -> str:
    """Data ISO `dias` a partir de hoje (fuso padrão da empresa nos testes)."""
    inicio = datetime.fromisoformat(base or hoje_local()).date()
    return (inicio + timedelta(days=dias)).isoformat()


class Contas:
    """Cliente autenticado como administrador, com atalhos para a API de contas a pagar."""

    def __init__(self, c, h):
        self.c, self.h = c, h
        self.formas = {f["tipo"]: f["id"] for f in self.get("/formas-pagamento").json()}
        self.categorias = {
            x["nome"]: x["id"] for x in self.get("/categorias-financeiras", tipo="despesa").json()
        }

    def post(self, caminho, corpo=None, cli=None):
        return (cli or self.c).post(f"{API}{caminho}", headers=self.h, json=corpo or {})

    def get(self, caminho, **params):
        return self.c.get(f"{API}{caminho}", headers=self.h, params=params)

    def patch(self, caminho, corpo):
        return self.c.patch(f"{API}{caminho}", headers=self.h, json=corpo)

    def fornecedor(self, nome="Distribuidora Alfa", papeis=("fornecedor",), tipo="J") -> dict:
        r = self.post("/pessoas", {"tipo": tipo, "nome": nome, "papeis": list(papeis)})
        assert r.status_code == 201, r.text
        return r.json()

    def criar(self, **campos) -> dict:
        corpo = {
            "descricao": "Conta de teste",
            "valor_original": "100.00",
            "vencimento": em(5),
        } | campos
        r = self.post("/contas-pagar", corpo)
        assert r.status_code == 201, r.text
        return r.json()

    def pagar(self, titulo: dict, valor, forma="pix", cli=None, **extra):
        corpo = {"valor": str(valor), "forma_pagamento_id": self.formas[forma]} | extra
        return self.post(f"/contas-pagar/{titulo['id']}/baixas", corpo, cli=cli)

    def estornar(self, titulo: dict, baixa: dict, motivo="lançado por engano"):
        return self.post(
            f"/contas-pagar/{titulo['id']}/baixas/{baixa['id']}/estornar", {"motivo": motivo}
        )

    def cancelar(self, titulo: dict, motivo="conta duplicada"):
        return self.post(f"/contas-pagar/{titulo['id']}/cancelar", {"motivo": motivo})

    def titulo(self, titulo: dict) -> dict:
        r = self.get(f"/contas-pagar/{titulo['id']}")
        assert r.status_code == 200, r.text
        return r.json()


@pytest.fixture
def contas(admin):
    c, h = admin
    return Contas(c, h)


def codigo(r) -> str:
    return r.json()["erro"]["codigo"]


# --- fluxo completo ----------------------------------------------------------------------------


def test_fluxo_completo_criar_editar_baixar_estornar_cancelar(contas, ambiente):
    forn = contas.fornecedor()
    t = contas.criar(
        pessoa_id=forn["id"],
        categoria_id=contas.categorias["Aluguel"],
        descricao="Aluguel de outubro",
        documento="Boleto 77",
        valor_original="100",
        vencimento=em(5),
        observacao="vence na sexta",
    )
    assert (t["status"], t["situacao"], t["dias_para_vencer"]) == ("aberto", "a_vencer", 5)
    assert (t["valor_original"], t["valor_pago"], t["saldo"]) == ("100.00", "0.00", "100.00")
    assert t["fornecedor"] == {"id": forn["id"], "nome": "Distribuidora Alfa"}
    assert t["categoria"] == {"id": contas.categorias["Aluguel"], "nome": "Aluguel"}
    assert (t["documento"], t["observacao"]) == ("Boleto 77", "vence na sexta")
    assert t["baixas"] == [] and t["pago_em"] is None and t["cancelado_motivo"] is None

    # edição: tira o fornecedor, muda valor (ainda sem pagamento), vencimento e descrição
    r = contas.patch(
        f"/contas-pagar/{t['id']}",
        {
            "descricao": "Aluguel de outubro (reajustado)",
            "valor_original": "120",
            "vencimento": em(2),
            "documento": None,
            "pessoa_id": None,
        },
    )
    assert r.status_code == 200, r.text
    e = r.json()
    assert (e["valor_original"], e["dias_para_vencer"], e["documento"], e["fornecedor"]) == (
        "120.00",
        2,
        None,
        None,
    )
    assert e["categoria"]["nome"] == "Aluguel" and e["descricao"].endswith("(reajustado)")

    # baixa parcial
    d = contas.pagar(t, "50", observacao="sinal")
    assert d.status_code == 201, d.text
    d = d.json()
    assert (d["valor_pago"], d["saldo"], d["status"], d["situacao"]) == (
        "50.00",
        "70.00",
        "aberto",
        "a_vencer",
    )
    baixa1 = d["baixas"][0]
    assert (baixa1["valor"], baixa1["forma"], baixa1["data_pagamento"]) == (
        "50.00",
        "PIX",
        hoje_local(),
    )
    assert (baixa1["estornada"], baixa1["usuario_nome"]) == (False, "Admin Teste")
    # com pagamento vigente o valor trava e o título não cancela; o resto ainda edita
    r = contas.patch(f"/contas-pagar/{t['id']}", {"valor_original": "130"})
    assert r.status_code == 409 and codigo(r) == "titulo_com_baixas"
    r = contas.cancelar(t)
    assert r.status_code == 409 and codigo(r) == "titulo_com_baixas"
    assert (
        contas.patch(f"/contas-pagar/{t['id']}", {"observacao": "pago em parte"}).status_code == 200
    )
    # mesmo valor no corpo não conta como alteração
    assert contas.patch(f"/contas-pagar/{t['id']}", {"valor_original": "120"}).status_code == 200

    # baixa total: título pago
    d = contas.pagar(t, "70").json()
    assert (d["status"], d["situacao"], d["saldo"], d["dias_para_vencer"]) == (
        "pago",
        "pago",
        "0.00",
        None,
    )
    assert d["pago_em"] == hoje_local() and len(d["baixas"]) == 2
    r = contas.cancelar(t)
    assert r.status_code == 409 and codigo(r) == "titulo_pago"
    r = contas.pagar(t, "1")
    assert r.status_code == 409 and codigo(r) == "titulo_nao_aberto"

    # estorno da última baixa: volta a aberto, com a baixa inversa registrada
    baixa2 = d["baixas"][1]
    r = contas.estornar(t, baixa2, "pagamento na conta errada")
    assert r.status_code == 200, r.text
    e = r.json()
    assert (e["status"], e["situacao"], e["valor_pago"], e["saldo"], e["pago_em"]) == (
        "aberto",
        "a_vencer",
        "50.00",
        "70.00",
        None,
    )
    assert [b["valor"] for b in e["baixas"]] == ["50.00", "70.00", "-70.00"]
    assert e["baixas"][1]["estornada"] is True and e["baixas"][0]["estornada"] is False
    inversa = e["baixas"][2]
    assert inversa["estorno_de_id"] == baixa2["id"] and inversa["estornada"] is False
    assert inversa["observacao"] == "Estorno: pagamento na conta errada"
    assert inversa["data_pagamento"] == baixa2["data_pagamento"]  # herda o dia da baixa original

    r = contas.estornar(t, baixa2)
    assert r.status_code == 409 and codigo(r) == "baixa_ja_estornada"
    r = contas.estornar(t, inversa)
    assert r.status_code == 422 and codigo(r) == "baixa_invalida"
    outro = contas.criar(descricao="Outra conta")
    r = contas.estornar(outro, baixa1)  # baixa de outro título
    assert r.status_code == 404
    r = contas.post(f"/contas-pagar/{t['id']}/baixas/{baixa1['id']}/estornar", {})
    assert r.status_code == 422  # motivo é obrigatório

    # estorna também a primeira: sem pagamento vigente, mas o valor continua travado pelo histórico
    e = contas.estornar(t, baixa1).json()
    assert (e["valor_pago"], e["saldo"], e["status"]) == ("0.00", "120.00", "aberto")
    r = contas.patch(f"/contas-pagar/{t['id']}", {"valor_original": "130"})
    assert r.status_code == 409 and codigo(r) == "titulo_com_baixas"
    assert contas.titulo(t)["valor_original"] == "120.00"
    # já a conta sem pagamento vigente pode ser cancelada (e o valor errado se corrige lançando outra)

    # cancelamento: motivo obrigatório
    assert contas.post(f"/contas-pagar/{t['id']}/cancelar", {}).status_code == 422
    assert contas.cancelar(t, "ab").status_code == 422
    c = contas.cancelar(t, "conta lançada em duplicidade").json()
    assert (c["status"], c["situacao"], c["dias_para_vencer"]) == ("cancelado", "cancelado", None)
    assert c["cancelado_motivo"] == "conta lançada em duplicidade"
    r = contas.patch(f"/contas-pagar/{t['id']}", {"descricao": "x"})
    assert r.status_code == 409 and codigo(r) == "titulo_cancelado"
    r = contas.pagar(t, "10")
    assert r.status_code == 409 and codigo(r) == "titulo_nao_aberto"
    r = contas.cancelar(t)
    assert r.status_code == 409 and codigo(r) == "titulo_cancelado"

    # o pagamento é registro financeiro: nunca tocou o caixa (nem exige caixa aberto)
    assert consultar(ambiente, "SELECT count(*) AS n FROM movimento_caixa")[0]["n"] == 0
    assert consultar(ambiente, "SELECT count(*) AS n FROM caixa")[0]["n"] == 0


# --- recusas -----------------------------------------------------------------------------------


def test_fornecedor_e_categoria_sao_validados_na_criacao_e_na_edicao(contas):
    cliente = contas.fornecedor("Só Cliente", papeis=("cliente",), tipo="F")
    inativo = contas.fornecedor("Fornecedor Inativo")
    desativar = contas.c.patch(
        f"{API}/pessoas/{inativo['id']}", headers=contas.h, json={"ativo": False}
    )
    assert desativar.status_code == 200
    receita = next(
        c["id"]
        for c in contas.get("/categorias-financeiras", tipo="receita").json()
        if c["nome"] == "Vendas fiado"
    )
    velha = contas.post("/categorias-financeiras", {"nome": "Velha", "tipo": "despesa"}).json()
    contas.c.patch(
        f"{API}/categorias-financeiras/{velha['id']}", headers=contas.h, json={"ativa": False}
    )
    base = {"descricao": "x", "valor_original": "10", "vencimento": em(1)}

    for pessoa_id, trecho in (
        (cliente["id"], "papel de fornecedor"),
        (inativo["id"], "inativo"),
        (999999, "não encontrado"),
    ):
        r = contas.post("/contas-pagar", base | {"pessoa_id": pessoa_id})
        assert r.status_code == 422 and codigo(r) == "fornecedor_invalido", pessoa_id
        assert trecho in r.json()["erro"]["mensagem"]
    for categoria_id, trecho in (
        (receita, "é de receita"),
        (velha["id"], "inativa"),
        (999999, "não encontrada"),
    ):
        r = contas.post("/contas-pagar", base | {"categoria_id": categoria_id})
        assert r.status_code == 422 and codigo(r) == "categoria_invalida", categoria_id
        assert trecho in r.json()["erro"]["mensagem"]

    # mesma validação na edição
    t = contas.criar()
    for corpo, esperado in (
        ({"pessoa_id": cliente["id"]}, "fornecedor_invalido"),
        ({"categoria_id": receita}, "categoria_invalida"),
    ):
        r = contas.patch(f"/contas-pagar/{t['id']}", corpo)
        assert r.status_code == 422 and codigo(r) == esperado
    # fornecedor desativado depois: a conta continua editável nos outros campos
    ativo = contas.fornecedor("Vai Sair")
    t = contas.criar(pessoa_id=ativo["id"])
    contas.c.patch(f"{API}/pessoas/{ativo['id']}", headers=contas.h, json={"ativo": False})
    r = contas.patch(f"/contas-pagar/{t['id']}", {"observacao": "ok", "pessoa_id": ativo["id"]})
    assert r.status_code == 200 and r.json()["fornecedor"]["id"] == ativo["id"]


def test_validacao_dos_campos_de_entrada(contas):
    base = {"descricao": "x", "valor_original": "10", "vencimento": em(1)}
    ruins = [
        {"valor_original": "0"},
        {"valor_original": "-5"},
        {"valor_original": "abc"},
        {"valor_original": 1.5},  # float no JSON é recusado: dinheiro é string
        {"valor_original": "1000000000000"},
        {"descricao": "   "},
        {"descricao": "x" * 201},
        {"documento": "d" * 61},
        {"vencimento": "31/12/2026"},
    ]
    for ruim in ruins:
        r = contas.post("/contas-pagar", base | ruim)
        assert r.status_code == 422, ruim
    assert (
        contas.post("/contas-pagar", {"descricao": "x", "valor_original": "10"}).status_code == 422
    )
    # vencimento passado é válido (conta que já nasceu vencida)
    passada = contas.criar(vencimento=em(-30))
    assert passada["situacao"] == "vencido" and passada["dias_para_vencer"] == -30
    # texto opcional só com espaços vira nulo
    t = contas.criar(documento="   ", observacao=" ")
    assert t["documento"] is None and t["observacao"] is None

    # edição: campos obrigatórios não aceitam null
    for corpo in ({"descricao": None}, {"vencimento": None}, {"valor_original": None}):
        r = contas.patch(f"/contas-pagar/{t['id']}", corpo)
        assert r.status_code == 422, corpo
    assert contas.patch(f"/contas-pagar/{t['id']}", {"valor_original": "0"}).status_code == 422


def test_baixa_recusas(contas):
    t = contas.criar(valor_original="100")
    r = contas.pagar(t, "100.01")
    assert r.status_code == 409 and codigo(r) == "valor_acima_do_saldo"
    assert "100.00" in r.json()["erro"]["mensagem"]
    for ruim in ("0", "-1", "abc"):
        assert contas.pagar(t, ruim).status_code == 422, ruim

    amanha = em(1)
    r = contas.pagar(t, "10", data_pagamento=amanha)
    assert r.status_code == 422 and codigo(r) == "data_futura"
    # data passada vale; e o título não ficou com nenhuma das tentativas recusadas
    ok = contas.pagar(t, "10", data_pagamento=em(-3))
    assert ok.status_code == 201 and ok.json()["baixas"][0]["data_pagamento"] == em(-3)
    assert contas.titulo(t)["valor_pago"] == "10.00"

    r = contas.pagar(t, "10", forma="fiado")
    assert r.status_code == 422 and codigo(r) == "forma_invalida"
    cheque = contas.post("/formas-pagamento", {"nome": "Cheque", "tipo": "outro"}).json()
    contas.c.patch(
        f"{API}/formas-pagamento/{cheque['id']}", headers=contas.h, json={"ativa": False}
    )
    r = contas.post(
        f"/contas-pagar/{t['id']}/baixas", {"valor": "10", "forma_pagamento_id": cheque["id"]}
    )
    assert r.status_code == 422 and codigo(r) == "forma_invalida"
    r = contas.post(
        f"/contas-pagar/{t['id']}/baixas", {"valor": "10", "forma_pagamento_id": 999999}
    )
    assert r.status_code == 404
    assert contas.titulo(t)["valor_pago"] == "10.00"

    # exatamente o saldo é aceito
    assert contas.pagar(t, "90").json()["status"] == "pago"


def test_titulo_inexistente_responde_404_em_toda_operacao(contas):
    forma = contas.formas["pix"]
    assert contas.get("/contas-pagar/999999").status_code == 404
    assert contas.patch("/contas-pagar/999999", {"descricao": "x"}).status_code == 404
    assert contas.post("/contas-pagar/999999/cancelar", {"motivo": "teste"}).status_code == 404
    r = contas.post("/contas-pagar/999999/baixas", {"valor": "1", "forma_pagamento_id": forma})
    assert r.status_code == 404
    assert (
        contas.post("/contas-pagar/999999/baixas/1/estornar", {"motivo": "teste"}).status_code
        == 404
    )
    assert contas.get("/contas-pagar/resumo").status_code == 200  # não cai no {titulo_id}


# --- idempotência ------------------------------------------------------------------------------


def test_baixa_com_a_mesma_chave_lanca_uma_unica_vez(contas, ambiente):
    t = contas.criar(valor_original="100")
    chave = {"chave": "tentativa-0001"}
    primeira = contas.pagar(t, "40", **chave)
    repetida = contas.pagar(t, "40", **chave)  # clique duplo / retry de rede
    assert primeira.status_code == repetida.status_code == 201
    assert repetida.json()["valor_pago"] == "40.00" and len(repetida.json()["baixas"]) == 1
    n = "SELECT count(*) AS n FROM titulo_pagar_baixa"
    assert consultar(ambiente, n)[0]["n"] == 1
    assert contas.pagar(t, "10", chave="tentativa-0002").json()["valor_pago"] == "50.00"
    assert contas.pagar(t, "10", chave="curta").status_code == 422
    assert contas.pagar(t, "10", chave="chave com espaço").status_code == 422
    # sem chave continua funcionando, e a chave é por título
    assert contas.pagar(t, "5").json()["valor_pago"] == "55.00"
    outro = contas.criar(valor_original="100")
    assert contas.pagar(outro, "40", **chave).json()["valor_pago"] == "40.00"
    # reenvio da baixa que quitou o título devolve a conta, não "título não está aberto"
    quita = {"chave": "quitacao-0001"}
    assert contas.pagar(outro, "60", **quita).json()["status"] == "pago"
    r = contas.pagar(outro, "60", **quita)
    assert r.status_code == 201 and len(r.json()["baixas"]) == 2
    assert consultar(ambiente, n)[0]["n"] == 5  # 3 do primeiro título e 2 do segundo


# --- concorrência ------------------------------------------------------------------------------


def aguardar_esperas(ambiente, quantas, tentativas=200):
    """Gate por estado observável: espera até haver `quantas` sessões bloqueadas em trava."""
    for _ in range(tentativas):
        n = consultar(
            ambiente,
            "SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
        )[0]["n"]
        if n >= quantas:
            return
        time.sleep(0.05)
    raise AssertionError(f"menos de {quantas} sessões esperando trava")


def corrida(contas, ambiente, titulo, chamadas):
    """Dispara `chamadas` (método, caminho, corpo) ao mesmo tempo, todas paradas na trava do título
    que o teste segura; só solta quando todas estão esperando (sem sleep como correção)."""

    def chamar(a):
        metodo, caminho, corpo = a
        with ambiente.cliente() as cli:
            r = cli.request(metodo, f"{API}{caminho}", headers=contas.h, json=corpo)
        return r.status_code, r.json()

    with ambiente.conexao_admin() as segura:
        segura.autocommit = False
        segura.execute("SELECT 1 FROM titulo_pagar WHERE id = %s FOR UPDATE", (titulo["id"],))
        with ThreadPoolExecutor(max_workers=len(chamadas)) as pool:
            futuros = [pool.submit(chamar, a) for a in chamadas]
            aguardar_esperas(ambiente, len(chamadas))
            segura.rollback()
            return [f.result(timeout=30) for f in futuros]


def baixas_do_banco(ambiente, titulo):
    return consultar(
        ambiente,
        "SELECT id, valor, estorno_de_id FROM titulo_pagar_baixa WHERE titulo_id = %s ORDER BY id",
        titulo["id"],
    )


def test_duas_baixas_de_valor_total_pagam_uma_vez_e_a_outra_recebe_409(contas, ambiente):
    t = contas.criar(valor_original="100")
    corpo = {"valor": "100", "forma_pagamento_id": contas.formas["pix"]}
    resultados = corrida(
        contas,
        ambiente,
        t,
        [
            ("POST", f"/contas-pagar/{t['id']}/baixas", corpo | {"chave": f"corrida-{i:04d}"})
            for i in range(2)
        ],
    )
    assert sorted(s for s, _ in resultados) == [201, 409]
    perdedor = next(j for s, j in resultados if s == 409)
    assert perdedor["erro"]["codigo"] == "titulo_nao_aberto"
    assert len(baixas_do_banco(ambiente, t)) == 1
    assert contas.titulo(t)["valor_pago"] == "100.00"


def test_duas_baixas_parciais_que_somam_mais_que_o_saldo_nunca_passam_juntas(contas, ambiente):
    t = contas.criar(valor_original="100")
    corpo = {"valor": "60", "forma_pagamento_id": contas.formas["pix"]}
    resultados = corrida(
        contas,
        ambiente,
        t,
        [("POST", f"/contas-pagar/{t['id']}/baixas", corpo) for _ in range(2)],
    )
    assert sorted(s for s, _ in resultados) == [201, 409]
    assert next(j for s, j in resultados if s == 409)["erro"]["codigo"] == "valor_acima_do_saldo"
    assert contas.titulo(t)["valor_pago"] == "60.00" and len(baixas_do_banco(ambiente, t)) == 1


def test_mesma_chave_simultanea_lanca_uma_unica_baixa(contas, ambiente):
    t = contas.criar(valor_original="100")
    corpo = {"valor": "30", "forma_pagamento_id": contas.formas["pix"], "chave": "mesma-chave-1"}
    resultados = corrida(
        contas,
        ambiente,
        t,
        [("POST", f"/contas-pagar/{t['id']}/baixas", corpo) for _ in range(3)],
    )
    assert [s for s, _ in resultados] == [201, 201, 201]
    assert len(baixas_do_banco(ambiente, t)) == 1 and contas.titulo(t)["valor_pago"] == "30.00"


def test_estornos_simultaneos_da_mesma_baixa_aplicam_uma_vez(contas, ambiente):
    t = contas.criar(valor_original="100")
    d = contas.pagar(t, "100").json()
    baixa = d["baixas"][0]
    caminho = f"/contas-pagar/{t['id']}/baixas/{baixa['id']}/estornar"
    resultados = corrida(
        contas, ambiente, t, [("POST", caminho, {"motivo": "corrida de estorno"}) for _ in range(3)]
    )
    assert sorted(s for s, _ in resultados) == [200, 409, 409]
    assert {j["erro"]["codigo"] for s, j in resultados if s == 409} == {"baixa_ja_estornada"}
    banco = baixas_do_banco(ambiente, t)
    assert [b["valor"] for b in banco] == [Decimal("100.00"), Decimal("-100.00")]
    assert contas.titulo(t)["valor_pago"] == "0.00"


def test_cancelar_e_baixar_ao_mesmo_tempo_deixam_o_titulo_consistente(contas, ambiente):
    t = contas.criar(valor_original="100")
    resultados = corrida(
        contas,
        ambiente,
        t,
        [
            ("POST", f"/contas-pagar/{t['id']}/cancelar", {"motivo": "corrida de cancelamento"}),
            (
                "POST",
                f"/contas-pagar/{t['id']}/baixas",
                {"valor": "30", "forma_pagamento_id": contas.formas["pix"]},
            ),
        ],
    )
    cancelou, baixou = resultados
    final = contas.titulo(t)
    if cancelou[0] == 200:  # o cancelamento chegou primeiro: a baixa vê o título cancelado
        assert baixou[0] == 409 and baixou[1]["erro"]["codigo"] == "titulo_nao_aberto"
        assert final["status"] == "cancelado" and final["valor_pago"] == "0.00"
        assert baixas_do_banco(ambiente, t) == []
    else:  # a baixa chegou primeiro: o cancelamento vê pagamento vigente
        assert baixou[0] == 201 and cancelou[0] == 409
        assert cancelou[1]["erro"]["codigo"] == "titulo_com_baixas"
        assert final["status"] == "aberto" and final["valor_pago"] == "30.00"


def test_baixas_simultaneas_sem_gate_nunca_pagam_mais_que_o_saldo(contas, ambiente):
    """Threads reais, sem segurar trava: 8 pagamentos de 30 num saldo de 100 cabem exatamente 3."""
    t = contas.criar(valor_original="100")

    def pagar(i):
        with ambiente.cliente() as cli:
            return contas.pagar(t, "30", cli=cli, chave=f"rajada-{i:04d}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        respostas = list(pool.map(pagar, range(8)))
    assert sorted(r.status_code for r in respostas) == [201] * 3 + [409] * 5
    assert {codigo(r) for r in respostas if r.status_code == 409} == {"valor_acima_do_saldo"}
    assert contas.titulo(t)["valor_pago"] == "90.00" and len(baixas_do_banco(ambiente, t)) == 3


def test_banco_barra_pagamento_acima_do_valor_mesmo_fora_da_api(ambiente):
    """Última barreira: o CHECK do título impede valor_pago > valor_original sem passar pelo serviço."""
    with ambiente.conexao_admin() as conn:
        conn.execute(
            "INSERT INTO titulo_pagar (descricao, valor_original, vencimento) VALUES ('t', 10, current_date)"
        )
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("UPDATE titulo_pagar SET valor_pago = 10.01")
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("UPDATE titulo_pagar SET valor_pago = -1")


# --- listagem, filtros e resumo -----------------------------------------------------------------


@pytest.fixture
def cenario(contas):
    """Dez contas em situações diferentes, com datas relativas a hoje."""
    f1 = contas.fornecedor("Atacado Sul")
    f2 = contas.fornecedor("Gráfica Rápida")
    cat = contas.categorias
    c = {"f1": f1, "f2": f2}
    c["A"] = contas.criar(
        descricao="Aluguel do salão", documento="REC-1", valor_original="1000",
        vencimento=em(-3), categoria_id=cat["Aluguel"],
    )  # fmt: skip
    c["B"] = contas.criar(
        descricao="Compra de carnes", documento="NF-77", valor_original="500",
        vencimento=em(0), pessoa_id=f1["id"], categoria_id=cat["Mercadorias e insumos"],
    )  # fmt: skip
    c["C"] = contas.criar(
        descricao="Material gráfico", valor_original="200", vencimento=em(10),
        pessoa_id=f2["id"], categoria_id=cat["Outras despesas"],
    )  # fmt: skip
    c["D"] = contas.criar(
        descricao="Internet", valor_original="150", vencimento=em(-1),
        categoria_id=cat["Energia e água"],
    )  # fmt: skip
    assert contas.pagar(c["D"], "150").json()["status"] == "pago"
    c["E"] = contas.criar(descricao="Despesa duplicada", valor_original="90", vencimento=em(2))
    assert contas.cancelar(c["E"]).status_code == 200
    c["F"] = contas.criar(
        descricao="Compra de bebidas", valor_original="400", vencimento=em(-1), pessoa_id=f1["id"]
    )
    assert contas.pagar(c["F"], "100").status_code == 201
    c["G"] = contas.criar(descricao="Seguro", valor_original="60", vencimento=em(7))
    c["H"] = contas.criar(descricao="Contador", valor_original="80", vencimento=em(8))
    c["I"] = contas.criar(descricao="Conta antiga", valor_original="70", vencimento=em(-45))
    assert contas.pagar(c["I"], "70", data_pagamento=em(-40)).json()["status"] == "pago"
    c["J"] = contas.criar(descricao="Pago e estornado", valor_original="30", vencimento=em(1))
    baixa = contas.pagar(c["J"], "30").json()["baixas"][0]
    assert contas.estornar(c["J"], baixa).status_code == 200
    return c


def ids(r, cenario):
    inverso = {v["id"]: k for k, v in cenario.items() if k not in ("f1", "f2")}
    return [inverso[i["id"]] for i in r.json()["itens"]]


def test_listagem_filtros_ordem_e_paginacao(contas, cenario):
    c = cenario
    todos = contas.get("/contas-pagar")
    assert todos.json()["total"] == 10
    assert ids(todos, c) == list("IADFBJEGHC")  # vencimento crescente, depois id
    assert (todos.json()["limite"], todos.json()["deslocamento"]) == (50, 0)

    for situacao, esperado in (
        ("aberto", "AFBJGHC"),
        ("vencido", "AF"),
        ("a_vencer", "BJGHC"),
        ("pago", "ID"),
        ("cancelado", "E"),
        ("todos", "IADFBJEGHC"),
    ):
        r = contas.get("/contas-pagar", situacao=situacao)
        assert ids(r, c) == list(esperado), situacao
        assert r.json()["total"] == len(esperado)

    por_item = {i["id"]: i for i in todos.json()["itens"]}
    assert (por_item[c["A"]["id"]]["situacao"], por_item[c["A"]["id"]]["dias_para_vencer"]) == (
        "vencido",
        -3,
    )
    assert (por_item[c["B"]["id"]]["situacao"], por_item[c["B"]["id"]]["dias_para_vencer"]) == (
        "a_vencer",
        0,
    )  # vence hoje ainda não está vencido
    f = por_item[c["F"]["id"]]
    assert (f["valor_original"], f["valor_pago"], f["saldo"]) == ("400.00", "100.00", "300.00")
    assert (
        f["fornecedor"] == {"id": c["f1"]["id"], "nome": "Atacado Sul"} and f["categoria"] is None
    )
    assert por_item[c["D"]["id"]]["dias_para_vencer"] is None
    assert por_item[c["D"]["id"]]["pago_em"] == hoje_local()
    assert por_item[c["E"]["id"]]["situacao"] == "cancelado"
    assert "baixas" not in f  # a listagem não carrega as baixas; o detalhe sim

    assert ids(contas.get("/contas-pagar", pessoa_id=c["f1"]["id"]), c) == list("FB")
    assert ids(contas.get("/contas-pagar", categoria_id=contas.categorias["Aluguel"]), c) == ["A"]
    janela = contas.get("/contas-pagar", vencimento_de=em(0), vencimento_ate=em(7))
    assert ids(janela, c) == list("BJEG")  # as duas pontas são inclusivas
    assert ids(contas.get("/contas-pagar", vencimento_ate=em(-2)), c) == list("IA")
    assert ids(contas.get("/contas-pagar", q="aluguel"), c) == ["A"]  # descrição, sem caixa
    assert ids(contas.get("/contas-pagar", q="NF-77"), c) == ["B"]  # documento
    assert ids(contas.get("/contas-pagar", q="atacado"), c) == list("FB")  # nome do fornecedor
    assert ids(contas.get("/contas-pagar", q="Gráfica"), c) == ["C"]
    assert ids(contas.get("/contas-pagar", q="Compra"), c) == list("FB")
    assert ids(contas.get("/contas-pagar", situacao="vencido", q="compra"), c) == ["F"]

    pagina = contas.get("/contas-pagar", limite=3, deslocamento=2)
    assert ids(pagina, c) == list("DFB") and pagina.json()["total"] == 10
    assert contas.get("/contas-pagar", limite=201).status_code == 422
    assert contas.get("/contas-pagar", limite=200).status_code == 200
    assert contas.get("/contas-pagar", situacao="atrasado").status_code == 422
    r = contas.get("/contas-pagar", vencimento_de=em(5), vencimento_ate=em(1))
    assert r.status_code == 422 and codigo(r) == "periodo_invalido"

    detalhe = contas.titulo(c["F"])
    assert [b["valor"] for b in detalhe["baixas"]] == ["100.00"]


def test_resumo_de_vencimentos_e_pago_no_mes(contas, cenario):
    r = contas.get("/contas-pagar/resumo").json()
    assert r["data_referencia"] == hoje_local()
    # abertos: A 1000 (vencido), F 300 (vencido), B 500 (hoje), J 30, G 60 (em 7 dias), H 80, C 200
    assert (r["em_aberto"], r["em_aberto_qtd"]) == ("2170.00", 7)
    assert (r["vencido"], r["vencido_qtd"]) == ("1300.00", 2)
    # de hoje até hoje + 7: B, J e G; H (8 dias) e C (10 dias) ficam de fora
    assert (r["a_vencer_7_dias"], r["a_vencer_7_dias_qtd"]) == ("590.00", 3)
    # pagos neste mês: D 150 + F 100 + J (30 pago e estornado = 0); I foi pago há 40 dias
    assert (r["pago_no_mes"], r["pago_no_mes_qtd"]) == ("250.00", 2)
    mes = datetime.fromisoformat(hoje_local()).date()
    assert r["mes_de"] == mes.replace(day=1).isoformat()
    assert r["mes_ate"][:8] == hoje_local()[:8] and int(r["mes_ate"][8:]) >= mes.day


def test_listagem_nao_faz_n_mais_1(contas):
    consultas = []

    @event.listens_for(get_engine(), "before_cursor_execute")
    def contar(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001, ARG001
        consultas.append(statement)

    try:
        primeiro = contas.criar(
            pessoa_id=contas.fornecedor("Fornecedor 0")["id"],
            categoria_id=contas.categorias["Aluguel"],
        )
        contas.pagar(primeiro, "10")
        consultas.clear()
        assert contas.get("/contas-pagar").json()["total"] == 1
        com_um = len(consultas)

        for i in range(1, 12):
            t = contas.criar(
                pessoa_id=contas.fornecedor(f"Fornecedor {i}")["id"],
                categoria_id=contas.categorias["Aluguel"],
            )
            contas.pagar(t, "10")
        consultas.clear()
        assert contas.get("/contas-pagar").json()["total"] == 12
        assert len(consultas) == com_um, f"{com_um} consultas com 1 título, {len(consultas)} com 12"
        assert len(consultas) <= 10
    finally:
        event.remove(get_engine(), "before_cursor_execute", contar)


# --- fuso da empresa ---------------------------------------------------------------------------


def test_vencido_e_data_de_pagamento_seguem_o_fuso_da_empresa(contas):
    """Pago Pago (UTC-11) e Kiritimati (UTC+14) estão 25 h afastados: a data de calendário de um
    já passou no outro, a qualquer hora em que o teste rode."""
    pago_pago, kiritimati = ZoneInfo("Pacific/Pago_Pago"), ZoneInfo("Pacific/Kiritimati")
    dia_pp = datetime.now(pago_pago).date()
    dia_ki = datetime.now(kiritimati).date()
    assert dia_ki > dia_pp

    def fuso(nome):
        r = contas.patch("/configuracoes", {"timezone": nome})
        assert r.status_code == 200, r.text

    fuso("Pacific/Pago_Pago")
    t = contas.criar(vencimento=dia_pp.isoformat(), valor_original="100")
    assert (t["situacao"], t["dias_para_vencer"]) == ("a_vencer", 0)
    r = contas.get("/contas-pagar/resumo").json()
    assert r["data_referencia"] == dia_pp.isoformat()
    assert (r["vencido"], r["a_vencer_7_dias"]) == ("0.00", "100.00")
    assert contas.get("/contas-pagar", situacao="vencido").json()["total"] == 0
    # "hoje" é o de Pago Pago: o dia de Kiritimati ainda não chegou, logo é data futura
    rec = contas.pagar(t, "10", data_pagamento=dia_ki.isoformat())
    assert rec.status_code == 422 and codigo(rec) == "data_futura"

    fuso("Pacific/Kiritimati")
    t = contas.titulo(t)
    assert t["situacao"] == "vencido" and t["dias_para_vencer"] < 0
    r = contas.get("/contas-pagar/resumo").json()
    assert (r["vencido"], r["a_vencer_7_dias"]) == ("100.00", "0.00")
    assert contas.get("/contas-pagar", situacao="vencido").json()["total"] == 1
    assert contas.get("/contas-pagar", situacao="a_vencer").json()["total"] == 0
    # padrão da data de pagamento: hoje no fuso da empresa
    pago = contas.pagar(t, "10")
    assert pago.json()["baixas"][0]["data_pagamento"] == dia_ki.isoformat()
    assert contas.pagar(t, "10", data_pagamento=dia_pp.isoformat()).status_code == 201


# --- permissões --------------------------------------------------------------------------------

ROTAS_E_PERMISSOES = {
    ("GET", f"{API}/contas-pagar"): "contas_pagar.listar",
    ("GET", f"{API}/contas-pagar/resumo"): "contas_pagar.listar",
    ("POST", f"{API}/contas-pagar"): "contas_pagar.criar",
    ("GET", f"{API}/contas-pagar/{{titulo_id}}"): "contas_pagar.listar",
    ("PATCH", f"{API}/contas-pagar/{{titulo_id}}"): "contas_pagar.editar",
    ("POST", f"{API}/contas-pagar/{{titulo_id}}/cancelar"): "contas_pagar.cancelar",
    ("POST", f"{API}/contas-pagar/{{titulo_id}}/baixas"): "contas_pagar.baixar",
    ("POST", f"{API}/contas-pagar/{{titulo_id}}/baixas/{{baixa_id}}/estornar"): "contas_pagar.cancelar",
    ("GET", f"{API}/relatorios/compras"): "relatorios.compras",
    ("GET", f"{API}/relatorios/produtos"): "relatorios.produtos",
}  # fmt: skip
NOVAS = set(ROTAS_E_PERMISSOES.values())


def test_politica_de_acesso_das_rotas_novas_esta_registrada(ambiente):
    """Os routers novos estão em ROUTERS (então entram nos testes de política de rotas) e cada rota
    exige exatamente a permissão esperada."""
    achadas = {
        (m, r.path): _politica(r)[0]
        for m, r in _rotas(ambiente.app)
        if "/contas-pagar" in r.path
        or r.path.endswith(("/relatorios/compras", "/relatorios/produtos"))
    }
    assert achadas == ROTAS_E_PERMISSOES


def test_cada_permissao_libera_so_as_suas_rotas(ambiente, contas):
    t = contas.criar()
    baixa = contas.pagar(t, "10").json()["baixas"][0]
    corpos = {"POST": {}, "PATCH": {}}
    for i, permissao in enumerate(sorted(NOVAS)):
        criar_papel(f"So {permissao}", [permissao])
        email = f"so{i}@x.com"
        criar_usuario(f"Usuario {i}", email, papeis=(f"So {permissao}",))
        cli = ambiente.cliente()
        h = login(cli, email, "OutraSenha#2026")
        for (metodo, caminho), exigida in ROTAS_E_PERMISSOES.items():
            url = caminho.replace("{titulo_id}", str(t["id"])).replace(
                "{baixa_id}", str(baixa["id"])
            )
            r = cli.request(
                metodo, url, headers=h, **({"json": corpos[metodo]} if metodo in corpos else {})
            )
            negado = r.status_code == 403
            assert negado == (exigida != permissao), (
                f"{permissao} em {metodo} {url}: {r.status_code}"
            )
            if negado:
                assert codigo(r) == "sem_permissao"


def test_papeis_de_sistema_recebem_as_permissoes_novas_so_onde_devem(ambiente, admin):
    c, h = admin
    papeis = {
        p["nome"]: {x["codigo"] for x in p["permissoes"]}
        for p in c.get(f"{API}/papeis", headers=h).json()
    }
    novas = {
        "contas_pagar.listar", "contas_pagar.criar", "contas_pagar.editar",
        "contas_pagar.baixar", "contas_pagar.cancelar", "relatorios.compras", "relatorios.produtos",
    }  # fmt: skip
    assert novas <= papeis["Administrador"] and novas <= papeis["Gerente"]
    assert not novas & papeis["Frente de loja"] and not novas & papeis["Atendente"]
    # as permissões que já existiam seguem como estavam
    antigas = {
        "dashboard.ver",
        "relatorios.vendas",
        "relatorios.caixa",
        "relatorios.estoque",
        "relatorios.perdas",
    }
    assert antigas <= papeis["Administrador"] and antigas <= papeis["Gerente"]
    assert not antigas & papeis["Frente de loja"] and not antigas & papeis["Atendente"]
    assert {"financeiro.listar", "financeiro.baixar"} <= papeis["Frente de loja"]


def test_frente_de_loja_e_atendente_nao_enxergam_contas_a_pagar_e_gerente_sim(ambiente):
    caminhos = (
        "/contas-pagar",
        "/contas-pagar/resumo",
        "/relatorios/compras",
        "/relatorios/produtos",
    )
    for papel, email in (
        ("Frente de loja", "frente@x.com"),
        ("Atendente", "atend@x.com"),
        ("Gerente", "ger@x.com"),
    ):
        criar_usuario(papel, email, papeis=(papel,))
        cli = ambiente.cliente()
        h = login(cli, email, "OutraSenha#2026")
        for caminho in caminhos:
            esperado = 200 if papel == "Gerente" else 403
            assert cli.get(f"{API}{caminho}", headers=h).status_code == esperado, (papel, caminho)
        corpo = {"descricao": "x", "valor_original": "1", "vencimento": em(1)}
        esperado = 201 if papel == "Gerente" else 403
        assert cli.post(f"{API}/contas-pagar", headers=h, json=corpo).status_code == esperado


# --- auditoria ---------------------------------------------------------------------------------


def test_cada_operacao_fica_na_auditoria_com_antes_e_depois(contas, ambiente):
    t = contas.criar(descricao="Conta auditada", documento="NF 123/4", valor_original="100")
    contas.patch(f"/contas-pagar/{t['id']}", {"descricao": "Conta auditada (editada)"})
    baixa = contas.pagar(t, "40").json()["baixas"][0]
    contas.estornar(t, baixa, "valor lançado errado")
    contas.cancelar(t, "cancelada no teste")
    refuga = len(auditoria(ambiente, modulo="contas_pagar"))
    assert contas.pagar(t, "10").status_code == 409  # recusa não audita
    assert len(auditoria(ambiente, modulo="contas_pagar")) == refuga

    logs = auditoria(ambiente, modulo="contas_pagar", recurso="titulo_pagar")
    assert [(x["acao"], x["recurso_id"]) for x in logs] == [
        ("CREATE", str(t["id"])),
        ("UPDATE", str(t["id"])),
        ("PAGAMENTO", str(t["id"])),
        ("ESTORNO", str(t["id"])),
        ("CANCELAMENTO", str(t["id"])),
    ]
    criar_, editar, pagar, estornar, cancelar = logs
    assert all(x["usuario_nome"] == "Admin Teste" for x in logs)
    assert criar_["antes"] is None and criar_["depois"]["descricao"] == "Conta auditada"
    # o número da nota não é mascarado como CPF/CNPJ
    assert (
        criar_["depois"]["numero_documento"] == "NF 123/4" and "documento" not in criar_["depois"]
    )
    assert editar["campos_alterados"] == ["descricao"]
    assert editar["antes"]["descricao"] == "Conta auditada"
    assert editar["depois"]["descricao"] == "Conta auditada (editada)"
    assert (
        Decimal(pagar["antes"]["valor_pago"]) == 0 and Decimal(pagar["depois"]["valor_pago"]) == 40
    )
    assert pagar["depois"]["baixa_id"] == baixa["id"] and pagar["depois"]["status"] == "aberto"
    assert Decimal(estornar["depois"]["valor_pago"]) == 0
    assert (
        estornar["depois"]["estorno_de_id"] == baixa["id"]
        and "valor lançado errado" in estornar["descricao"]
    )
    assert (
        cancelar["depois"]["status"] == "cancelado"
        and "cancelada no teste" in cancelar["descricao"]
    )


def test_falha_na_auditoria_desfaz_a_operacao_mesma_transacao(contas, ambiente, monkeypatch):
    t = contas.criar(valor_original="100")

    def quebra(*args, **kwargs):
        raise RuntimeError("auditoria indisponível")

    monkeypatch.setattr("app.modules.payables.service.registrar", quebra)
    with ambiente.cliente(raise_server_exceptions=True) as cli, pytest.raises(RuntimeError):
        contas.pagar(t, "40", cli=cli)
    with ambiente.cliente(raise_server_exceptions=True) as cli, pytest.raises(RuntimeError):
        contas.post(f"/contas-pagar/{t['id']}/cancelar", {"motivo": "vai falhar"}, cli=cli)
    monkeypatch.undo()
    final = contas.titulo(t)
    assert (final["status"], final["valor_pago"], final["baixas"]) == ("aberto", "0.00", [])
    assert baixas_do_banco(ambiente, t) == []


# --- migration 0005 ----------------------------------------------------------------------------


def test_migration_0005_sobe_desce_e_nao_duplica_categoria_ja_existente(template_migrado):
    nome = f"mig5_{uuid.uuid4().hex[:10]}"
    admin_dsn = "postgresql://pdv_admin:pdv_admin_test@127.0.0.1:55432"
    with psycopg.connect(f"{admin_dsn}/postgres", autocommit=True) as conn:
        conn.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE pdv_test OWNER pdv_owner").format(
                sql.Identifier(nome)
            )
        )
    env = {**os.environ, **_base_env(nome)}

    def alembic(*args):
        r = subprocess.run(  # noqa: S603
            [sys.executable, "-m", "alembic", *args],
            cwd=Path(BACKEND),
            env=env,
            capture_output=True,
            text=True,
        )
        assert r.returncode == 0, r.stderr[-800:]

    def consulta(comando, *params):
        with psycopg.connect(f"{admin_dsn}/{nome}", autocommit=True) as conn:
            cur = conn.execute(comando, params or None)
            return cur.fetchall() if cur.description else []

    try:
        alembic("upgrade", "0004")
        # empresa que já criou "Aluguel" (com outra caixa) antes da migration
        consulta("INSERT INTO categoria_financeira (nome, tipo) VALUES ('aluguel', 'despesa')")
        alembic("upgrade", "head")
        despesas = consulta("SELECT nome FROM categoria_financeira WHERE tipo = 'despesa'")
        assert len(despesas) == 7 and sorted(n.lower() for (n,) in despesas) == sorted(
            [
                "mercadorias e insumos",
                "aluguel",
                "energia e água",
                "pessoal",
                "impostos e taxas",
                "manutenção",
                "outras despesas",
            ]  # fmt: skip
        )
        assert consulta(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'movimento_estoque' AND column_name = 'fornecedor_id'"
        ) == [(1,)]
        assert consulta(
            "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'titulo_pagar_baixa'::regclass AND tgname LIKE 'titulo_pagar_baixa_append_only%'"
        ) == [(2,)]
        assert consulta(
            "SELECT has_table_privilege(%s, 'titulo_pagar_baixa', 'UPDATE'), has_table_privilege(%s, 'titulo_pagar', 'UPDATE')",
            APP[0],
            APP[0],
        ) == [(False, True)]

        alembic("downgrade", "0004")
        assert consulta(
            "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'titulo_pagar%'"
        ) == [(0,)]
        assert consulta(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'movimento_estoque' AND column_name = 'fornecedor_id'"
        ) == [(0,)]
        alembic("upgrade", "head")
        assert consulta("SELECT count(*) FROM categoria_financeira WHERE tipo = 'despesa'") == [
            (7,)
        ]
    finally:
        with psycopg.connect(f"{admin_dsn}/postgres", autocommit=True) as conn:
            conn.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(nome))
            )


# --- categorias financeiras (reaproveitadas pelas contas a pagar) --------------------------------


def test_categorias_de_despesa_padrao_e_nova_categoria_aceita(contas):
    padrao = contas.get("/categorias-financeiras", tipo="despesa").json()
    assert sorted(c["nome"] for c in padrao) == sorted(
        [
            "Aluguel",
            "Energia e água",
            "Impostos e taxas",
            "Manutenção",
            "Mercadorias e insumos",
            "Outras despesas",
            "Pessoal",
        ]  # fmt: skip
    )
    assert all(c["tipo"] == "despesa" and c["ativa"] for c in padrao)
    nova = contas.post("/categorias-financeiras", {"nome": "Marketing", "tipo": "despesa"}).json()
    t = contas.criar(categoria_id=nova["id"])
    assert t["categoria"] == {"id": nova["id"], "nome": "Marketing"}
    # em uso por conta a pagar: não exclui (desativa)
    r = contas.c.delete(f"{API}/categorias-financeiras/{nova['id']}", headers=contas.h)
    assert r.status_code == 409 and codigo(r) == "categoria_em_uso"
    assert "a pagar" in r.json()["erro"]["mensagem"]
    r = contas.c.patch(
        f"{API}/categorias-financeiras/{nova['id']}", headers=contas.h, json={"ativa": False}
    )
    assert r.status_code == 200
    # inativa, não aceita novas contas, mas a existente segue consultável
    assert (
        contas.post(
            "/contas-pagar",
            {
                "descricao": "x",
                "valor_original": "1",
                "vencimento": em(1),
                "categoria_id": nova["id"],
            },
        ).status_code
        == 422
    )
    assert contas.titulo(t)["categoria"]["nome"] == "Marketing"


# --- seed de demonstração ----------------------------------------------------------------------


def test_seed_demo_usa_fornecedor_nas_entradas_e_cria_quatro_contas_a_pagar(ambiente):
    with get_sessionmaker()() as db:
        assert semear(db) is True
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    contas = Contas(c, h)

    movimentos = contas.get("/estoque/movimentos", tipo="entrada", limite=100).json()["itens"]
    assert len(movimentos) == 10
    assert {m["fornecedor"]["nome"] for m in movimentos} == {"Distribuidora Boa Mesa Ltda"}
    assert {m["documento"] for m in movimentos} == {"Carga inicial"}

    itens = contas.get("/contas-pagar", limite=10).json()["itens"]
    assert len(itens) == 4
    por_situacao = sorted(i["situacao"] for i in itens)
    assert por_situacao == ["a_vencer", "a_vencer", "pago", "vencido"]
    vencida = next(i for i in itens if i["situacao"] == "vencido")
    assert vencida["dias_para_vencer"] == -5 and vencida["valor_pago"] == "0.00"
    parcial = next(i for i in itens if i["descricao"] == "Compra de bebidas")
    assert (parcial["valor_pago"], parcial["saldo"], parcial["status"]) == (
        "500.00",
        "700.00",
        "aberto",
    )
    assert parcial["fornecedor"]["nome"] == "Distribuidora Boa Mesa Ltda"
    paga = next(i for i in itens if i["situacao"] == "pago")
    assert paga["saldo"] == "0.00" and paga["pago_em"] == em(-3)

    # contas a pagar não mexem no caixa nem no estoque da demonstração
    assert consultar(ambiente, "SELECT count(*) AS n FROM movimento_caixa")[0]["n"] == 0
    saldos = {
        s["nome"]: s["saldo"] for s in contas.get("/estoque/saldos", limite=100).json()["itens"]
    }
    assert saldos["Carne bovina moída"] == "25.000" and saldos["Refrigerante lata"] == "120.000"
    compras = contas.get("/relatorios/compras", agrupar="fornecedor").json()
    assert compras["resumo"]["valor_total"] == "3048.00"  # 10 entradas da carga inicial
    assert [(x["rotulo"], x["valor"]) for x in compras["linhas"]] == [
        ("Distribuidora Boa Mesa Ltda", "3048.00")
    ]
