from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.money import Custo, Dinheiro, Quantidade

TipoProduto = Literal["revenda", "preparado", "insumo", "embalagem"]


class UnidadeIn(BaseModel):
    sigla: str = Field(min_length=1, max_length=10)
    nome: str = Field(min_length=1, max_length=60)
    casas_decimais: int = Field(default=0, ge=0, le=3)


class UnidadeEditarIn(BaseModel):
    sigla: str | None = Field(default=None, min_length=1, max_length=10)
    nome: str | None = Field(default=None, min_length=1, max_length=60)
    casas_decimais: int | None = Field(default=None, ge=0, le=3)


class UnidadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sigla: str
    nome: str
    casas_decimais: int


class CategoriaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str | None = Field(default=None, max_length=500)
    ativo: bool = True


class CategoriaEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    descricao: str | None = Field(default=None, max_length=500)
    ativo: bool | None = None


class CategoriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: str | None
    ativo: bool


class CategoriaResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class ComposicaoItemIn(BaseModel):
    insumo_id: int
    quantidade: Quantidade = Field(gt=0)


class ComposicaoIn(BaseModel):
    itens: list[ComposicaoItemIn]


class ComposicaoItemOut(BaseModel):
    insumo_id: int
    insumo_nome: str
    unidade: str
    quantidade: Quantidade
    custo_item: Dinheiro


class ProdutoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=160)
    tipo: TipoProduto
    categoria_id: int | None = None
    unidade_id: int
    codigo: str | None = Field(default=None, max_length=40)
    codigo_barras: str | None = Field(default=None, max_length=32)
    preco_venda: Dinheiro = Field(default=Decimal(0), ge=0)
    # Custo inicial (ex.: carga de dados). Depois disso, o custo médio só muda por entradas.
    custo_inicial: Custo = Field(default=Decimal(0), ge=0)
    estoque_minimo: Quantidade = Field(default=Decimal(0), ge=0)
    controla_estoque: bool | None = None  # padrão: False para preparado, True para os demais
    vendavel: bool | None = None  # padrão: False para insumo/embalagem
    ativo: bool = True


class ProdutoEditarIn(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=160)
    tipo: TipoProduto | None = None
    categoria_id: int | None = None
    unidade_id: int | None = None
    codigo: str | None = Field(default=None, max_length=40)
    codigo_barras: str | None = Field(default=None, max_length=32)
    preco_venda: Dinheiro | None = Field(default=None, ge=0)
    estoque_minimo: Quantidade | None = Field(default=None, ge=0)
    controla_estoque: bool | None = None
    vendavel: bool | None = None
    ativo: bool | None = None


class ProdutoOut(BaseModel):
    id: int
    nome: str
    tipo: str
    categoria: CategoriaResumo | None
    unidade: UnidadeOut
    codigo: str | None
    codigo_barras: str | None
    preco_venda: Dinheiro
    custo_medio: Custo
    # Para produto com ficha técnica: soma do custo médio dos insumos.
    custo_ficha: Custo | None
    estoque_minimo: Quantidade
    controla_estoque: bool
    vendavel: bool
    ativo: bool
    saldo: Quantidade | None
    abaixo_minimo: bool
    composicao: list[ComposicaoItemOut]
