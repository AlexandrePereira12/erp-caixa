import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export const formasKey = ["formas-pagamento"] as const;

type FormaIn = components["schemas"]["FormaPagamentoIn"];
type FormaEditarIn = components["schemas"]["FormaPagamentoEditarIn"];

/** Formas de pagamento (todas, ou só as ativas com `ativa: true`). Exige formas_pagamento.listar. */
export function useFormas(options: { ativa?: boolean; enabled?: boolean } = {}) {
  const { ativa, enabled = true } = options;
  return useQuery({
    queryKey: [...formasKey, { ativa }],
    queryFn: ({ signal }) => api.get("/formas-pagamento", { query: { ativa }, signal }),
    enabled,
    staleTime: 60_000,
  });
}

export function useFormaMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: formasKey });
  return {
    create: useMutation({ mutationFn: (body: FormaIn) => api.post("/formas-pagamento", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: FormaEditarIn }) => api.patch("/formas-pagamento/{forma_id}", { path: { forma_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/formas-pagamento/{forma_id}", { path: { forma_id: id } }), onSuccess: invalidate }),
  };
}
