import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dayEndExclusiveIso, dayStartIso } from "./dates";
import type { AjusteIn, EntradaIn, TipoMovimento } from "./types";
import { api } from "@/lib/api/client";
import type { TipoProduto } from "@/features/catalogo/types";

export const STOCK_PAGE_SIZE = 20;
export const stockKey = ["estoque"] as const;

export interface BalanceFilters {
  q: string;
  tipo: TipoProduto | undefined;
  categoriaId: number | undefined;
  abaixoMinimo: boolean;
  deslocamento: number;
}

export function useBalances(filters: BalanceFilters) {
  return useQuery({
    queryKey: [...stockKey, "saldos", filters],
    queryFn: ({ signal }) =>
      api.get("/estoque/saldos", {
        query: {
          q: filters.q || undefined,
          tipo: filters.tipo,
          categoria_id: filters.categoriaId,
          abaixo_minimo: filters.abaixoMinimo ? true : undefined,
          limite: STOCK_PAGE_SIZE,
          deslocamento: filters.deslocamento,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export interface MovementFilters {
  produtoId: number | undefined;
  tipo: TipoMovimento | undefined;
  /** Datas "AAAA-MM-DD" (campo de data); viram ISO no horário local ao consultar. */
  de: string;
  ate: string;
  deslocamento: number;
}

export function useMovements(filters: MovementFilters) {
  return useQuery({
    queryKey: [...stockKey, "movimentos", filters],
    queryFn: ({ signal }) =>
      api.get("/estoque/movimentos", {
        query: {
          produto_id: filters.produtoId,
          tipo: filters.tipo,
          de: filters.de ? dayStartIso(filters.de) : undefined,
          ate: filters.ate ? dayEndExclusiveIso(filters.ate) : undefined,
          limite: STOCK_PAGE_SIZE,
          deslocamento: filters.deslocamento,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Busca de produtos que controlam estoque (para entrada, ajuste e filtro de movimentos).
 * Usa /estoque/saldos (permissão estoque.listar, a mesma da tela), que já traz só produtos
 * controlados e o saldo atual.
 */
export function useStockProductSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: [...stockKey, "busca", q],
    queryFn: ({ signal }) => api.get("/estoque/saldos", { query: { q: q || undefined, limite: 20 }, signal }),
    enabled,
  });
}

export function useStockMutations() {
  const client = useQueryClient();
  // Saldos, movimentos e a lista de produtos (saldo, custo médio) mudam com qualquer movimento.
  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: stockKey }), client.invalidateQueries({ queryKey: ["produtos"] })]);
  return {
    entry: useMutation({ mutationFn: (body: EntradaIn) => api.post("/estoque/entradas", { body }), onSuccess: invalidate }),
    adjust: useMutation({ mutationFn: (body: AjusteIn) => api.post("/estoque/ajustes", { body }), onSuccess: invalidate }),
  };
}
