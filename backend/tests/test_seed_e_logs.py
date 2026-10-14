import json

from app.core.db import get_sessionmaker
from app.core.logging import JsonFormatter
from app.seed_demo import semear
from conftest import EMAIL_ADMIN, SENHA_ADMIN, auditoria, consultar, login


def test_seed_demo_cria_dados_validos_e_e_idempotente(ambiente):
    with get_sessionmaker()() as db:
        assert semear(db) is True
    with get_sessionmaker()() as db:
        assert semear(db) is False  # empresa já tem produtos: nada muda
    c = ambiente.cliente()
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    assert c.get("/api/v1/mesas", headers=h).json().__len__() == 10
    produtos = c.get("/api/v1/produtos", headers=h, params={"limite": 100}).json()
    assert produtos["total"] == 14
    hamb = next(p for p in produtos["itens"] if p["nome"] == "Hambúrguer artesanal")
    assert [i["insumo_nome"] for i in hamb["composicao"]] == [
        "Pão de hambúrguer",
        "Carne bovina moída",
    ]
    assert hamb["custo_ficha"] == "8.0400"  # 1*1.20 + 0.18*38
    saldos = {
        s["nome"]: s["saldo"]
        for s in c.get("/api/v1/estoque/saldos", headers=h, params={"limite": 100}).json()["itens"]
    }
    assert saldos["Carne bovina moída"] == "25.000"
    assert auditoria(ambiente, usuario_nome="seed-demo")
    fiel = c.get("/api/v1/pessoas", headers=h, params={"q": "Fiel"}).json()["itens"][0]
    assert fiel["cliente"] == {"aceita_fiado": True, "limite_fiado": "300.00"}
    assert consultar(ambiente, "SELECT count(*) AS n FROM movimento_estoque")[0]["n"] == 10


def test_logs_estruturados_nao_vazam_segredos_nem_dados_pessoais(ambiente, caplog):
    caplog.set_level("INFO")
    c = ambiente.cliente()
    c.post("/api/v1/auth/login", json={"email": EMAIL_ADMIN, "senha": "SenhaQueNaoDeveAparecer#1"})
    h = login(c, EMAIL_ADMIN, SENHA_ADMIN)
    c.get("/api/v1/pessoas", headers=h, params={"q": "529.982.247-25"})
    c.post(
        "/api/v1/pessoas",
        headers=h,
        json={
            "tipo": "F",
            "nome": "Fulano Sigiloso",
            "documento": "52998224725",
            "papeis": ["cliente"],
        },
    )
    # o que o handler JSON do app escreveria na saída, linha a linha
    formatador = JsonFormatter()
    linhas = [json.loads(formatador.format(r)) for r in caplog.records if r.name.startswith("app")]
    saida = "\n".join(json.dumps(x, ensure_ascii=False) for x in linhas)

    acessos = [x for x in linhas if x["logger"] == "app.access"]
    assert len(acessos) >= 4
    for segredo in (
        "SenhaQueNaoDeveAparecer",
        SENHA_ADMIN,
        "Authorization",
        "Bearer",
        "pdv_refresh",
        "529.982",
        "52998224725",
        "Fulano Sigiloso",
    ):
        assert segredo not in saida, f"vazou nos logs: {segredo}"
    acesso = next(x for x in acessos if x["caminho"] == "/api/v1/pessoas" and x["metodo"] == "GET")
    assert set(acesso) >= {"ts", "nivel", "request_id", "status", "duracao_ms", "ip", "usuario_id"}
    assert "q=" not in saida  # a query string nunca é registrada
