"""Fixtures de teste: Postgres real, um banco novo (clone do template migrado) por teste.

Requer o Postgres de teste no ar: `make db-test-up`.
O banco `pdv_test` (criado pelo script de roles da imagem) nunca é tocado: serve de molde para o
template `pdv_tpl`, que recebe as migrations uma vez por sessão.
"""

import os
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg import sql

HOST = os.environ.get("PDV_TEST_PG_HOST", "127.0.0.1")
PORT = os.environ.get("PDV_TEST_PG_PORT", "55432")
ADMIN_DSN = f"postgresql://pdv_admin:pdv_admin_test@{HOST}:{PORT}/postgres"
OWNER = ("pdv_owner", "pdv_owner_test")
APP = ("pdv_app", "pdv_app_test")
MOLDE = "pdv_test"
# Nome único por sessão de testes: duas execuções simultâneas não pisam uma na outra.
TEMPLATE = f"pdv_tpl_{uuid.uuid4().hex[:8]}"
BACKEND = Path(__file__).resolve().parent.parent

SENHA_ADMIN = "SenhaForte#2026"
EMAIL_ADMIN = "admin@teste.example.com"


def _url(db: str, cred: tuple[str, str]) -> str:
    return f"postgresql+psycopg://{cred[0]}:{cred[1]}@{HOST}:{PORT}/{db}"


def _admin_exec(*comandos: sql.Composable) -> None:
    with psycopg.connect(ADMIN_DSN, autocommit=True) as conn:
        for c in comandos:
            # CREATE DATABASE ... TEMPLATE falha enquanto outra sessão clona o mesmo molde.
            for tentativa in range(20):
                try:
                    conn.execute(c)
                    break
                except psycopg.errors.ObjectInUse:
                    if tentativa == 19:
                        raise
                    time.sleep(0.25)


def _base_env(db: str) -> dict[str, str]:
    return {
        "DATABASE_URL": _url(db, APP),
        "DATABASE_OWNER_URL": _url(db, OWNER),
        "DB_APP_USER": APP[0],
        "JWT_SECRET": "segredo-de-teste-com-mais-de-32-caracteres!!",
        "EMPRESA_NOME": "Teste",
        "EMPRESA_SLUG": "teste",
        "TIMEZONE": "America/Fortaleza",
        "COOKIE_SECURE": "true",
        "TRUSTED_PROXY_CIDRS": "",
    }


def _limpar_caches() -> None:
    from app.core import db as core_db
    from app.core.config import get_settings

    if core_db.get_engine.cache_info().currsize:
        core_db.get_engine().dispose()
    get_settings.cache_clear()
    core_db.get_engine.cache_clear()
    core_db.get_sessionmaker.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def template_migrado() -> Iterator[None]:
    try:
        psycopg.connect(ADMIN_DSN, connect_timeout=3).close()
    except psycopg.OperationalError as exc:
        pytest.exit(f"Postgres de teste indisponível ({exc}). Rode: make db-test-up", returncode=2)

    _admin_exec(
        sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(TEMPLATE)),
        sql.SQL("CREATE DATABASE {} TEMPLATE {} OWNER {}").format(
            sql.Identifier(TEMPLATE), sql.Identifier(MOLDE), sql.Identifier(OWNER[0])
        ),
    )
    env = {**os.environ, **_base_env(TEMPLATE)}
    for cmd in (
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        [sys.executable, "-m", "app.cli", "bootstrap"],
    ):
        subprocess.run(cmd, cwd=BACKEND, env=env, check=True, capture_output=True, text=True)
    yield
    _admin_exec(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(TEMPLATE)))


