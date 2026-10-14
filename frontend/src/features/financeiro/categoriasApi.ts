import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export const categoriasKey = ["categorias-financeiras"] as const;

export type CategoriaFinanceira = components["schemas"]["CategoriaFinanceiraOut"];
export type CategoriaTipo = CategoriaFinanceira["tipo"];

type CategoriaIn = components["schemas"]["CategoriaFinanceiraIn"];
type CategoriaEditarIn = components["schemas"]["CategoriaFinanceiraEditarIn"];

/** Categorias financeiras (todas, ou só de um tipo). Exige financeiro.listar. */
export function useCategorias(options: { tipo?: CategoriaTipo; enabled?: boolean } = {}) {
  const { tipo, enabled = true } = options;
  return useQuery({
    queryKey: [...categoriasKey, { tipo }],
    queryFn: ({ signal }) => api.get("/categorias-financeiras", { query: { tipo }, signal }),
    enabled,
    staleTime: 60_000,
  });
}

export function useCategoriaMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: categoriasKey });
  return {
    create: useMutation({ mutationFn: (body: CategoriaIn) => api.post("/categorias-financeiras", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: CategoriaEditarIn }) => api.patch("/categorias-financeiras/{categoria_id}", { path: { categoria_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/categorias-financeiras/{categoria_id}", { path: { categoria_id: id } }), onSuccess: invalidate }),
  };
}
