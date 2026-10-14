import json
import logging
import sys
from datetime import UTC, datetime

from app.core.context import get_context

_PADRAO = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    """Uma linha JSON por evento. Só campos explícitos (`extra=`): nunca corpo de requisição."""

    def format(self, record: logging.LogRecord) -> str:
        dados: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "nivel": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = get_context().request_id
        if request_id:
            dados["request_id"] = request_id
        for chave, valor in record.__dict__.items():
            if chave not in _PADRAO and not chave.startswith("_"):
                dados[chave] = valor
        if record.exc_info:
            dados["excecao"] = self.formatException(record.exc_info)
        return json.dumps(dados, ensure_ascii=False, default=str)


def configurar_logging(nivel: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler._pdv = True  # type: ignore[attr-defined]  # marca o handler do app (não derruba os de fora)
    raiz = logging.getLogger()
    raiz.handlers[:] = [h for h in raiz.handlers if not getattr(h, "_pdv", False)] + [handler]
    raiz.setLevel(nivel)
    # O access log próprio do app substitui o do uvicorn (que inclui a query string).
    logging.getLogger("uvicorn.access").disabled = True