@dataclass
class Ambiente:
    db_nome: str
    app: FastAPI

    def cliente(self, ip: str | None = None, **kw: object) -> TestClient:
        extra = {"client": (ip, 50000)} if ip else {}
        return TestClient(self.app, base_url="https://testserver", **extra, **kw)

    def conexao_admin(self) -> psycopg.Connection:
        return psycopg.connect(ADMIN_DSN.rsplit("/", 1)[0] + f"/{self.db_nome}", autocommit=True)

    def conexao(self, cred: tuple[str, str]) -> psycopg.Connection:
        dsn = f"postgresql://{cred[0]}:{cred[1]}@{HOST}:{PORT}/{self.db_nome}"
        return psycopg.connect(dsn, autocommit=True)


@pytest.fixture
def ambiente(template_migrado: None) -> Iterator[Ambiente]:
    nome = f"t_{uuid.uuid4().hex[:12]}"
    _admin_exec(
        sql.SQL("CREATE DATABASE {} TEMPLATE {} OWNER {}").format(
            sql.Identifier(nome), sql.Identifier(TEMPLATE), sql.Identifier(OWNER[0])
        )
    )
    antigo = {k: os.environ.get(k) for k in _base_env(nome)}
    os.environ.update(_base_env(nome))
    _limpar_caches()

    from app.cli import create_admin
    from app.main import create_app

    create_admin(EMAIL_ADMIN, "Admin Teste", SENHA_ADMIN)
    # O admin do CLI nasce com troca de senha pendente; nos testes ele já está pronto.
    from sqlalchemy import update

    from app.core.db import get_sessionmaker
    from app.modules.users.models import Usuario

    with get_sessionmaker()() as s:
        s.execute(update(Usuario).values(must_change_password=False))
        s.commit()

    yield Ambiente(db_nome=nome, app=create_app())

    _limpar_caches()
    for k, v in antigo.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    _admin_exec(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(nome)))


def criar_usuario(
    nome: str,
    email: str,
    senha: str = "OutraSenha#2026",
    papeis: tuple[str, ...] = (),
    must_change: bool = False,
    suspenso: bool = False,
) -> int:
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.core.security import hash_senha
    from app.modules.rbac.models import Papel
    from app.modules.users.models import Usuario

    with get_sessionmaker()() as s:
        pap = list(s.scalars(select(Papel).where(Papel.nome.in_(papeis))))
        assert len(pap) == len(papeis), f"papéis inexistentes: {papeis}"
        u = Usuario(
            nome=nome,
            email=email,
            senha_hash=hash_senha(senha),
            must_change_password=must_change,
            suspenso=suspenso,
            papeis=pap,
        )
        s.add(u)
        s.commit()
        return u.id


def criar_papel(nome: str, permissoes: list[str], limite_desconto: str = "0") -> int:
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.modules.rbac.models import Papel, Permissao

    with get_sessionmaker()() as s:
        perms = list(s.scalars(select(Permissao).where(Permissao.codigo.in_(permissoes))))
        assert len(perms) == len(permissoes)
        p = Papel(
            nome=nome,
            sistema=False,
            permissoes=perms,
            limite_desconto_pct=Decimal(limite_desconto),
        )
        s.add(p)
        s.commit()
        return p.id


