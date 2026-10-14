import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersKey } from "@/features/users/api";
import { api } from "@/lib/api/client";
import type { PapelCriarIn, PapelEditarIn } from "@/lib/api/types";

export const rolesKey = ["papeis"] as const;
export const permissionsKey = ["permissoes"] as const;

export function useRoles(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: rolesKey,
    queryFn: ({ signal }) => api.get("/papeis", { signal }),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

export function usePermissionCatalog(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: permissionsKey,
    queryFn: ({ signal }) => api.get("/permissoes", { signal }),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

export function useRoleMutations() {
  const client = useQueryClient();
  // Nomes de papéis aparecem nas linhas de usuários; invalida as duas listas.
  const invalidate = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: rolesKey }), client.invalidateQueries({ queryKey: usersKey })]);
  };

  return {
    create: useMutation({
      mutationFn: (body: PapelCriarIn) => api.post("/papeis", { body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: PapelEditarIn }) => api.patch("/papeis/{papel_id}", { path: { papel_id: id }, body }),
      onSuccess: invalidate,
    }),
    setPermissions: useMutation({
      mutationFn: ({ id, permissoes }: { id: number; permissoes: string[] }) => api.put("/papeis/{papel_id}/permissoes", { path: { papel_id: id }, body: { permissoes } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api.delete("/papeis/{papel_id}", { path: { papel_id: id } }),
      onSuccess: invalidate,
    }),
  };
}
