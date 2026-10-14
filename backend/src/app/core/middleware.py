import ipaddress
import logging
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.context import RequestContext, set_context

log = logging.getLogger("app.access")
_REQUEST_ID = re.compile(r"^[0-9a-fA-F-]{8,64}$")


def _ip_valido(texto: str) -> str | None:
    try:
        return str(ipaddress.ip_address(texto.strip()))
    except ValueError:
        return None


class ContextoMiddleware:
    """Cria o contexto da requisição (request_id, IP real, user-agent) e o access log.

    IP e X-Request-ID vindos de cabeçalho só valem quando o par TCP está em
    `redes_confiaveis` (o Nginx da própria empresa). Fora isso, o cabeçalho é ignorado.
    """

    def __init__(
        self,
        app: ASGIApp,
        redes_confiaveis: list[ipaddress.IPv4Network | ipaddress.IPv6Network],
    ) -> None:
        self.app = app
        self.redes = redes_confiaveis

    def _confia(self, peer: str | None) -> bool:
        ip = _ip_valido(peer) if peer else None
        return ip is not None and any(ipaddress.ip_address(ip) in r for r in self.redes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        cab = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        peer = scope["client"][0] if scope.get("client") else None
        ip = peer
        request_id = uuid.uuid4().hex
        if self._confia(peer):
            encaminhado = _ip_valido(cab.get("x-forwarded-for", "").split(",")[-1])
            ip = encaminhado or peer
            if _REQUEST_ID.match(cab.get("x-request-id", "")):
                request_id = cab["x-request-id"]

        ctx = RequestContext(request_id=request_id, ip=ip, user_agent=cab.get("user-agent"))
        set_context(ctx)
        inicio = time.perf_counter()
        status = 500

        async def send_com_id(msg: Message) -> None:
            nonlocal status
            if msg["type"] == "http.response.start":
                status = msg["status"]
                msg.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(msg)

        try:
            await self.app(scope, receive, send_com_id)
        finally:
            log.info(
                "requisição",
                extra={
                    "metodo": scope["method"],
                    "caminho": scope["path"],
                    "status": status,
                    "duracao_ms": round((time.perf_counter() - inicio) * 1000, 1),
                    "ip": ip,
                    "usuario_id": ctx.usuario_id,
                },
            )
