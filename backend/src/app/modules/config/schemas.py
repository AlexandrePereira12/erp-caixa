from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import Dinheiro


class ConfiguracaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    nome_exibicao: str
    timezone: str
    taxa_servico_pct: Dinheiro  # percentual, 2 casas
    cancelamento_janela_min: int


class ConfiguracaoEditarIn(BaseModel):
    nome_exibicao: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    taxa_servico_pct: Decimal | None = Field(default=None, ge=0, le=30, decimal_places=2)
    cancelamento_janela_min: int | None = Field(default=None, ge=0, le=240)

    @field_validator("timezone")
    @classmethod
    def _valida_timezone(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                ZoneInfo(v)
            except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
                raise ValueError("fuso horário desconhecido") from exc
        return v