def login(cliente: TestClient, email: str, senha: str) -> dict[str, str]:
    r = cliente.post("/api/v1/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def consultar(ambiente: Ambiente, consulta: str, *params: object) -> list[dict]:
    """SELECT como superusuário (só para asserções)."""
    from psycopg.rows import dict_row

    with ambiente.conexao_admin() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(consulta, params or None)
        return cur.fetchall()


def auditoria(ambiente: Ambiente, **filtros: object) -> list[dict]:
    where = " AND ".join(f"{k} = %s" for k in filtros) or "TRUE"
    return consultar(
        ambiente, f"SELECT * FROM auditoria_log WHERE {where} ORDER BY id", *filtros.values()
    )


@pytest.fixture
def admin(ambiente: Ambiente):
    """(cliente, cabeçalhos) já autenticado como administrador."""
    c = ambiente.cliente()
    return c, login(c, EMAIL_ADMIN, SENHA_ADMIN)


def unidade_id(c: TestClient, h: dict[str, str], sigla: str) -> int:
    unidades = c.get("/api/v1/unidades", headers=h).json()
    return next(u["id"] for u in unidades if u["sigla"] == sigla)


def novo_produto(c: TestClient, h: dict[str, str], nome: str, **campos: object) -> dict:
    corpo = {"nome": nome, "tipo": "revenda", "unidade_id": unidade_id(c, h, "UN")} | campos
    r = c.post("/api/v1/produtos", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


class Pdv:
    """Cenário mínimo de operação: formas, mesas, produtos com estoque e caixa do admin aberto."""

    def __init__(self, c: TestClient, h: dict[str, str], ambiente: "Ambiente") -> None:
        self.c, self.h, self.ambiente = c, h, ambiente
        self.formas = {
            f["tipo"]: f["id"] for f in c.get("/api/v1/formas-pagamento", headers=h).json()
        }
        self.mesa1 = self.post("/mesas", {"nome": "Mesa 1", "capacidade": 4}).json()
        self.mesa2 = self.post("/mesas", {"nome": "Mesa 2", "capacidade": 4}).json()
        kg, un = unidade_id(c, h, "KG"), unidade_id(c, h, "UN")
        self.refri = novo_produto(c, h, "Refrigerante", preco_venda="7.50")
        self.pao = novo_produto(c, h, "Pão", tipo="insumo", unidade_id=un, custo_inicial="0.5")
        self.carne = novo_produto(c, h, "Carne", tipo="insumo", unidade_id=kg, custo_inicial="30")
        self.hamb = novo_produto(c, h, "Hambúrguer", tipo="preparado", preco_venda="20")
        c.put(
            f"/api/v1/produtos/{self.hamb['id']}/composicao",
            headers=h,
            json={
                "itens": [
                    {"insumo_id": self.pao["id"], "quantidade": "1"},
                    {"insumo_id": self.carne["id"], "quantidade": "0.15"},
                ]
            },
        ).raise_for_status()
        for produto, qtd in ((self.refri, 100), (self.pao, 50), (self.carne, 10)):
            c.post(
                "/api/v1/estoque/entradas",
                headers=h,
                json={"produto_id": produto["id"], "quantidade": str(qtd)},
            ).raise_for_status()
        self.caixa = c.post(
            "/api/v1/caixas/abrir", headers=h, json={"valor_abertura": "100"}
        ).json()

    # atalhos
    def post(self, caminho: str, corpo: dict | None = None):
        return self.c.post(f"/api/v1{caminho}", headers=self.h, json=corpo or {})

    def get(self, caminho: str, **params):
        return self.c.get(f"/api/v1{caminho}", headers=self.h, params=params)

    def comanda(self, mesa: dict | None = None, **extra) -> dict:
        corpo = {"tipo": "mesa", "mesa_id": (mesa or self.mesa1)["id"]} | extra
        r = self.post("/comandas", corpo)
        assert r.status_code == 201, r.text
        return r.json()

    def item(self, comanda: dict, produto: dict, qtd: object = 1, **extra) -> dict:
        r = self.post(
            f"/comandas/{comanda['id']}/itens",
            {"produto_id": produto["id"], "quantidade": str(qtd)} | extra,
        )
        assert r.status_code == 201, r.text
        return r.json()

    def fechar(self, comanda: dict, pagamentos: list[dict], **extra):
        return self.post(f"/comandas/{comanda['id']}/fechar", {"pagamentos": pagamentos} | extra)

    def pg(self, tipo: str, valor: object, **extra) -> dict:
        return {"forma_pagamento_id": self.formas[tipo], "valor": str(valor)} | extra

    def saldo(self, produto: dict):
        return consultar(
            self.ambiente,
            "SELECT quantidade FROM estoque_saldo WHERE produto_id = %s",
            produto["id"],
        )[0]["quantidade"]


@pytest.fixture
def pdv(admin, ambiente):
    c, h = admin
    return Pdv(c, h, ambiente)
