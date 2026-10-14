import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { caixaKey } from "@/features/caixa/api";

export const contasKey = ["contas-receber"] as const;
export const CONTAS_PAGE_SIZE = 20;

export type TituloStatus = "aberto" | "pago" | "cancelado";

export interface TituloFilters {
  status?: TituloStatus | undefined;
  pessoaId?: number | undefined;
  deslocamento: number;
}

export function useTitulos(filters: TituloFilters) {
  return useQuery({
    queryKey: [...contasKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/contas-receber", { query: { status: filters.status, pessoa_id: filters.pessoaId, limite: CONTAS_PAGE_SIZE, deslocamento: filters.deslocamento }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useTitulo(id: number | undefined) {
  return useQuery({
    queryKey: [...contasKey, "detalhe", id],
    queryFn: ({ signal }) => api.get("/contas-receber/{titulo_id}", { path: { titulo_id: id! }, signal }),
    enabled: id !== undefined,
  });
}

/** Limite e saldo de fiado do cliente (GET /pessoas/{id}/saldo-aberto, exige financeiro.listar). */
export function useSaldoAberto(pessoaId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: [...contasKey, "saldo-aberto", pessoaId],
    queryFn: ({ signal }) => api.get("/pessoas/{pessoa_id}/saldo-aberto", { path: { pessoa_id: pessoaId! }, signal }),
    enabled: enabled && pessoaId !== undefined,
    staleTime: 10_000,
  });
}

export function useHistoricoCliente(pessoaId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: [...contasKey, "historico", pessoaId],
    queryFn: ({ signal }) => api.get("/pessoas/{pessoa_id}/historico", { path: { pessoa_id: pessoaId! }, signal }),
    enabled: enabled && pessoaId !== undefined,
  });
}

export function useBaixar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, valor, forma_pagamento_id, observacao, chave }: { id: number; valor: string; forma_pagamento_id: number; observacao?: string; chave?: string }) =>
      api.post("/contas-receber/{titulo_id}/baixas", { path: { titulo_id: id }, body: { valor, forma_pagamento_id, ...(observacao ? { observacao } : {}), ...(chave ? { chave } : {}) } }),
    onSuccess: (titulo) => {
      client.setQueryData([...contasKey, "detalhe", titulo.id], titulo);
      void client.invalidateQueries({ queryKey: contasKey });
      void client.invalidateQueries({ queryKey: caixaKey });
    },
  });
}
