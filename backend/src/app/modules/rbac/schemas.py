from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Dinheiro


class PermissaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    codigo: str
    modulo: str
    descricao: str


class PapelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: str | None
    sistema: bool
    limite_desconto_pct: Dinheiro  # percentual, 2 casas
    permissoes: list[PermissaoOut]


class PapelCriarIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: str | None = Field(default=None, max_length=500)
    limite_desconto_pct: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)
    permissoes: list[str] = []


class PapelEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    descricao: str | None = Field(default=None, max_length=500)
    limite_desconto_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)


class PapelPermissoesIn(BaseModel):
    permissoes: list[str]
