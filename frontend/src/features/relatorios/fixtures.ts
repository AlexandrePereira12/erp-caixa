/*
 * Dados de teste dos relatórios (formato real da API: dinheiro e quantidade como string decimal).
 * Só é importado por testes.
 */
import { signIn } from "@/test/render";
import type { Permission } from "@/lib/auth/permissions";

/** Sessão com exatamente estas permissões (nada de papel pronto: cada teste diz o que o perfil pode). */
export function signInWith(...permissoes: Permission[]) {
  return signIn({ permissoes });
}

export const T0 = "2026-10-13T12:00:00+00:00";

const janela = (de: string, ate: string) => ({ de, ate });

export const dashboard = (over: Record<string, unknown> = {}) => ({
  data_referencia: "2026-10-14",
  timezone: "America/Sao_Paulo",
  periodo_detalhe: "dia",
  dia: { janela: janela("2026-10-14", "2026-10-14"), faturamento: "1234.50", vendas_qtd: 31, ticket_medio: "39.82" },
  semana: { janela: janela("2026-10-12", "2026-10-18"), faturamento: "5000.00", vendas_qtd: 120, ticket_medio: "41.67" },
  mes: { janela: janela("2026-10-01", "2026-10-31"), faturamento: "9000.00", vendas_qtd: 210, ticket_medio: "42.86" },
  mais_vendidos: [
    { produto_id: 7, produto: "Chopp 300ml", quantidade: "42.000", total: "378.00" },
    { produto_id: 9, produto: "Picanha por kg", quantidade: "6.500", total: "584.35" },
  ],
  formas_pagamento: [
    { forma_pagamento_id: 2, forma: "Pix", tipo: "pix", total: "700.00", pagamentos_qtd: 18 },
    { forma_pagamento_id: 1, forma: "Dinheiro", tipo: "dinheiro", total: "350.00", pagamentos_qtd: 9 },
  ],
  caixas_abertos: [
    {
      caixa_id: 5,
      operador: "Ana Souza",
      aberto_em: T0,
      esperado: [
        { forma_pagamento_id: 1, forma: "Dinheiro", tipo: "dinheiro", total: "250.00", pagamentos_qtd: 0 },
        { forma_pagamento_id: 2, forma: "Pix", tipo: "pix", total: "80.00", pagamentos_qtd: 0 },
      ],
    },
  ],
  estoque_baixo_qtd: 12,
  estoque_baixo: [
    { produto_id: 3, produto: "Coca-Cola lata", unidade: "UN", saldo: "2.000", estoque_minimo: "12.000" },
    { produto_id: 4, produto: "Farinha de trigo", unidade: "KG", saldo: "1.500", estoque_minimo: "5.000" },
  ],
  contas_a_receber: { titulos_abertos: 3, saldo_aberto: "540.00" },
  ...over,
});

export const dashboardVazio = () =>
  dashboard({
    dia: { janela: janela("2026-10-14", "2026-10-14"), faturamento: "0.00", vendas_qtd: 0, ticket_medio: "0.00" },
    mais_vendidos: [],
    formas_pagamento: [],
    caixas_abertos: [],
    estoque_baixo_qtd: 0,
    estoque_baixo: [],
    contas_a_receber: { titulos_abertos: 0, saldo_aberto: "0.00" },
  });

export const resumoVendas = (over: Record<string, unknown> = {}) => ({
  faturamento: "1500.00",
  vendas_qtd: 40,
  ticket_medio: "37.50",
  subtotal_itens: "1450.00",
  descontos: "30.00",
  acrescimos: "5.00",
  taxa_servico: "75.00",
  estornos_qtd: 2,
  estornos_total: "88.00",
  ...over,
});

export const relatorioVendas = (over: Record<string, unknown> = {}) => ({
  agrupado_por: "dia",
  janela: janela("2026-10-01", "2026-10-05"),
  resumo: resumoVendas(),
  linhas: [
    { chave: "2026-10-02", rotulo: "02/10/2026", vendas_qtd: 10, quantidade: null, total: "400.00" },
    { chave: "2026-10-04", rotulo: "04/10/2026", vendas_qtd: 30, quantidade: null, total: "1100.00" },
  ],
  ...over,
});

export const vendasPorProduto = () =>
  relatorioVendas({
    agrupado_por: "produto",
    linhas: [
      { chave: "9", rotulo: "Picanha por kg", vendas_qtd: 12, quantidade: "6.500", total: "584.35" },
      { chave: "7", rotulo: "Chopp 300ml", vendas_qtd: 20, quantidade: "42.000", total: "378.00" },
    ],
  });

export const vendasPorForma = () =>
  relatorioVendas({
    agrupado_por: "forma_pagamento",
    linhas: [
      { chave: "2", rotulo: "Pix", vendas_qtd: 18, quantidade: null, total: "700.00" },
      { chave: "1", rotulo: "Dinheiro", vendas_qtd: 9, quantidade: null, total: "350.00" },
    ],
  });

