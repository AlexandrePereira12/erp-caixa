"""Toda rota precisa declarar sua política de acesso; e cada política tem que valer."""

import re
from types import SimpleNamespace

from fastapi.routing import APIRoute

from app.main import API_PREFIX, ROUTERS
from app.modules.rbac.catalog import PERMISSOES
from conftest import auditoria, criar_papel, criar_usuario, login

PUBLICAS = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/health"),
}


def _chamadas(dependant):
    for dep in dependant.dependencies:
        yield dep.call
        yield from _chamadas(dep)


def _politica(rota) -> tuple[str | None, bool]:
    permissao, autenticado = None, False
    for call in _chamadas(rota.dependant):
        permissao = getattr(call, "__permissao__", permissao)
        autenticado = autenticado or getattr(call, "__autenticado__", False)
    return permissao, autenticado


def _rotas(app):
    """(método, rota) de todos os endpoints, com `rota.path` já prefixado por /api/v1.

    Parte da lista ROUTERS (o FastAPI recente não expõe as rotas incluídas em `app.routes`) e
    confere, pelo OpenAPI, que nenhum endpoint ficou de fora da lista.
    """
    achadas = {}
    for router in ROUTERS:
        for r in router.routes:
            if isinstance(r, APIRoute):
                for metodo in r.methods - {"HEAD", "OPTIONS"}:
                    achadas[(metodo, API_PREFIX + r.path)] = r
    do_openapi = {(m.upper(), p) for p, ops in app.openapi()["paths"].items() for m in ops}
    assert set(achadas) == do_openapi
    assert len(achadas) >= 25
    for (metodo, caminho), r in achadas.items():
        yield metodo, SimpleNamespace(path=caminho, dependant=r.dependant)


def _caminho(rota) -> str:
    return re.sub(r"\{[^}]+\}", "1", rota.path)


def test_toda_rota_declara_politica_de_acesso(ambiente):
    sem_politica = [
        f"{m} {r.path}"
        for m, r in _rotas(ambiente.app)
        if (m, r.path) not in PUBLICAS and not any(_politica(r))
    ]
    assert sem_politica == []


def test_permissoes_usadas_nas_rotas_existem_no_catalogo(ambiente):
    catalogo = {p.codigo for p in PERMISSOES}
    usadas = {_politica(r)[0] for _, r in _rotas(ambiente.app)} - {None}
    assert usadas <= catalogo
    assert len(usadas) >= 10


def test_sem_token_401_e_sem_permissao_403_em_toda_rota_protegida(ambiente):
    criar_papel("Vazio", [])
    criar_usuario("Sem Poder", "sempoder@x.com", papeis=("Vazio",))
    c = ambiente.cliente()
    h = login(c, "sempoder@x.com", "OutraSenha#2026")

    verificadas = 0
    for metodo, rota in _rotas(ambiente.app):
        if (metodo, rota.path) in PUBLICAS:
            continue
        permissao, _ = _politica(rota)
        url = _caminho(rota)
        corpo = {"json": {}} if metodo in {"POST", "PUT", "PATCH"} else {}

        anonimo = c.request(metodo, url, **corpo)
        assert anonimo.status_code == 401, f"{metodo} {rota.path} sem token: {anonimo.status_code}"

        if permissao:
            negado = c.request(metodo, url, headers=h, **corpo)
            assert negado.status_code == 403, f"{metodo} {rota.path}: {negado.status_code}"
            assert negado.json()["erro"]["codigo"] == "sem_permissao"
            verificadas += 1
    assert verificadas >= 15

    # cada negação ficou na auditoria, com a permissão que faltou
    negados = auditoria(ambiente, acao="ACESSO_NEGADO", modulo="auth")
    assert len(negados) == verificadas
    assert all(n["usuario_nome"] == "Sem Poder" for n in negados)


def test_politica_vale_com_a_permissao_certa(ambiente):
    criar_papel("So Lista", ["usuarios.listar"])
    criar_usuario("Lista", "lista@x.com", papeis=("So Lista",))
    c = ambiente.cliente()
    h = login(c, "lista@x.com", "OutraSenha#2026")
    assert c.get("/api/v1/usuarios", headers=h).status_code == 200
    assert c.post("/api/v1/usuarios", headers=h, json={}).status_code == 403
