from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.core.money import Custo, Dinheiro, Quantidade

Periodo = Literal["dia", "semana", "mes"]


class JanelaOut(BaseModel):
    """Intervalo coberto, em datas do fuso da empresa (inclusive nas duas pontas)."""

    de: date
    ate: date


class FaturamentoPeriodoOut(BaseModel):
    janela: JanelaOut
    faturamento: Dinheiro
    vendas_qtd: int
    ticket_medio: Dinheiro


class MaisVendidoOut(BaseModel):
    produto_id: int
    produto: str
    quantidade: Quantidade
    total: Dinheiro


class PorFormaOut(BaseModel):
    forma_pagamento_id: int
    forma: str
    tipo: str
    total: Dinheiro
    pagamentos_qtd: int


class CaixaAbertoOut(BaseModel):
    caixa_id: int
    operador: str
    aberto_em: datetime
    esperado: list[PorFormaOut]


class EstoqueBaixoOut(BaseModel):
    produto_id: int
    produto: str
    unidade: str
    saldo: Quantidade
    estoque_minimo: Quantidade


class ContasReceberResumoOut(BaseModel):
    titulos_abertos: int
    saldo_aberto: Dinheiro


class DashboardOut(BaseModel):
    data_referencia: date
    timezone: str
    dia: FaturamentoPeriodoOut
    semana: FaturamentoPeriodoOut
    mes: FaturamentoPeriodoOut
    periodo_detalhe: Periodo
    mais_vendidos: list[MaisVendidoOut]
    formas_pagamento: list[PorFormaOut]
    caixas_abertos: list[CaixaAbertoOut]
    estoque_baixo_qtd: int
    estoque_baixo: list[EstoqueBaixoOut]
    contas_a_receber: ContasReceberResumoOut


# --- relatórios -----------------------------------------------------------------------------


class RelatorioVendasResumo(BaseModel):
    faturamento: Dinheiro
    vendas_qtd: int
    ticket_medio: Dinheiro
    subtotal_itens: Dinheiro
    descontos: Dinheiro
    acrescimos: Dinheiro
    taxa_servico: Dinheiro
    estornos_qtd: int
    estornos_total: Dinheiro


class LinhaVendas(BaseModel):
    chave: str
    rotulo: str
    vendas_qtd: int
    quantidade: Quantidade | None
    total: Dinheiro


class RelatorioVendasOut(BaseModel):
    janela: JanelaOut
    agrupado_por: str
    resumo: RelatorioVendasResumo
    linhas: list[LinhaVendas]


class LinhaCaixa(BaseModel):
    caixa_id: int
    operador: str
    status: str
    aberto_em: datetime
    fechado_em: datetime | None
    valor_abertura: Dinheiro
    vendas_qtd: int
    vendas_total: Dinheiro
    # Devolvido POR este caixa; as vendas acima são as RECEBIDAS nele (inclusive as estornadas depois).
    estornos_total: Dinheiro
    sangrias: Dinheiro
    reforcos: Dinheiro
    esperado_total: Dinheiro
    # Só caixas fechados: diferença líquida das conferências do último fechamento.
    diferenca_total: Dinheiro | None


class DiferencaPorForma(BaseModel):
    forma_pagamento_id: int
    forma: str
    esperado: Dinheiro
    contado: Dinheiro
    diferenca: Dinheiro


class RelatorioCaixaOut(BaseModel):
    janela: JanelaOut
    caixas: list[LinhaCaixa]
    caixas_qtd: int
    diferenca_total: Dinheiro
    por_forma: list[DiferencaPorForma]


class LinhaEstoque(BaseModel):
    produto_id: int
    produto: str
    tipo: str
    categoria: str | None
    unidade: str
    saldo: Quantidade
    estoque_minimo: Quantidade
    abaixo_minimo: bool
    custo_medio: Custo
    valor_em_estoque: Dinheiro


class RelatorioEstoqueOut(BaseModel):
    linhas: list[LinhaEstoque]
    produtos_qtd: int
    abaixo_minimo_qtd: int
    valor_total_em_estoque: Dinheiro


class LinhaPerdas(BaseModel):
    produto_id: int
    produto: str
    unidade: str
    quantidade: Quantidade
    custo_estimado: Dinheiro
    ocorrencias: int


class RelatorioPerdasOut(BaseModel):
    janela: JanelaOut
    linhas: list[LinhaPerdas]
    custo_total: Dinheiro
    ocorrencias: int


# --- relatório de compras -------------------------------------------------------------------

AgrupamentoCompras = Literal["dia", "fornecedor", "produto", "categoria"]


class RelatorioComprasResumo(BaseModel):
    # Σ de quantidade × custo unitário congelado em cada entrada (entrada sem custo conta 0).
    valor_total: Dinheiro
    quantidade_entradas: int  # nº de movimentos de entrada (unidades diferentes não se somam)
    itens: int  # produtos distintos comprados
    entradas_sem_custo: int  # entradas sem custo informado: valem 0 no total e vêm sinalizadas


class LinhaCompras(BaseModel):
    chave: str
    rotulo: str
    entradas_qtd: int
    # Só no agrupamento por produto (em outros, unidades diferentes não fazem sentido somadas).
    quantidade: Quantidade | None
    unidade: str | None
    valor: Dinheiro
    entradas_sem_custo: int


class RelatorioComprasOut(BaseModel):
    janela: JanelaOut
    agrupado_por: AgrupamentoCompras
    resumo: RelatorioComprasResumo
    linhas: list[LinhaCompras]  # do maior para o menor valor (por dia: cronológico)


# --- relatório de produtos ------------------------------------------------------------------

OrdemProdutos = Literal["receita", "quantidade", "margem"]
CurvaAbc = Literal["A", "B", "C"]
Percentual = Dinheiro  # percentual com 2 casas (string no JSON)


class LinhaProdutos(BaseModel):
    produto_id: int
    produto: str
    tipo: str
    categoria: str | None
    unidade: str
    quantidade: Quantidade
    receita: Dinheiro  # Σ do total dos itens (antes de descontos e taxa de serviço da comanda)
    custo: Dinheiro  # quantidade × custo congelado no movimento de estoque da venda
    margem: Dinheiro  # receita - custo
    margem_pct: Percentual | None  # None quando a receita é zero
    participacao_pct: Percentual  # fatia da receita total do período
    acumulado_pct: Percentual  # participação acumulada na ordem da curva (maior receita primeiro)
    curva: CurvaAbc
    # Custo zero (sem custo informado, sem ficha nem controle de estoque): a margem vem cheia.
    sem_custo: bool


class RelatorioProdutosResumo(BaseModel):
    receita_total: Dinheiro
    custo_total: Dinheiro
    margem_total: Dinheiro
    margem_pct_total: Percentual | None
    produtos_vendidos: int
    produtos_sem_custo: int
    sem_venda_qtd: int


class ProdutoSemVendaOut(BaseModel):
    produto_id: int
    produto: str
    tipo: str
    categoria: str | None
    unidade: str
    saldo: Quantidade | None  # None quando o produto não controla estoque


class RelatorioProdutosOut(BaseModel):
    janela: JanelaOut
    ordenado_por: OrdemProdutos
    resumo: RelatorioProdutosResumo
    linhas: list[LinhaProdutos]
    sem_venda: list[ProdutoSemVendaOut]
