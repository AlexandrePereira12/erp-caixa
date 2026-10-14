from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.money import Dinheiro, Quantidade


class PagamentoIn(BaseModel):
    forma_pagamento_id: int
    valor: Dinheiro = Field(gt=0)
    # Só dinheiro: quanto o cliente entregou (o troco é calculado pelo backend).
    valor_recebido: Dinheiro | None = Field(default=None, gt=0)
    parcelas: int | None = Field(default=None, ge=1, le=24)
    observacao: str | None = Field(default=None, max_length=200)


class FecharComandaIn(BaseModel):
    pagamentos: list[PagamentoIn] = []
    # Cliente da venda (obrigatório para fiado); se omitido, vale o da comanda.
    cliente_id: int | None = None
    # Só com a permissão estoque.permitir_negativo, e sempre com justificativa.
    permitir_estoque_negativo: bool = False
    justificativa_estoque: str | None = Field(default=None, max_length=300)


class EstornoIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=300)


class PessoaResumo(BaseModel):
    id: int
    nome: str


class VendaItemOut(BaseModel):
    produto_id: int
    descricao: str
    quantidade: Quantidade
    preco_unitario: Dinheiro
    total: Dinheiro


class VendaPagamentoOut(BaseModel):
    id: int
    forma_pagamento_id: int
    forma: str
    tipo: str
    valor: Dinheiro
    valor_recebido: Dinheiro | None
    troco: Dinheiro | None
    parcelas: int | None
    observacao: str | None


class EstornoOut(BaseModel):
    motivo: str
    em: datetime
    por: str | None


class VendaOut(BaseModel):
    id: int
    comanda_id: int
    caixa_id: int
    cliente: PessoaResumo | None
    operador: str | None
    subtotal: Dinheiro
    desconto_total: Dinheiro
    acrescimo_total: Dinheiro
    taxa_servico: Dinheiro
    total: Dinheiro
    troco_total: Dinheiro
    created_at: datetime
    itens: list[VendaItemOut]
    pagamentos: list[VendaPagamentoOut]
    estorno: EstornoOut | None


class VendaResumoOut(BaseModel):
    id: int
    comanda_id: int
    caixa_id: int
    cliente: PessoaResumo | None
    total: Dinheiro
    created_at: datetime
    estornada: bool


StatusVenda = Literal["todas", "validas", "estornadas"]
