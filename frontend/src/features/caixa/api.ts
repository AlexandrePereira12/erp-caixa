import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";
import type { Caixa } from "@/components/pdv/types";

export const caixaKey = ["caixa"] as const;
export const CAIXA_PAGE_SIZE = 20;

type FechamentoIn = components["schemas"]["FechamentoIn"];
type MovimentoIn = components["schemas"]["MovimentoCaixaIn"];

/** Caixa aberto do usuário logado. 404 = não há caixa aberto (resultado null, não erro). */
export function useCaixaAtual(options: { enabled?: boolean } = {}) {
  return useQuery<Caixa | null>({
    queryKey: [...caixaKey, "atual"],
    queryFn: async ({ signal }) => {
      try {
        return await api.get("/caixas/atual", { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: options.enabled ?? true,
    staleTime: 10_000,
  });
}

export function useCaixa(id: number | undefined) {
  return useQuery({
    queryKey: [...caixaKey, "detalhe", id],
    queryFn: ({ signal }) => api.get("/caixas/{caixa_id}", { path: { caixa_id: id! }, signal }),
    enabled: id !== undefined,
  });
}

export function useMovimentos(caixaId: number | undefined, offset: number) {
  return useQuery({
    queryKey: [...caixaKey, "movimentos", caixaId, offset],
    queryFn: ({ signal }) =>
      api.get("/caixas/{caixa_id}/movimentos", { path: { caixa_id: caixaId! }, query: { limite: CAIXA_PAGE_SIZE, deslocamento: offset }, signal }),
    enabled: caixaId !== undefined,
    placeholderData: keepPreviousData,
  });
}

export interface CaixaFilters {
  status?: "aberto" | "fechado" | undefined;
  operadorId?: number | undefined;
  de?: string | undefined;
  ate?: string | undefined;
  deslocamento: number;
}

export function useCaixas(filters: CaixaFilters) {
  return useQuery({
    queryKey: [...caixaKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/caixas", {
        query: { status: filters.status, operador_id: filters.operadorId, de: filters.de, ate: filters.ate, limite: CAIXA_PAGE_SIZE, deslocamento: filters.deslocamento },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Mutations do caixa: todas invalidam o que o caixa mostra (atual, detalhe, movimentos, lista). */
export function useCaixaMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: caixaKey });
  return {
    open: useMutation({ mutationFn: (valor_abertura: string) => api.post("/caixas/abrir", { body: { valor_abertura } }), onSuccess: invalidate }),
    movement: useMutation({
      mutationFn: ({ caixaId, body }: { caixaId: number; body: MovimentoIn }) => api.post("/caixas/{caixa_id}/movimentos", { path: { caixa_id: caixaId }, body }),
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: ({ caixaId, body }: { caixaId: number; body: FechamentoIn }) => api.post("/caixas/{caixa_id}/fechar", { path: { caixa_id: caixaId }, body }),
      onSuccess: invalidate,
    }),
    reopen: useMutation({
      mutationFn: ({ caixaId, justificativa }: { caixaId: number; justificativa: string }) =>
        api.post("/caixas/{caixa_id}/reabrir", { path: { caixa_id: caixaId }, body: { justificativa } }),
      onSuccess: invalidate,
    }),
  };
}
