"""Dinheiro e quantidade: sempre Decimal, nunca float; no JSON, sempre string."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer

DINHEIRO_CASAS = Decimal("0.01")
QUANTIDADE_CASAS = Decimal("0.001")
CUSTO_CASAS = Decimal(
    "0.0001"
)  # custo médio guarda 4 casas para não acumular erro de arredondamento


def quantizar_dinheiro(valor: Decimal) -> Decimal:
    return valor.quantize(DINHEIRO_CASAS, rounding=ROUND_HALF_UP)


def quantizar_quantidade(valor: Decimal) -> Decimal:
    return valor.quantize(QUANTIDADE_CASAS, rounding=ROUND_HALF_UP)


def quantizar_custo(valor: Decimal) -> Decimal:
    return valor.quantize(CUSTO_CASAS, rounding=ROUND_HALF_UP)


# Tetos que cabem nas colunas NUMERIC(14, n): valor maior viraria erro 500 no banco.
TETO_DINHEIRO = Decimal("1e12")
TETO_QUANTIDADE = Decimal("1e11")
TETO_CUSTO = Decimal("1e10")


def _para_decimal(valor: object) -> Decimal:
    # float é recusado: 0.1 + 0.2 em float já é dado corrompido na entrada.
    if isinstance(valor, float) or isinstance(valor, bool):
        raise ValueError("use string ou inteiro para valores monetários")
    try:
        d = Decimal(str(valor).strip())
    except InvalidOperation as exc:
        raise ValueError("valor decimal inválido") from exc
    if not d.is_finite():
        raise ValueError("valor decimal inválido")
    return d


def _limitado(valor: object, teto: Decimal, quantizar) -> Decimal:  # noqa: ANN001
    d = _para_decimal(valor)
    if abs(d) >= teto:
        raise ValueError("valor fora do limite permitido")
    try:
        return quantizar(d)
    except InvalidOperation as exc:
        raise ValueError("valor decimal inválido") from exc


def _como_dinheiro(valor: object) -> Decimal:
    return _limitado(valor, TETO_DINHEIRO, quantizar_dinheiro)


def _como_quantidade(valor: object) -> Decimal:
    return _limitado(valor, TETO_QUANTIDADE, quantizar_quantidade)


def _como_custo(valor: object) -> Decimal:
    return _limitado(valor, TETO_CUSTO, quantizar_custo)


Dinheiro = Annotated[
    Decimal,
    BeforeValidator(_como_dinheiro),
    PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json"),
]

Quantidade = Annotated[
    Decimal,
    BeforeValidator(_como_quantidade),
    PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json"),
]

Custo = Annotated[
    Decimal,
    BeforeValidator(_como_custo),
    PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json"),
]
