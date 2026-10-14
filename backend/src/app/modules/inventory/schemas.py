from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Custo, Dinheiro, Quantidade


class EntradaIn(BaseModel):
    produto_id: int
    quantidade: Quantidade = Field(gt=0)
    custo_unitario: Custo | None = Field(default=None, ge=0)
    documento: str | None = Field(default=None, max_length=60)
    justificativa: str | None = Field(default=None, max_length=500)


class AjusteIn(BaseModel):
    produto_id: int
    # ajuste: variação com sinal (+/-); perda e saida: quantidade positiva, sempre baixa.
    tipo: Literal["ajuste", "perda", "saida"]
    quantidade: Quantidade
    justificativa: str = Field(min_length=3, max_length=500)
    permitir_negativo: bool = False


class MovimentoOut(BaseModel):
    id: int
    produto_id: int
    produto_nome: str
    unidade: str
    tipo: str
    quantidade: Quantidade
    saldo_apos: Quantidade
    custo_unitario: Custo | None
    origem_tipo: str | None
    origem_id: int | None
    documento: str | None
    justificativa: str | None
    ocorrido_em: datetime
    usuario_nome: str | None


class SaldoOut(BaseModel):
    produto_id: int
    nome: str
    tipo: str
    unidade: str
    saldo: Quantidade
    estoque_minimo: Quantidade
    abaixo_minimo: bool
    custo_medio: Custo
    valor_em_estoque: Dinheiro


class InventarioCriarIn(BaseModel):
    descricao: str = Field(min_length=1, max_length=160)
    # Sem filtro: todos os produtos ativos com controle de estoque.
    produto_ids: list[int] | None = Field(default=None, min_length=1)
    categoria_id: int | None = None


class ContagemIn(BaseModel):
    quantidade_contada: Quantidade = Field(ge=0)


class InventarioItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    produto_id: int
    produto_nome: str
    unidade: str
    quantidade_sistema: Quantidade
    quantidade_contada: Quantidade | None
    diferenca: Quantidade | None


class InventarioResumoOut(BaseModel):
    id: int
    descricao: str
    status: str
    created_at: datetime
    fechado_em: datetime | None
    total_itens: int
    itens_contados: int


class InventarioOut(InventarioResumoOut):
    itens: list[InventarioItemOut]


class InventarioFechadoOut(InventarioOut):
    ajustados: int
    nao_contados: int