export const vendasPorOperador = () =>
  relatorioVendas({
    agrupado_por: "operador",
    linhas: [{ chave: "1", rotulo: "Ana Souza", vendas_qtd: 40, quantidade: null, total: "1500.00" }],
  });

export const vendasVazio = () =>
  relatorioVendas({ resumo: resumoVendas({ faturamento: "0.00", vendas_qtd: 0, ticket_medio: "0.00", subtotal_itens: "0.00", descontos: "0.00", acrescimos: "0.00", taxa_servico: "0.00", estornos_qtd: 0, estornos_total: "0.00" }), linhas: [] });

export const linhaCaixa = (over: Record<string, unknown> = {}) => ({
  caixa_id: 5,
  operador: "Ana Souza",
  status: "fechado",
  aberto_em: "2026-10-12T11:00:00+00:00",
  fechado_em: "2026-10-12T22:00:00+00:00",
  valor_abertura: "100.00",
  vendas_qtd: 14,
  vendas_total: "620.00",
  estornos_total: "0.00",
  sangrias: "200.00",
  reforcos: "0.00",
  esperado_total: "520.00",
  diferenca_total: "-12.50",
  ...over,
});

export const relatorioCaixa = (over: Record<string, unknown> = {}) => ({
  janela: janela("2026-10-01", "2026-10-14"),
  caixas_qtd: 2,
  diferenca_total: "-12.50",
  caixas: [
    linhaCaixa(),
    linhaCaixa({ caixa_id: 6, operador: "Bruno Lima", status: "aberto", fechado_em: null, diferenca_total: null, vendas_qtd: 3, vendas_total: "90.00", sangrias: "0.00", esperado_total: "190.00" }),
  ],
  por_forma: [
    { forma_pagamento_id: 1, forma: "Dinheiro", esperado: "420.00", contado: "407.50", diferenca: "-12.50" },
    { forma_pagamento_id: 2, forma: "Pix", esperado: "100.00", contado: "100.00", diferenca: "0.00" },
  ],
  ...over,
});

export const linhaEstoque = (over: Record<string, unknown> = {}) => ({
  produto_id: 3,
  produto: "Coca-Cola lata",
  tipo: "revenda",
  categoria: "Bebidas",
  unidade: "UN",
  saldo: "2.000",
  estoque_minimo: "12.000",
  abaixo_minimo: true,
  custo_medio: "3.2500",
  valor_em_estoque: "6.50",
  ...over,
});

export const relatorioEstoque = (over: Record<string, unknown> = {}) => ({
  produtos_qtd: 3,
  abaixo_minimo_qtd: 1,
  valor_total_em_estoque: "1234.56",
  linhas: [
    linhaEstoque(),
    linhaEstoque({ produto_id: 4, produto: "Farinha de trigo", tipo: "insumo", categoria: null, unidade: "KG", saldo: "20.000", estoque_minimo: "5.000", abaixo_minimo: false, custo_medio: "4.5000", valor_em_estoque: "90.00" }),
    linhaEstoque({ produto_id: 5, produto: "Guardanapo", tipo: "embalagem", categoria: "Descartáveis", unidade: "UN", saldo: "300.000", estoque_minimo: "0.000", abaixo_minimo: false, custo_medio: "0.0500", valor_em_estoque: "15.00" }),
  ],
  ...over,
});

export const relatorioPerdas = (over: Record<string, unknown> = {}) => ({
  janela: janela("2026-10-01", "2026-10-14"),
  custo_total: "87.40",
  ocorrencias: 5,
  linhas: [
    { produto_id: 4, produto: "Farinha de trigo", unidade: "KG", quantidade: "3.500", custo_estimado: "52.50", ocorrencias: 2 },
    { produto_id: 3, produto: "Coca-Cola lata", unidade: "UN", quantidade: "6.000", custo_estimado: "34.90", ocorrencias: 3 },
  ],
  ...over,
});

const linhaCompras = (over: Record<string, unknown> = {}) => ({
  chave: "2026-10-02",
  rotulo: "02/10/2026",
  entradas_qtd: 3,
  quantidade: null,
  unidade: null,
  valor: "300.00",
  entradas_sem_custo: 0,
  ...over,
});

export const relatorioCompras = (over: Record<string, unknown> = {}) => ({
  agrupado_por: "dia",
  janela: janela("2026-10-01", "2026-10-05"),
  resumo: { valor_total: "1500.00", quantidade_entradas: 7, itens: 5, entradas_sem_custo: 2 },
  linhas: [linhaCompras(), linhaCompras({ chave: "2026-10-04", rotulo: "04/10/2026", entradas_qtd: 4, valor: "1200.00", entradas_sem_custo: 2 })],
  ...over,
});

