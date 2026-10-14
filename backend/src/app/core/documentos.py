"""CPF e CNPJ: normalização e validação dos dígitos verificadores."""

import re


def somente_digitos(valor: str) -> str:
    return re.sub(r"\D", "", valor)


def _digito(base: str, pesos: list[int]) -> int:
    resto = sum(int(d) * p for d, p in zip(base, pesos, strict=True)) % 11
    return 0 if resto < 2 else 11 - resto


def cpf_valido(cpf: str) -> bool:
    if len(cpf) != 11 or not cpf.isdigit() or len(set(cpf)) == 1:
        return False
    d1 = _digito(cpf[:9], list(range(10, 1, -1)))
    d2 = _digito(cpf[:9] + str(d1), list(range(11, 1, -1)))
    return cpf[9:] == f"{d1}{d2}"


def cnpj_valido(cnpj: str) -> bool:
    if len(cnpj) != 14 or not cnpj.isdigit() or len(set(cnpj)) == 1:
        return False
    d1 = _digito(cnpj[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = _digito(cnpj[:12] + str(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return cnpj[12:] == f"{d1}{d2}"


def normalizar_documento(valor: str, tipo_pessoa: str) -> str:
    """Devolve só os dígitos; levanta ValueError se não for CPF (F) ou CNPJ (J) válido."""
    digitos = somente_digitos(valor)
    if tipo_pessoa == "F":
        if not cpf_valido(digitos):
            raise ValueError("CPF inválido")
    elif not cnpj_valido(digitos):
        raise ValueError("CNPJ inválido")
    return digitos
