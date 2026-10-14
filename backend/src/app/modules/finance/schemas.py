from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Dinheiro


class PessoaResumo(BaseModel):
    id: int
    nome: str


class BaixaIn(BaseModel):
    valor: Dinheiro = Field(gt=0)
    forma_pagamento_id: int
    observacao: str | None = Field(default=None, max_length=300)
    # Opcional: o cliente gera uma chave por tentativa de recebimento (ex.: UUID). Reenviar a
    # mesma chave (clique duplo, retry de rede) devolve a conta como está, sem lançar de novo.
    chave: str | None = Field(
        default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"
    )


class BaixaOut(BaseModel):
    id: int
    valor: Dinheiro
    forma: str
    caixa_id: int
    estorno_de_id: int | None
    observacao: str | None
    created_at: datetime
    usuario_nome: str | None


class TituloOut(BaseModel):
    id: int
    pessoa: PessoaResumo
    descricao: str
    valor_original: Dinheiro
    valor_pago: Dinheiro
    saldo: Dinheiro
    vencimento: date | None
    status: str
    cancelado_motivo: str | None
    venda_id: int | None
    created_at: datetime
    baixas: list[BaixaOut]


class SaldoAbertoOut(BaseModel):
    pessoa_id: int
    saldo_aberto: Dinheiro
    titulos_abertos: int
    aceita_fiado: bool
    limite_fiado: Dinheiro
    # None quando não há limite (limite_fiado = 0).
    limite_disponivel: Dinheiro | None


class HistoricoComanda(BaseModel):
    id: int
    tipo: str
    status: str
    aberta_em: datetime
    total: Dinheiro


class HistoricoPagamento(BaseModel):
    venda_id: int
    forma: str
    valor: Dinheiro
    em: datetime


class HistoricoOut(BaseModel):
    pessoa_id: int
    comandas: list[HistoricoComanda]
    pagamentos: list[HistoricoPagamento]
    titulos: list[TituloOut]


class CategoriaFinanceiraIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    tipo: Literal["receita", "despesa"]


class CategoriaFinanceiraEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    ativa: bool | None = None


class CategoriaFinanceiraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    tipo: Literal["receita", "despesa"]
    ativa: bool
