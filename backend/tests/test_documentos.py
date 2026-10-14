import pytest

from app.core.documentos import cnpj_valido, cpf_valido, normalizar_documento


@pytest.mark.parametrize("cpf", ["52998224725", "11144477735", "00000000191"])
def test_cpf_valido(cpf):
    assert cpf_valido(cpf)


@pytest.mark.parametrize(
    "cpf", ["52998224724", "11111111111", "123", "5299822472a", "", "529982247250"]
)
def test_cpf_invalido(cpf):
    assert not cpf_valido(cpf)


@pytest.mark.parametrize("cnpj", ["11222333000181", "11444777000161"])
def test_cnpj_valido(cnpj):
    assert cnpj_valido(cnpj)


@pytest.mark.parametrize("cnpj", ["11222333000182", "00000000000000", "1122233300018", ""])
def test_cnpj_invalido(cnpj):
    assert not cnpj_valido(cnpj)


def test_normaliza_pontuacao_e_valida_pelo_tipo():
    assert normalizar_documento("529.982.247-25", "F") == "52998224725"
    assert normalizar_documento("11.222.333/0001-81", "J") == "11222333000181"
    with pytest.raises(ValueError, match="CPF"):
        normalizar_documento("11.222.333/0001-81", "F")
    with pytest.raises(ValueError, match="CNPJ"):
        normalizar_documento("529.982.247-25", "J")
