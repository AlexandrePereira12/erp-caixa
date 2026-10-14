"""Contexto da requisição, lido pela auditoria e pelos campos created_by/updated_by."""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RequestContext:
    request_id: str = ""
    ip: str | None = None
    user_agent: str | None = None
    usuario_id: int | None = None
    usuario_nome: str | None = None
    papel: str | None = None


# Objeto mutável: dependências (em threadpool) preenchem o usuário depois do middleware.
_ctx: ContextVar[RequestContext | None] = ContextVar("request_context", default=None)


def get_context() -> RequestContext:
    ctx = _ctx.get()
    if ctx is None:
        ctx = RequestContext()
        _ctx.set(ctx)
    return ctx


def set_context(ctx: RequestContext) -> None:
    _ctx.set(ctx)
