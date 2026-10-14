from decimal import Decimal as D

import pytest

from app.modules.orders.calculo import (
    DescontoExcedeConsumo,
    calcular,
    dividir_em_partes,
    total_item,
    valor_do_ajuste,
)


def test_total_do_item_arredonda_meio_para_cima():
    assert total_item(D("3"), D("0.335")) == D("1.01")  # 1.005 -> 1.01
    assert total_item(D("0.333"), D("10")) == D("3.33")
    assert total_item(D("2"), D("7.50")) == D("15.00")


def test_sem_ajustes_nem_taxa():
    t = calcular([(D(2), D("10")), (D(1), D("7.5"))], [], D(0))
    assert (t.subtotal, t.desconto, t.acrescimo, t.taxa_servico, t.total) == (
        D("27.50"),
        D(0),
        D(0),
        D(0),
        D("27.50"),
    )


def test_desconto_percentual_taxa_sobre_o_consumo_com_desconto_e_acrescimo():
    t = calcular(
        [(D(2), D("10")), (D(1), D("7.5"))],
        [("desconto", "percentual", D(10)), ("acrescimo", "valor", D("1.00"))],
        D(10),
    )
    assert t.subtotal == D("27.50")
    assert t.desconto == D("2.75")
    assert t.taxa_servico == D("2.48")  # 24.75 * 10% = 2.475 -> 2.48
    assert t.acrescimo == D("1.00")
    assert t.total == D("28.23")  # 24.75 + 1.00 + 2.48


def test_desconto_maior_que_o_consumo_e_recusado():
    with pytest.raises(DescontoExcedeConsumo):
        calcular([(D(1), D("10"))], [("desconto", "valor", D("10.01"))], D(0))
    assert calcular([(D(1), D("10"))], [("desconto", "valor", D("10"))], D(10)).total == D("0.00")


def test_valor_do_ajuste_percentual_e_fixo():
    assert valor_do_ajuste("percentual", D("12.5"), D("80")) == D("10.00")
    assert valor_do_ajuste("valor", D("3.456"), D("80")) == D("3.46")


@pytest.mark.parametrize("total,pessoas", [("100.00", 3), ("0.01", 4), ("10.00", 1), ("99.99", 7)])
def test_divisao_soma_exatamente_o_total(total, pessoas):
    partes = dividir_em_partes(D(total), pessoas)
    assert len(partes) == pessoas and sum(partes) == D(total)
    assert max(partes) - min(partes) <= D("0.01")


def test_divisao_distribui_centavos_nas_primeiras_partes():
    assert dividir_em_partes(D("100.00"), 3) == [D("33.34"), D("33.33"), D("33.33")]


def test_divisao_rejeita_zero_pessoas():
    with pytest.raises(ValueError):
        dividir_em_partes(D("10"), 0)
