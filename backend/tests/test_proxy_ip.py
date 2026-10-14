import ipaddress

from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

from app.core.context import get_context
from app.core.middleware import ContextoMiddleware

REDES = [ipaddress.ip_network("172.30.1.0/24")]


async def _app(scope, receive, send):
    ctx = get_context()
    await JSONResponse({"ip": ctx.ip, "request_id": ctx.request_id})(scope, receive, send)


def _cliente(ip: str) -> TestClient:
    return TestClient(ContextoMiddleware(_app, REDES), client=(ip, 5000))


def test_proxy_confiavel_repassa_ip_real_e_request_id():
    r = _cliente("172.30.1.5").get(
        "/", headers={"X-Forwarded-For": "203.0.113.9", "X-Request-ID": "abcdef0123456789"}
    )
    assert r.json() == {"ip": "203.0.113.9", "request_id": "abcdef0123456789"}
    assert r.headers["x-request-id"] == "abcdef0123456789"


def test_ip_forjado_vindo_de_fora_da_rede_confiavel_e_ignorado():
    r = _cliente("198.51.100.7").get(
        "/", headers={"X-Forwarded-For": "1.2.3.4", "X-Request-ID": "abcdef0123456789"}
    )
    assert r.json()["ip"] == "198.51.100.7"
    assert r.json()["request_id"] != "abcdef0123456789"


def test_xff_invalido_cai_no_par_tcp():
    r = _cliente("172.30.1.5").get("/", headers={"X-Forwarded-For": "nao-e-ip"})
    assert r.json()["ip"] == "172.30.1.5"


def test_usa_ultimo_valor_do_xff():
    r = _cliente("172.30.1.5").get("/", headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.9"})
    assert r.json()["ip"] == "203.0.113.9"


def test_request_id_malformado_e_substituido():
    r = _cliente("172.30.1.5").get("/", headers={"X-Request-ID": "x y\tz"})
    assert len(r.json()["request_id"]) == 32


def test_sem_redes_confiaveis_nunca_confia():
    c = TestClient(ContextoMiddleware(_app, []), client=("172.30.1.5", 5000))
    assert c.get("/", headers={"X-Forwarded-For": "1.2.3.4"}).json()["ip"] == "172.30.1.5"
