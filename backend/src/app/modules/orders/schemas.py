from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.money import Dinheiro, Quantidade

TipoComanda = Literal["mesa", "balcao", "retirada", "delivery"]
StatusComanda = Literal["aberta", "aguardando_pagamento", "fechada", "cancelada"]


class ComandaAbrirIn(BaseModel):
    tipo: TipoComanda
    mesa_id: int | None = None
    cliente_id: int | None = None
    nome_cliente: str | None = Field(default=None, max_length=120)
    endereco_entrega: str | None = Field(default=None, max_length=500)
    num_pessoas: int | None = Field(default=None, ge=1, le=100)
    observacao: str | None = Field(default=None, max_length=500)


class ComandaEditarIn(BaseModel):
    cliente_id: int | None = None
    nome_cliente: str | None = Field(default=None, max_length=120)
    endereco_entrega: str | None = Field(default=None, max_length=500)
    num_pessoas: int | None = Field(default=None, ge=1, le=100)
    observacao: str | None = Field(default=None, max_length=500)


class ItemIn(BaseModel):
    produto_id: int
    quantidade: Quantidade = Field(gt=0)
    observacao: str | None = Field(default=None, max_length=300)


class ItemEditarIn(BaseModel):
    quantidade: Quantidade | None = Field(default=None, gt=0)
    observacao: str | None = Field(default=None, max_length=300)


class MotivoIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


class TransferirIn(BaseModel):
    mesa_id: int


class AjusteIn(BaseModel):
    tipo: Literal["desconto", "acrescimo"]
    modo: Literal["valor", "percentual"]
    # valor em reais ou percentual (0 < v <= 100 no modo percentual)
    valor: Dinheiro = Field(gt=0)
    justificativa: str = Field(min_length=3, max_length=300)


class MesaResumo(BaseModel):
    id: int
    nome: str


class PessoaResumo(BaseModel):
    id: int
    nome: str


class ItemOut(BaseModel):
    id: int
    produto_id: int
    descricao: str
    quantidade: Quantidade
    preco_unitario: Dinheiro
    total: Dinheiro
    observacao: str | None
    status: str
    cancelado_motivo: str | None
    lancado_em: datetime
    lancado_por: int | None


class AjusteOut(BaseModel):
    id: int
    tipo: str
    modo: str
    valor: Dinheiro
    valor_calculado: Dinheiro
    justificativa: str
    criado_por: int | None
    removido: bool


class TotaisOut(BaseModel):
    subtotal: Dinheiro
    desconto: Dinheiro
    acrescimo: Dinheiro
    taxa_servico: Dinheiro
    total: Dinheiro


class ComandaOut(BaseModel):
    id: int
    tipo: str
    status: str
    mesa: MesaResumo | None
    cliente: PessoaResumo | None
    nome_cliente: str | None
    endereco_entrega: str | None
    num_pessoas: int | None
    observacao: str | None
    taxa_servico_pct: Dinheiro  # percentual, 2 casas
    aberta_em: datetime
    fechada_em: datetime | None
    cancelada_motivo: str | None
    itens: list[ItemOut]
    ajustes: list[AjusteOut]
    totais: TotaisOut
    venda_id: int | None


class ComandaResumoOut(BaseModel):
    id: int
    tipo: str
    status: str
    mesa: MesaResumo | None
    cliente: PessoaResumo | None
    nome_cliente: str | None
    aberta_em: datetime
    fechada_em: datetime | None
    itens_ativos: int
    total: Dinheiro


class DivisaoOut(BaseModel):
    total: Dinheiro
    pessoas: int
    partes: list[Dinheiro]
