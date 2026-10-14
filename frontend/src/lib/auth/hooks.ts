import { useCallback, useSyncExternalStore } from "react";
import type { Permission } from "./permissions";
import { session, type SessionSnapshot } from "./session";

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** Verificação de permissões pelo array `permissoes` de /auth/me (só para esconder/desabilitar UI). */
export function usePermissions() {
  const { me } = useSession();
  const granted = me?.permissoes;
  const can = useCallback((permission: Permission) => granted?.includes(permission) ?? false, [granted]);
  return { can, me };
}
