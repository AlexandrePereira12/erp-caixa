import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export const mesasKey = ["mesas"] as const;
export const MAPA_REFRESH_MS = 15_000;

type MesaIn = components["schemas"]["MesaIn"];
type MesaEditarIn = components["schemas"]["MesaEditarIn"];

/** Mapa do salão com atualização automática leve (a cada 15 s e ao voltar para a aba). */
export function useMesaMapa(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...mesasKey, "mapa"],
    queryFn: ({ signal }) => api.get("/mesas/mapa", { signal }),
    enabled: options.enabled ?? true,
    refetchInterval: MAPA_REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/** Todas as mesas (inclui inativas), para a gestão. */
export function useMesas() {
  return useQuery({ queryKey: [...mesasKey, "lista"], queryFn: ({ signal }) => api.get("/mesas", { signal }) });
}

export function useMesaMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: mesasKey });
  return {
    create: useMutation({ mutationFn: (body: MesaIn) => api.post("/mesas", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: MesaEditarIn }) => api.patch("/mesas/{mesa_id}", { path: { mesa_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/mesas/{mesa_id}", { path: { mesa_id: id } }), onSuccess: invalidate }),
    reserve: useMutation({ mutationFn: (id: number) => api.post("/mesas/{mesa_id}/reservar", { path: { mesa_id: id } }), onSuccess: invalidate }),
    block: useMutation({ mutationFn: (id: number) => api.post("/mesas/{mesa_id}/bloquear", { path: { mesa_id: id } }), onSuccess: invalidate }),
    release: useMutation({ mutationFn: (id: number) => api.post("/mesas/{mesa_id}/liberar", { path: { mesa_id: id } }), onSuccess: invalidate }),
  };
}
