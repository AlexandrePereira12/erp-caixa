import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { UsuarioCriarIn, UsuarioEditarIn } from "@/lib/api/types";

export const PAGE_SIZE = 20;
export const usersKey = ["usuarios"] as const;

export interface UserFilters {
  q: string;
  suspenso: boolean | undefined;
  papelId: number | undefined;
  deslocamento: number;
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: [...usersKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/usuarios", {
        query: { q: filters.q || undefined, suspenso: filters.suspenso, papel_id: filters.papelId, limite: PAGE_SIZE, deslocamento: filters.deslocamento },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Mutations de usuário: todas invalidam as listas ao concluir. */
export function useUserMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: usersKey });

  return {
    create: useMutation({
      mutationFn: (body: UsuarioCriarIn) => api.post("/usuarios", { body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: UsuarioEditarIn }) => api.patch("/usuarios/{usuario_id}", { path: { usuario_id: id }, body }),
      onSuccess: invalidate,
    }),
    suspend: useMutation({
      mutationFn: (id: number) => api.post("/usuarios/{usuario_id}/suspender", { path: { usuario_id: id } }),
      onSuccess: invalidate,
    }),
    reactivate: useMutation({
      mutationFn: (id: number) => api.post("/usuarios/{usuario_id}/reativar", { path: { usuario_id: id } }),
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, senha_temporaria }: { id: number; senha_temporaria: string }) =>
        api.post("/usuarios/{usuario_id}/redefinir-senha", { path: { usuario_id: id }, body: { senha_temporaria } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.delete("/usuarios/{usuario_id}", { path: { usuario_id: id } }),
      onSuccess: invalidate,
    }),
  };
}
