from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator
from pydantic_core import PydanticCustomError

from app.core import pix
from app.core.money import Dinheiro


class ConfiguracaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nome_exibicao: str
    timezone: str
    taxa_servico_pct: Dinheiro  # percentual, 2 casas
    cancelamento_janela_min: int
    pix_copia_e_cola: str | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pix_recebedor(self) -> str | None:
        """Nome do recebedor lido do código, para o administrador conferir se é o dele."""
        return pix.recebedor(self.pix_copia_e_cola)


class ConfiguracaoEditarIn(BaseModel):
    nome_exibicao: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    taxa_servico_pct: Decimal | None = Field(default=None, ge=0, le=30, decimal_places=2)
    cancelamento_janela_min: int | None = Field(default=None, ge=0, le=240)
    # Aqui `null` (ou texto vazio) apaga o Pix; campo ausente não mexe nele (model_fields_set).
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

    @field_validator("pix_copia_e_cola")
    @classmethod
    def _valida_pix(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        try:
            return pix.normalizar(v)
        except pix.PixInvalido as exc:
            # PydanticCustomError: com ValueError o Pydantic prefixaria "Value error, " em inglês.
            raise PydanticCustomError("pix_invalido", "{motivo}", {"motivo": str(exc)}) from exc


class PixOut(BaseModel):
    """Pix da empresa para quem recebe o pagamento (caixa), que não precisa ver as configurações."""

    model_config = ConfigDict(from_attributes=True)

    pix_copia_e_cola: str | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pix_recebedor(self) -> str | None:
        return pix.recebedor(self.pix_copia_e_cola)
