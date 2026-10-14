import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PapelPessoa, PessoaEditarIn, PessoaIn, PessoaRapidaIn } from "./types";
import { api } from "@/lib/api/client";

export const PEOPLE_PAGE_SIZE = 20;
export const peopleKey = ["pessoas"] as const;

export interface PersonFilters {
  q: string;
  papel: PapelPessoa | undefined;
  ativo: boolean | undefined;
  deslocamento: number;
}

export function usePeople(filters: PersonFilters) {
  return useQuery({
    queryKey: [...peopleKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/pessoas", {
        query: { q: filters.q || undefined, papel: filters.papel, ativo: filters.ativo, limite: PEOPLE_PAGE_SIZE, deslocamento: filters.deslocamento },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Saldo em aberto do cliente (módulo financeiro; exige financeiro.listar — chame só com a permissão). */
export function usePersonOpenBalance(id: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...peopleKey, "saldo-aberto", id],
    queryFn: ({ signal }) => api.get("/pessoas/{pessoa_id}/saldo-aberto", { path: { pessoa_id: id as number }, signal }),
    enabled: enabled && id !== undefined,
  });
}

export function usePersonMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: peopleKey });
  return {
    create: useMutation({ mutationFn: (body: PessoaIn) => api.post("/pessoas", { body }), onSuccess: invalidate }),
    quick: useMutation({ mutationFn: (body: PessoaRapidaIn) => api.post("/pessoas/rapido", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: PessoaEditarIn }) => api.patch("/pessoas/{pessoa_id}", { path: { pessoa_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/pessoas/{pessoa_id}", { path: { pessoa_id: id } }), onSuccess: invalidate }),
  };
}
