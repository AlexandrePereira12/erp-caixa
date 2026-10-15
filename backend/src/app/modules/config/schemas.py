from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator
from pydantic_core import PydanticCustomError

from app.core import pix
from app.core.documentos import cnpj_valido, somente_digitos
from app.core.money import Dinheiro


class ConfiguracaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nome_exibicao: str
    timezone: str
    taxa_servico_pct: Dinheiro  # percentual, 2 casas
    cancelamento_janela_min: int
    cnpj: str | None  # só dígitos
    telefone: str | None  # só dígitos, com DDD
    endereco: str | None
    email_contato: str | None
    pix_copia_e_cola: str | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pix_recebedor(self) -> str | None:
        """Nome do recebedor lido do código, para o administrador conferir se é o dele."""
        return pix.recebedor(self.pix_copia_e_cola)


class EmpresaOut(BaseModel):
    """Dados da empresa que saem no recibo. Qualquer usuário logado lê: quem imprime nem sempre vê as
    configurações, e são os mesmos dados que o cliente recebe impressos."""

    model_config = ConfigDict(from_attributes=True)

    nome_exibicao: str
    cnpj: str | None
    telefone: str | None
    endereco: str | None
    email_contato: str | None


class PixOut(BaseModel):
    """Pix da empresa para quem recebe o pagamento (caixa), que não precisa ver as configurações."""

    model_config = ConfigDict(from_attributes=True)

    pix_copia_e_cola: str | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pix_recebedor(self) -> str | None:
        return pix.recebedor(self.pix_copia_e_cola)


def _erro(codigo: str, mensagem: str) -> PydanticCustomError:
    # PydanticCustomError: com ValueError o Pydantic prefixaria "Value error, " em inglês.
    return PydanticCustomError(codigo, "{motivo}", {"motivo": mensagem})


class ConfiguracaoEditarIn(BaseModel):
    nome_exibicao: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    taxa_servico_pct: Decimal | None = Field(default=None, ge=0, le=30, decimal_places=2)
    cancelamento_janela_min: int | None = Field(default=None, ge=0, le=240)
    # Nos campos abaixo `null` (ou texto vazio) apaga o dado; campo ausente não mexe (model_fields_set).
    cnpj: str | None = Field(default=None, max_length=30)
    telefone: str | None = Field(default=None, max_length=30)
    endereco: str | None = Field(default=None, max_length=240)
    email_contato: str | None = Field(default=None, max_length=120)
    pix_copia_e_cola: str | None = Field(default=None, max_length=2048)

    @field_validator("timezone")
    @classmethod
    def _valida_timezone(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                ZoneInfo(v)
            except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
                raise ValueError("fuso horário desconhecido") from exc
        return v

    @field_validator("cnpj")
    @classmethod
    def _valida_cnpj(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        digitos = somente_digitos(v)
        if not cnpj_valido(digitos):
            raise _erro("cnpj_invalido", "CNPJ inválido: confira os 14 dígitos.")
        return digitos

    @field_validator("telefone")
    @classmethod
    def _valida_telefone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        digitos = somente_digitos(v)
        if len(digitos) not in (10, 11):
            raise _erro(
                "telefone_invalido",
                "Telefone inválido: informe o DDD e o número (10 ou 11 dígitos).",
            )
        return digitos

    @field_validator("endereco")
    @classmethod
    def _valida_endereco(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        return " ".join(v.split())  # uma linha só, sem espaços repetidos

    @field_validator("email_contato")
    @classmethod
    def _valida_email(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        try:
            return validate_email(v.strip(), check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise _erro("email_invalido", "E-mail inválido: confira o endereço.") from exc

    @field_validator("pix_copia_e_cola")
    @classmethod
    def _valida_pix(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        try:
            return pix.normalizar(v)
        except pix.PixInvalido as exc:
            raise _erro("pix_invalido", str(exc)) from exc
