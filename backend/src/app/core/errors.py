import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import DBAPIError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)


class AppError(Exception):
    """Erro de negócio com código estável para o frontend e mensagem em PT-BR."""

    def __init__(
        self,
        status: int,
        codigo: str,
        mensagem: str,
        detalhes: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(mensagem)
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.detalhes = detalhes
        self.headers = headers


class ErroDetalheOut(BaseModel):
    codigo: str
    mensagem: str
    detalhes: Any | None = None


class ErroOut(BaseModel):
    """Envelope de todo erro da API (declarado só para o contrato OpenAPI)."""

    erro: ErroDetalheOut


RESPOSTAS_DE_ERRO: dict[int | str, dict[str, Any]] = {
    401: {"model": ErroOut, "description": "Não autenticado ou token inválido."},
    403: {
        "model": ErroOut,
        "description": "Sem permissão, conta suspensa ou troca de senha pendente.",
    },
    404: {"model": ErroOut, "description": "Registro não encontrado."},
    409: {"model": ErroOut, "description": "Conflito com o estado atual (regra de negócio)."},
    422: {"model": ErroOut, "description": "Dados inválidos ou regra de negócio violada."},
}


def nao_encontrado(recurso: str) -> AppError:
    return AppError(404, "nao_encontrado", f"{recurso} não encontrado(a).")


def conflito(codigo: str, mensagem: str) -> AppError:
    return AppError(409, codigo, mensagem)


def proibido(codigo: str, mensagem: str) -> AppError:
    return AppError(403, codigo, mensagem)


def _resposta(
    status: int,
    codigo: str,
    mensagem: str,
    detalhes: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    corpo: dict[str, Any] = {"erro": {"codigo": codigo, "mensagem": mensagem}}
    if detalhes is not None:
        corpo["erro"]["detalhes"] = detalhes
    return JSONResponse(corpo, status_code=status, headers=headers)


def registrar_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _resposta(exc.status, exc.codigo, exc.mensagem, exc.detalhes, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validacao(_: Request, exc: RequestValidationError) -> JSONResponse:
        detalhes = [
            {"campo": ".".join(str(p) for p in e["loc"][1:]), "mensagem": e["msg"]}
            for e in exc.errors()
        ]
        return _resposta(422, "validacao", "Dados inválidos.", detalhes)

    @app.exception_handler(DBAPIError)
    async def _banco(_: Request, exc: DBAPIError) -> JSONResponse:
        # Só o código SQLSTATE e o nome da restrição vão para o log: a mensagem do Postgres traz
        # os valores (CPF, e-mail…) da linha em conflito.
        diag = getattr(exc.orig, "diag", None)
        estado = getattr(exc.orig, "sqlstate", None) or ""
        log.warning(
            "erro de banco",
            extra={"sqlstate": estado, "restricao": getattr(diag, "constraint_name", None)},
        )
        if isinstance(exc, IntegrityError):
            return _resposta(
                409,
                "conflito_de_dados",
                "Os dados conflitam com outro registro. Atualize e tente de novo.",
            )
        if estado == "40P01" or estado == "55P03":  # deadlock / lock_timeout
            return _resposta(
                409,
                "recurso_ocupado",
                "Outra operação está usando estes dados. Tente de novo.",
                headers={"Retry-After": "1"},
            )
        if estado == "57014":  # statement_timeout / cancelamento
            return _resposta(503, "tempo_esgotado", "A operação demorou demais. Tente de novo.")
        if estado.startswith("22"):  # data_exception: valor fora do formato/intervalo da coluna
            return _resposta(422, "valor_invalido", "Há um valor fora do limite permitido.")
        raise exc

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codigo = {404: "nao_encontrado", 405: "metodo_nao_permitido"}.get(exc.status_code, "erro")
        return _resposta(exc.status_code, codigo, str(exc.detail))
