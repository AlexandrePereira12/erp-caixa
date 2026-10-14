import pytest

from app.core.pix import TAMANHO_MAXIMO, PixInvalido, crc16, normalizar, recebedor

# Exemplo do manual do BR Code do Banco Central (chave aleatória, recebedor "Fulano de Tal").
MANUAL = (
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR"
    "5913Fulano de Tal6008BRASILIA62070503***63041D3D"
)
CHAVE = "123e4567-e12b-12d1-a456-426655440000"


def tlv(campo: str, valor: str) -> str:
    return f"{campo}{len(valor):02d}{valor}"


def montar(*campos: tuple[str, str]) -> str:
    corpo = "".join(tlv(c, v) for c, v in campos) + "6304"
    return corpo + crc16(corpo)


def codigo(*extra: tuple[str, str], conta: str | None = None, nome: str = "Fulano de Tal") -> str:
    conta = conta if conta is not None else tlv("00", "br.gov.bcb.pix") + tlv("01", CHAVE)
    return montar(
        ("00", "01"),
        *extra,
        ("26", conta),
        ("52", "0000"),
        ("53", "986"),
        ("58", "BR"),
        ("59", nome),
        ("60", "BRASILIA"),
        ("62", tlv("05", "***")),
    )


def recusa(texto: str, trecho: str) -> None:
    with pytest.raises(PixInvalido) as erro:
        normalizar(texto)
    assert trecho in str(erro.value)


def test_crc_confere_com_o_valor_de_catalogo():
    assert crc16("123456789") == "29B1"


def test_exemplo_do_manual_do_banco_central_e_aceito():
    assert normalizar(MANUAL) == MANUAL
    assert recebedor(MANUAL) == "Fulano de Tal"


def test_normaliza_pontas_quebras_de_linha_e_crc_minusculo():
    colado = "  " + MANUAL[:60] + "\r\n" + MANUAL[60:-4] + MANUAL[-4:].lower() + "\n"
    assert normalizar(colado) == MANUAL


def test_nome_com_acento_conta_caracteres_e_crc_em_utf8():
    texto = codigo(nome="José da Conceição")
    assert normalizar(texto) == texto
    assert recebedor(texto) == "José da Conceição"


def test_valor_zero_e_aceito_e_valor_fixo_e_recusado():
    assert normalizar(codigo(("54", "0.00")))
    recusa(codigo(("54", "10.50")), "cobra um valor fixo (R$ 10.50)")
    recusa(codigo(("54", "abc")), "valor do código é inválido")


def test_recusa_pix_dinamico_pelo_indicador_ou_pela_url():
    msg = "Pix de cobrança (dinâmico)"
    recusa(codigo(("01", "12")), msg)
    conta = tlv("00", "br.gov.bcb.pix") + tlv("25", "pix.exemplo.com.br/qr/v2/abc123")
    recusa(codigo(conta=conta), msg)
    assert normalizar(codigo(("01", "11")))  # estático explícito


def test_recusa_codigo_que_nao_e_pix_ou_esta_quebrado():
    conta_outra = tlv("00", "com.exemplo.pagamento") + tlv("01", "abc")
    recusa(codigo(conta=conta_outra), "falta o identificador br.gov.bcb.pix")
    recusa(MANUAL[:-4] + "0000", "dígito verificador não confere")
    recusa(MANUAL[:-10], "incompleto")
    recusa("texto qualquer, não é um código", "formato de um Pix copia e cola")
    recusa(montar(("01", "11")), "formato de um Pix copia e cola")  # sem o campo 00 primeiro
    recusa("   \n ", "Cole o Pix copia e cola")
    recusa("0" * (TAMANHO_MAXIMO + 1), "longo demais")


def test_recebedor_nunca_levanta_excecao():
    assert recebedor(None) is None
    assert recebedor("") is None
    assert recebedor("lixo") is None
    assert recebedor(montar(("00", "01"), ("58", "BR"))) is None


def test_vetores_com_valor_sao_os_mesmos_do_teste_do_frontend():
    """frontend/src/lib/pix.test.ts insere o valor no navegador e tem que dar estes mesmos textos."""

    def com_valor(nome: str) -> str:
        conta = tlv("00", "br.gov.bcb.pix") + tlv("01", CHAVE)
        return montar(
            ("00", "01"),
            ("26", conta),
            ("52", "0000"),
            ("53", "986"),
            ("54", "40.00"),
            ("58", "BR"),
            ("59", nome),
            ("60", "BRASILIA"),
            ("62", tlv("05", "***")),
        )

    assert com_valor("Fulano de Tal").endswith("5913Fulano de Tal6008BRASILIA62070503***6304996E")
    assert com_valor("José da Conceição").endswith(
        "5917José da Conceição6008BRASILIA62070503***630490AF"
    )
