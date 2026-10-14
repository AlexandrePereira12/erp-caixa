from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Dinheiro

StatusMesa = Literal["livre", "ocupada", "aguardando_pagamento", "reservada", "bloqueada"]


class MesaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=40)
    capacidade: int | None = Field(default=None, ge=1, le=100)


class MesaEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=40)
    capacidade: int | None = Field(default=None, ge=1, le=100)
    ativa: bool | None = None


class MesaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    capacidade: int | None
    status: StatusMesa
    ativa: bool


class ComandaResumoMapa(BaseModel):
    id: int
    status: str
    nome_cliente: str | None
    num_pessoas: int | None
    itens_ativos: int
    total_parcial: Dinheiro
    aberta_em: datetime


class MesaMapaOut(MesaOut):
    comanda: ComandaResumoMapa | None