export const comprasPorFornecedor = () =>
  relatorioCompras({
    agrupado_por: "fornecedor",
    linhas: [
      linhaCompras({ chave: "7", rotulo: "Distribuidora Sul", entradas_qtd: 4, valor: "1000.00", entradas_sem_custo: 0 }),
      linhaCompras({ chave: "sem_fornecedor", rotulo: "Sem fornecedor", entradas_qtd: 3, valor: "500.00", entradas_sem_custo: 2 }),
    ],
  });

export const comprasPorProduto = () =>
  relatorioCompras({
    agrupado_por: "produto",
    linhas: [
      linhaCompras({ chave: "4", rotulo: "Farinha de trigo", entradas_qtd: 2, quantidade: "20.000", unidade: "KG", valor: "900.00", entradas_sem_custo: 0 }),
      linhaCompras({ chave: "3", rotulo: "Coca-Cola lata", entradas_qtd: 5, quantidade: "144.000", unidade: "UN", valor: "600.00", entradas_sem_custo: 2 }),
    ],
  });

export const comprasPorCategoria = () =>
  relatorioCompras({
    agrupado_por: "categoria",
    linhas: [
      linhaCompras({ chave: "1", rotulo: "Bebidas", entradas_qtd: 5, valor: "900.00", entradas_sem_custo: 0 }),
      linhaCompras({ chave: "sem_categoria", rotulo: "Sem categoria", entradas_qtd: 2, valor: "600.00", entradas_sem_custo: 2 }),
    ],
  });

export const comprasSemCusto = () => relatorioCompras({ resumo: { valor_total: "1500.00", quantidade_entradas: 7, itens: 5, entradas_sem_custo: 0 }, linhas: [linhaCompras({ valor: "1500.00" })] });

export const comprasVazio = () => relatorioCompras({ resumo: { valor_total: "0.00", quantidade_entradas: 0, itens: 0, entradas_sem_custo: 0 }, linhas: [] });

export const linhaProdutos = (over: Record<string, unknown> = {}) => ({
  produto_id: 9,
  produto: "Picanha por kg",
  tipo: "revenda",
  categoria: "Carnes",
  unidade: "KG",
  quantidade: "6.500",
  receita: "500.00",
  custo: "300.00",
  margem: "200.00",
  margem_pct: "40.00",
  participacao_pct: "50.00",
  acumulado_pct: "50.00",
  curva: "A",
  sem_custo: false,
  ...over,
});

export const relatorioProdutos = (over: Record<string, unknown> = {}) => ({
  janela: janela("2026-10-01", "2026-10-14"),
  ordenado_por: "receita",
  resumo: { receita_total: "1000.00", custo_total: "474.00", margem_total: "526.00", margem_pct_total: "52.60", produtos_vendidos: 5, produtos_sem_custo: 1, sem_venda_qtd: 2 },
  linhas: [
    linhaProdutos(),
    linhaProdutos({ produto_id: 7, produto: "Chopp 300ml", categoria: "Bebidas", unidade: "UN", quantidade: "42.000", receita: "350.00", custo: "126.00", margem: "224.00", margem_pct: "64.00", participacao_pct: "35.00", acumulado_pct: "85.00", curva: "A" }),
    linhaProdutos({ produto_id: 11, produto: "Pastel de queijo", tipo: "preparado", categoria: null, unidade: "UN", quantidade: "10.000", receita: "100.00", custo: "40.00", margem: "60.00", margem_pct: "60.00", participacao_pct: "10.00", acumulado_pct: "95.00", curva: "B" }),
    linhaProdutos({ produto_id: 12, produto: "Suco de laranja", categoria: "Bebidas", unidade: "UN", quantidade: "5.000", receita: "30.00", custo: "0.00", margem: "30.00", margem_pct: "100.00", participacao_pct: "3.00", acumulado_pct: "98.00", curva: "C", sem_custo: true }),
    linhaProdutos({ produto_id: 13, produto: "Água sem gás", categoria: "Bebidas", unidade: "UN", quantidade: "4.000", receita: "20.00", custo: "8.00", margem: "12.00", margem_pct: "60.00", participacao_pct: "2.00", acumulado_pct: "100.00", curva: "C" }),
  ],
  sem_venda: [
    { produto_id: 20, produto: "Torresmo", tipo: "revenda", categoria: "Porções", unidade: "UN", saldo: "12.000" },
    { produto_id: 21, produto: "Almoço executivo", tipo: "preparado", categoria: null, unidade: "UN", saldo: null },
  ],
  ...over,
});

export const produtosSemCusto = () => relatorioProdutos({ resumo: { receita_total: "1000.00", custo_total: "474.00", margem_total: "526.00", margem_pct_total: "52.60", produtos_vendidos: 5, produtos_sem_custo: 0, sem_venda_qtd: 2 }, linhas: [linhaProdutos({ sem_custo: false })] });

export const produtosVazio = () =>
  relatorioProdutos({
    resumo: { receita_total: "0.00", custo_total: "0.00", margem_total: "0.00", margem_pct_total: null, produtos_vendidos: 0, produtos_sem_custo: 0, sem_venda_qtd: 2 },
    linhas: [],
  });
