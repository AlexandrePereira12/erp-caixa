import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { ConfiguracaoEditarIn } from "@/lib/api/types";

export const settingsKey = ["configuracoes"] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => api.get("/configuracoes", { signal }) });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfiguracaoEditarIn) => api.patch("/configuracoes", { body }),
    onSuccess: (saved) => client.setQueryData(settingsKey, saved),
  });
}
