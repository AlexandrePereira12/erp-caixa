import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { ConfiguracaoEditarIn } from "@/lib/api/types";

export const settingsKey = ["configuracoes"] as const;
export const pixKey = ["configuracoes", "pix"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => api.get("/configuracoes", { signal }) });
}

/** Pix da empresa para o fechamento da conta. Exige comandas.fechar (não precisa de configuracoes.ver). */
export function usePix(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: pixKey, queryFn: ({ signal }) => api.get("/configuracoes/pix", { signal }), enabled: options.enabled ?? true });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfiguracaoEditarIn) => api.patch("/configuracoes", { body }),
    onSuccess: (saved) => {
      client.setQueryData(settingsKey, saved);
      void client.invalidateQueries({ queryKey: pixKey });
    },
  });
}
