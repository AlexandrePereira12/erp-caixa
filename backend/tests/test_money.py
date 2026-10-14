from decimal import Decimal

import pytest
from pydantic import BaseModel, ValidationError

from app.core.money import Dinheiro, Quantidade, quantizar_dinheiro


class Item(BaseModel):
    preco: Dinheiro
    qtd: Quantidade


def test_serializa_como_string_com_casas_fixas():
    item = Item(preco="10", qtd="1.5")
    assert item.model_dump_json() == '{"preco":"10.00","qtd":"1.500"}'


def test_arredonda_metade_para_cima():
    assert quantizar_dinheiro(Decimal("0.005")) == Decimal("0.01")
    assert quantizar_dinheiro(Decimal("2.675")) == Decimal("2.68")  # float daria 2.67


@pytest.mark.parametrize("valor", [0.1, True, "abc", "NaN", "Infinity", None])
def test_recusa_float_e_lixo(valor):
    with pytest.raises(ValidationError):
        Item(preco=valor, qtd="1")


def test_aceita_inteiro_e_decimal():
    assert Item(preco=5, qtd=Decimal("2")).preco == Decimal("5.00")
