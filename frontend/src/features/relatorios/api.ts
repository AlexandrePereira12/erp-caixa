import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usersKey } from "@/features/users/api";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type DashboardOut = Schemas["DashboardOut"];
export type RelatorioVendasOut = Schemas["RelatorioVendasOut"];
export type RelatorioCaixaOut = Schemas["RelatorioCaixaOut"];
export type RelatorioEstoqueOut = Schemas["RelatorioEstoqueOut"];
export type RelatorioPerdasOut = Schemas["RelatorioPerdasOut"];
export type LinhaVendas = Schemas["LinhaVendas"];
export type LinhaCaixa = Schemas["LinhaCaixa"];
export type LinhaEstoque = Schemas["LinhaEstoque"];
export type LinhaPerdas = Schemas["LinhaPerdas"];
export type RelatorioComprasOut = Schemas["RelatorioComprasOut"];
export type RelatorioProdutosOut = Schemas["RelatorioProdutosOut"];
export type LinhaCompras = Schemas["LinhaCompras"];
export type LinhaProdutos = Schemas["LinhaProdutos"];
export type ProdutoSemVendaOut = Schemas["ProdutoSemVendaOut"];

export const relatoriosKey = ["relatorios"] as const;

export type Periodo = DashboardOut["periodo_detalhe"];
export type Agrupar = "dia" | "forma_pagamento" | "produto" | "operador";
export type AgruparCompras = RelatorioComprasOut["agrupado_por"];
export type OrdenarProdutos = RelatorioProdutosOut["ordenado_por"];
export type TipoProduto = "revenda" | "preparado" | "insumo" | "embalagem";

/** Datas de filtro são "YYYY-MM-DD" (campo date); vazio/ausente deixa o backend escolher o padrão. */
export interface PeriodFilters {
  de?: string | undefined;
  ate?: string | undefined;
}

export interface DashboardFilters {
  periodo: Periodo;
  referencia?: string | undefined;
}

/** Painel: faturamento dos três períodos, mais vendidos e formas de pagamento do `periodo` pedido. */
export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: [...relatoriosKey, "painel", filters],
    queryFn: ({ signal }) => api.get("/dashboard", { query: { periodo: filters.periodo, referencia: filters.referencia }, signal }),
    placeholderData: keepPreviousData,
  });
}

export interface VendasFilters extends PeriodFilters {
  agrupar: Agrupar;
}

/** `enabled` é falso enquanto o período digitado é inválido: nada é pedido ao backend. */
export function useRelatorioVendas(filters: VendasFilters, enabled = true) {
  return useQuery({
    queryKey: [...relatoriosKey, "vendas", filters],
    queryFn: ({ signal }) => api.get("/relatorios/vendas", { query: { de: filters.de, ate: filters.ate, agrupar: filters.agrupar }, signal }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export interface CaixaFilters extends PeriodFilters {
  operadorId?: number | undefined;
}

export function useRelatorioCaixa(filters: CaixaFilters, enabled = true) {
  return useQuery({
    queryKey: [...relatoriosKey, "caixa", filters],
    queryFn: ({ signal }) => api.get("/relatorios/caixa", { query: { de: filters.de, ate: filters.ate, operador_id: filters.operadorId }, signal }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export interface EstoqueFilters {
  tipo?: TipoProduto | undefined;
  categoriaId?: number | undefined;
  abaixoMinimo: boolean;
}

export function useRelatorioEstoque(filters: EstoqueFilters) {
  return useQuery({
    queryKey: [...relatoriosKey, "estoque", filters],
    // `abaixo_minimo` só vai quando ligado: desligado é "sem filtro", não "só os que estão acima".
    queryFn: ({ signal }) =>
      api.get("/relatorios/estoque", { query: { tipo: filters.tipo, categoria_id: filters.categoriaId, abaixo_minimo: filters.abaixoMinimo ? true : undefined }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRelatorioPerdas(filters: PeriodFilters, enabled = true) {
  return useQuery({
    queryKey: [...relatoriosKey, "perdas", filters],
    queryFn: ({ signal }) => api.get("/relatorios/perdas", { query: { de: filters.de, ate: filters.ate }, signal }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Operadores para o filtro do relatório de caixa. Só quem pode listar usuários consegue montar a
 * lista; os demais usam o campo com o número do operador. Pede o máximo da página do backend (200)
 * porque o <select> precisa de todos, inclusive de quem foi suspenso depois de operar um caixa.
 */
export function useOperadores(enabled: boolean) {
  return useQuery({
    queryKey: [...usersKey, "operadores"],
    queryFn: ({ signal }) => api.get("/usuarios", { query: { limite: 200 }, signal }),
    enabled,
    staleTime: 60_000,
  });
}

export interface ComprasFilters extends PeriodFilters {
  agrupar: AgruparCompras;
  fornecedorId?: number | undefined;
}

/** Compras = entradas de estoque no período. `enabled` é falso enquanto o período digitado é inválido. */
export function useRelatorioCompras(filters: ComprasFilters, enabled = true) {
  return useQuery({
    queryKey: [...relatoriosKey, "compras", filters],
    queryFn: ({ signal }) =>
      api.get("/relatorios/compras", { query: { de: filters.de, ate: filters.ate, agrupar: filters.agrupar, fornecedor_id: filters.fornecedorId }, signal }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export interface ProdutosFilters extends PeriodFilters {
  categoriaId?: number | undefined;
  tipo?: TipoProduto | undefined;
  ordenar: OrdenarProdutos;
  /** Quantas linhas a tabela traz (a curva ABC e os totais valem para todos os produtos vendidos). */
  limite: number;
}

export function useRelatorioProdutos(filters: ProdutosFilters, enabled = true) {
  return useQuery({
    queryKey: [...relatoriosKey, "produtos", filters],
    queryFn: ({ signal }) =>
      api.get("/relatorios/produtos", {
        query: { de: filters.de, ate: filters.ate, categoria_id: filters.categoriaId, tipo: filters.tipo, ordenar: filters.ordenar, limite: filters.limite },
        signal,
      }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Busca de fornecedores pelo nome para o filtro do relatório de compras (exige pessoas.listar). */
export function useBuscaFornecedores(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ["pessoas", "busca-fornecedor-relatorio", term],
    queryFn: ({ signal }) => api.get("/pessoas", { query: { q: term, papel: "fornecedor", limite: 8 }, signal }),
    enabled,
    staleTime: 15_000,
  });
}
