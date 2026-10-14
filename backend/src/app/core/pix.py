"""Pix "copia e cola" estático (BR Code, padrão EMV QR): leitura e validação, sem API de banco.

O código é só um texto: campos `ID(2) + TAMANHO(2) + VALOR`, terminado pelo campo 63 com um CRC16 de 4
hexadecimais. O QR é o desenho desse mesmo texto. Aqui só se confere que o texto colado é um Pix
estático inteiro e sem valor; quem confere o pagamento é o caixa, no app do banco.
"""

from decimal import Decimal, InvalidOperation

GUI_PIX = "br.gov.bcb.pix"
TAMANHO_MAXIMO = 1024


class PixInvalido(ValueError):
    """Código que não serve como Pix copia e cola da empresa; a mensagem é para o administrador."""


def crc16(texto: str) -> str:
    """CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF, sem reflexão) sobre os bytes UTF-8."""
    crc = 0xFFFF
    for byte in texto.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def _campos(texto: str) -> list[tuple[str, str]]:
    """Lê `ID + TAMANHO + VALOR` em sequência, consumindo o texto inteiro (tamanho em caracteres)."""
    campos: list[tuple[str, str]] = []
    i = 0
    while i < len(texto):
        cabecalho = texto[i : i + 4]
        if len(cabecalho) < 4 or not cabecalho.isascii() or not cabecalho.isdigit():
            raise PixInvalido("O texto não tem o formato de um Pix copia e cola.")
        fim = i + 4 + int(cabecalho[2:])
        if fim > len(texto):
            raise PixInvalido("O código está incompleto: copie de novo, inteiro, no app do banco.")
        campos.append((cabecalho[:2], texto[i + 4 : fim]))
        i = fim
    return campos


def normalizar(texto: str) -> str:
    """Valida e devolve o código no formato canônico (sem quebras de linha, CRC em maiúsculas).

    Só aparam-se as pontas e removem-se quebras de linha (o app do banco às vezes quebra o texto ao
    copiar). Espaço interno fica: o nome e a cidade do recebedor têm espaços e entram no CRC.
    """
    codigo = texto.strip().replace("\r", "").replace("\n", "")
    if not codigo:
        raise PixInvalido("Cole o Pix copia e cola.")
    if len(codigo) > TAMANHO_MAXIMO:
        raise PixInvalido(f"O código é longo demais (máximo de {TAMANHO_MAXIMO} caracteres).")

    campos = _campos(codigo)
    if campos[0] != ("00", "01"):
        raise PixInvalido("O texto não tem o formato de um Pix copia e cola.")
    if campos[-1][0] != "63" or len(campos[-1][1]) != 4:
        raise PixInvalido("O código está incompleto: copie de novo, inteiro, no app do banco.")
    if crc16(codigo[:-4]) != codigo[-4:].upper():
        raise PixInvalido(
            "O código está incompleto ou foi alterado (o dígito verificador não confere)."
        )

    conta_pix: list[tuple[str, str]] | None = None
    for campo, valor in campos:
        if "26" <= campo <= "51":
            subcampos = _campos(valor)
            if conta_pix is None and any(c == "00" and v.lower() == GUI_PIX for c, v in subcampos):
                conta_pix = subcampos
        elif campo == "62":
            _campos(valor)
    if conta_pix is None:
        raise PixInvalido("Esse código não é um Pix (falta o identificador br.gov.bcb.pix).")

    dados = dict(campos)
    if dados.get("01") == "12" or any(c == "25" for c, _ in conta_pix):
        raise PixInvalido(
            "Esse é um Pix de cobrança (dinâmico), válido para uma cobrança só. "
            "Use o Pix copia e cola da chave, que serve para qualquer venda."
        )
    if "54" in dados:
        try:
            valor_fixo = Decimal(dados["54"])
        except InvalidOperation as exc:
            raise PixInvalido("O valor do código é inválido.") from exc
        if valor_fixo > 0:
            raise PixInvalido(
                f"Esse código cobra um valor fixo (R$ {valor_fixo}) de todo cliente. "
                "Gere um Pix copia e cola sem valor."
            )
    return codigo[:-4] + codigo[-4:].upper()


def recebedor(codigo: str | None) -> str | None:
    """Nome do recebedor (campo 59) para o administrador conferir; nunca levanta exceção."""
    if not codigo:
        return None
    try:
        nome = dict(_campos(codigo)).get("59", "").strip()
    except PixInvalido:
        return None
    return nome or None
