import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { caixaKey } from "@/features/caixa/api";

export const vendasKey = ["vendas"] as const;
export const VENDAS_PAGE_SIZE = 20;

export type VendaStatus = "todas" | "validas" | "estornadas";

export interface VendaFilters {
  status: VendaStatus;
  de?: string | undefined;
  ate?: string | undefined;
  caixaId?: number | undefined;
  clienteId?: number | undefined;
  deslocamento: number;
}

export function useVendas(filters: VendaFilters) {
  return useQuery({
    queryKey: [...vendasKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/vendas", {
        query: { status: filters.status, de: filters.de, ate: filters.ate, caixa_id: filters.caixaId, cliente_id: filters.clienteId, limite: VENDAS_PAGE_SIZE, deslocamento: filters.deslocamento },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useVenda(id: number | undefined) {
  return useQuery({
    queryKey: [...vendasKey, "detalhe", id],
    queryFn: ({ signal }) => api.get("/vendas/{venda_id}", { path: { venda_id: id! }, signal }),
    enabled: id !== undefined,
  });
}

/** Estorno: devolve o valor pelo caixa de quem estorna, devolve o estoque e cancela o título de fiado. */
export function useEstornarVenda() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => api.post("/vendas/{venda_id}/estornar", { path: { venda_id: id }, body: { motivo } }),
    onSuccess: (venda) => {
      client.setQueryData([...vendasKey, "detalhe", venda.id], venda);
      void client.invalidateQueries({ queryKey: vendasKey });
      void client.invalidateQueries({ queryKey: caixaKey });
      void client.invalidateQueries({ queryKey: ["contas-receber"] });
      void client.invalidateQueries({ queryKey: ["comandas"] });
    },
  });
}
