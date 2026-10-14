"""Registro de auditoria.

`registrar` participa da transação do chamador: se o fato for desfeito, a auditoria vai junto.
Fatos que precisam sobreviver a um erro (login falho, acesso negado) são gravados pelo chamador na
própria sessão e confirmados com `commit()` antes de levantar o erro.
"""

import re
from enum import StrEnum
from typing import Any

from pydantic_core import to_jsonable_python
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.core.context import get_context
from app.modules.audit.models import AuditoriaLog


class Acao(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGIN_FALHA = "LOGIN_FALHA"
    LOGOUT = "LOGOUT"
    CANCELAMENTO = "CANCELAMENTO"
    FECHAMENTO_COMANDA = "FECHAMENTO_COMANDA"
    FECHAMENTO_CAIXA = "FECHAMENTO_CAIXA"
    AJUSTE_ESTOQUE = "AJUSTE_ESTOQUE"
    PAGAMENTO = "PAGAMENTO"
    DESCONTO = "DESCONTO"
    ESTORNO = "ESTORNO"
    ALTERACAO_PERMISSAO = "ALTERACAO_PERMISSAO"
    ACESSO_NEGADO = "ACESSO_NEGADO"


_FRAGMENTOS_SECRETOS = ("senha", "password", "token", "secret", "cvv", "cartao", "authorization")
_CHAVES_SECRETAS = {"pin"}
# Indicadores que citam "password" no nome mas não guardam segredo.
_CHAVES_LIVRES = {"must_change_password"}
_CHAVES_DOCUMENTO = {"cpf", "cnpj", "cpf_cnpj", "documento"}
MASCARA = "***"


def _mascarar_documento(valor: object) -> str:
    digitos = re.sub(r"\D", "", str(valor))
    return f"{MASCARA}{digitos[-2:]}" if len(digitos) > 2 else MASCARA


def redigir(valor: Any, chave: str | None = None) -> Any:
    """Cópia do valor sem senha, token, PIN, cartão nem CPF/CNPJ completo."""
    if chave is not None:
        c = chave.lower()
        if c in _CHAVES_LIVRES:
            return valor
        if c in _CHAVES_SECRETAS or any(f in c for f in _FRAGMENTOS_SECRETOS):
            return MASCARA
        if c in _CHAVES_DOCUMENTO:
            if valor is None or (isinstance(valor, str) and valor.startswith(MASCARA)):
                return valor  # já mascarado (idempotente)
            return _mascarar_documento(valor)
    if isinstance(valor, dict):
        return {k: redigir(v, str(k)) for k, v in valor.items()}
    if isinstance(valor, list | tuple | set):
        return [redigir(v) for v in valor]
    return valor


# Preenchidos automaticamente a cada UPDATE: ruído no diff antes/depois.
_RUIDO = {"updated_at", "updated_by"}


def snapshot(obj: Any, excluir: set[str] | None = None) -> dict[str, Any]:
    """Estado das colunas de um modelo, em JSON puro. Ainda NÃO redigido: a redação acontece só ao
    gravar a auditoria, depois de calculado o diff (senão a máscara esconderia mudanças)."""
    ignorar = _RUIDO | (excluir or set())
    dados = {
        attr.key: getattr(obj, attr.key)
        for attr in inspect(obj).mapper.column_attrs
        if attr.key not in ignorar
    }
    return to_jsonable_python(dados)


def campos_alterados(antes: dict[str, Any] | None, depois: dict[str, Any] | None) -> list[str]:
    antes, depois = antes or {}, depois or {}
    return sorted(k for k in antes.keys() | depois.keys() if antes.get(k) != depois.get(k))


def _cortar(texto: str | None, tamanho: int) -> str | None:
    return None if texto is None else texto[:tamanho]


def _montar(
    acao: Acao,
    modulo: str,
    recurso: str,
    recurso_id: int | str | None,
    descricao: str,
    antes: dict[str, Any] | None,
    depois: dict[str, Any] | None,
    usuario_id: int | None,
    usuario_nome: str | None,
    papel: str | None,
) -> AuditoriaLog:
    ctx = get_context()
    antes_j = to_jsonable_python(antes) if antes is not None else None
    depois_j = to_jsonable_python(depois) if depois is not None else None
    # O diff é calculado sobre os valores reais; só depois a redação mascara o que for sensível.
    alterados = (
        campos_alterados(antes_j, depois_j)
        if antes_j is not None and depois_j is not None
        else None
    )
    antes_r = redigir(antes_j) if antes_j is not None else None
    depois_r = redigir(depois_j) if depois_j is not None else None
    return AuditoriaLog(
        usuario_id=usuario_id if usuario_id is not None else ctx.usuario_id,
        # Colunas estreitas: truncar aqui evita que uma auditoria longa derrube a operação.
        usuario_nome=_cortar(usuario_nome if usuario_nome is not None else ctx.usuario_nome, 120),
        papel=_cortar(papel if papel is not None else ctx.papel, 200),
        ip=ctx.ip,
        user_agent=(ctx.user_agent or None) and ctx.user_agent[:300],
        request_id=ctx.request_id or None,
        acao=acao.value,
        modulo=_cortar(modulo, 40),
        recurso=_cortar(recurso, 60),
        recurso_id=None if recurso_id is None else _cortar(str(recurso_id), 60),
        descricao=descricao,
        antes=antes_r,
        depois=depois_r,
        campos_alterados=alterados,
    )


def registrar(
    db: Session,
    acao: Acao,
    modulo: str,
    recurso: str,
    recurso_id: int | str | None,
    descricao: str,
    *,
    antes: dict[str, Any] | None = None,
    depois: dict[str, Any] | None = None,
    usuario_id: int | None = None,
    usuario_nome: str | None = None,
    papel: str | None = None,
) -> None:
    db.add(
        _montar(
            acao,
            modulo,
            recurso,
            recurso_id,
            descricao,
            antes,
            depois,
            usuario_id,
            usuario_nome,
            papel,
        )
    )
