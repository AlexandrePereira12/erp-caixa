import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { localInputToIso } from "@/lib/format";

export const AUDIT_PAGE_SIZE = 25;
export const auditKey = ["auditoria"] as const;

/** Filtros como vivem na URL: datas no formato do <input type="datetime-local"> (horário local). */
export interface AuditFilters {
  usuarioId: string;
  acao: string;
  modulo: string;
  recurso: string;
  recursoId: string;
  requestId: string;
  de: string;
  ate: string;
  pagina: number;
}

export function useAudit(filters: AuditFilters) {
  return useQuery({
    queryKey: [...auditKey, "lista", filters],
    queryFn: ({ signal }) => {
      const usuarioId = Number(filters.usuarioId);
      return api.get("/auditoria", {
        query: {
          usuario_id: filters.usuarioId && Number.isInteger(usuarioId) ? usuarioId : undefined,
          acao: filters.acao || undefined,
          modulo: filters.modulo || undefined,
          recurso: filters.recurso || undefined,
          recurso_id: filters.recursoId || undefined,
          request_id: filters.requestId || undefined,
          de: localInputToIso(filters.de),
          ate: localInputToIso(filters.ate),
          limite: AUDIT_PAGE_SIZE,
          deslocamento: (filters.pagina - 1) * AUDIT_PAGE_SIZE,
        },
        signal,
      });
    },
    placeholderData: keepPreviousData,
  });
}

export function useAuditEntry(id: number) {
  return useQuery({
    queryKey: [...auditKey, "detalhe", id],
    queryFn: ({ signal }) => api.get("/auditoria/{auditoria_id}", { path: { auditoria_id: id }, signal }),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 5 * 60_000, // registros de auditoria são imutáveis
  });
}

/** Opções do filtro de usuário (precisa de usuarios.listar). */
export function useUserOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["usuarios", "opcoes"],
    queryFn: ({ signal }) => api.get("/usuarios", { query: { limite: 200 }, signal }),
    enabled,
    staleTime: 60_000,
  });
}
