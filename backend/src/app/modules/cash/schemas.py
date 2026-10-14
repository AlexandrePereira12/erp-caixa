from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Dinheiro

TipoForma = Literal["dinheiro", "pix", "debito", "credito", "vale", "fiado", "outro"]


class FormaPagamentoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    tipo: TipoForma
    ordem: int = Field(default=0, ge=0, le=1000)


class FormaPagamentoEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    ativa: bool | None = None
    ordem: int | None = Field(default=None, ge=0, le=1000)


class FormaPagamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    tipo: TipoForma
    ativa: bool
    ordem: int


class CaixaAbrirIn(BaseModel):
    valor_abertura: Dinheiro = Field(default=0, ge=0)


class OperadorResumo(BaseModel):
    id: int
    nome: str


class SaldoFormaOut(BaseModel):
    forma_pagamento_id: int
    forma: str
    tipo: str
    esperado: Dinheiro


class ConferenciaOut(BaseModel):
    forma_pagamento_id: int
    forma: str
    valor_esperado: Dinheiro
    valor_contado: Dinheiro
    diferenca: Dinheiro
    justificativa: str | None


class CaixaOut(BaseModel):
    id: int
    operador: OperadorResumo
    status: str
    valor_abertura: Dinheiro
    aberto_em: datetime
    fechado_em: datetime | None
    rodada: int
    # Valor que deveria haver agora em cada forma (soma dos movimentos do caixa).
    esperado: list[SaldoFormaOut]
    vendas_qtd: int
    vendas_total: Dinheiro
    # Valores devolvidos POR ESTE caixa (estorno de venda ou de recebimento).
    estornos_total: Dinheiro
    sangrias: Dinheiro
    reforcos: Dinheiro
    # Conferência do último fechamento, quando fechado.
    conferencias: list[ConferenciaOut]


class CaixaResumoOut(BaseModel):
    id: int
    operador: OperadorResumo
    status: str
    valor_abertura: Dinheiro
    aberto_em: datetime
    fechado_em: datetime | None


class MovimentoCaixaIn(BaseModel):
    tipo: Literal["sangria", "reforco"]
    valor: Dinheiro = Field(gt=0)
    descricao: str = Field(min_length=3, max_length=300)


class MovimentoCaixaOut(BaseModel):
    id: int
    caixa_id: int
    tipo: str
    forma_pagamento_id: int
    forma: str
    valor: Dinheiro
    origem_tipo: str | None
    origem_id: int | None
    descricao: str | None
    created_at: datetime
    usuario_nome: str | None


class ConferenciaIn(BaseModel):
    forma_pagamento_id: int
    # Pode ser negativo em formas que não são dinheiro vivo (ex.: PIX devolvido por estorno).
    valor_contado: Dinheiro
    justificativa: str | None = Field(default=None, max_length=300)


class FechamentoIn(BaseModel):
    conferencias: list[ConferenciaIn]


class ReaberturaIn(BaseModel):
    justificativa: str = Field(min_length=3, max_length=300)
