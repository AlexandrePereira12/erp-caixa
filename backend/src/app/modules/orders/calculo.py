"""Cálculo dos totais da comanda. Funções puras: tudo em Decimal, arredondamento HALF_UP em
cada componente, nada de float. É a única fonte da verdade dos totais (o frontend só exibe)."""

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from app.core.money import quantizar_dinheiro

CEM = Decimal(100)


@dataclass(frozen=True)
class Totais:
    subtotal: Decimal
    desconto: Decimal
    acrescimo: Decimal
    taxa_servico: Decimal
    total: Decimal


class DescontoExcedeConsumo(ValueError):
    pass


def total_item(quantidade: Decimal, preco_unitario: Decimal) -> Decimal:
    return quantizar_dinheiro(quantidade * preco_unitario)


def valor_do_ajuste(modo: str, valor: Decimal, subtotal: Decimal) -> Decimal:
    if modo == "percentual":
        return quantizar_dinheiro(subtotal * valor / CEM)
    return quantizar_dinheiro(valor)


def calcular(
    itens: Iterable[tuple[Decimal, Decimal]],
    ajustes: Iterable[tuple[str, str, Decimal]],
    taxa_servico_pct: Decimal,
) -> Totais:
    """`itens`: (quantidade, preço) dos itens ATIVOS. `ajustes`: (tipo, modo, valor) dos ajustes
    ATIVOS. Taxa de serviço incide sobre o consumo já com desconto (subtotal - descontos)."""
    subtotal = sum((total_item(q, p) for q, p in itens), Decimal(0))
    desconto = Decimal(0)
    acrescimo = Decimal(0)
    for tipo, modo, valor in ajustes:
        calculado = valor_do_ajuste(modo, valor, subtotal)
        if tipo == "desconto":
            desconto += calculado
        else:
            acrescimo += calculado
    base = subtotal - desconto
    if base < 0:
        raise DescontoExcedeConsumo("os descontos superam o valor consumido")
    taxa = quantizar_dinheiro(base * taxa_servico_pct / CEM)
    return Totais(
        subtotal=subtotal,
        desconto=desconto,
        acrescimo=acrescimo,
        taxa_servico=taxa,
        total=base + acrescimo + taxa,
    )


def dividir_em_partes(total: Decimal, pessoas: int) -> list[Decimal]:
    """Divide o total em `pessoas` partes que somam exatamente o total (centavos que sobram vão
    para as primeiras partes)."""
    if pessoas < 1:
        raise ValueError("pessoas deve ser >= 1")
    centavos = int(total * 100)
    base, resto = divmod(centavos, pessoas)
    return [Decimal(base + (1 if i < resto else 0)) / 100 for i in range(pessoas)]
