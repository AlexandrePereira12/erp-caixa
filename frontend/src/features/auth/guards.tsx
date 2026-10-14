import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { ErrorState, LoadingBlock } from "@/components/States";
import { bootstrapSession } from "@/lib/auth/auth";
import { useSession, usePermissions } from "@/lib/auth/hooks";
import type { Permission } from "@/lib/auth/permissions";
import { AccessDenied } from "@/routes/AccessDenied";

export const CHANGE_PASSWORD_PATH = "/trocar-senha";

/**
 * Exige sessão. Sem sessão -> /login (guardando o destino); conta suspensa -> /acesso-suspenso;
 * troca de senha pendente -> /trocar-senha (única rota autenticada liberada nesse estado).
 */
export function RequireAuth() {
  const { status, mustChangePassword, error, me } = useSession();
  const location = useLocation();

  switch (status) {
    case "loading":
      return (
        <AuthShell title="Carregando">
          <LoadingBlock label="Verificando sua sessão…" />
        </AuthShell>
      );
    case "error":
      return (
        <AuthShell title="Não foi possível verificar a sessão">
          <ErrorState error={error} onRetry={() => void bootstrapSession()} title="Falha de conexão" />
        </AuthShell>
      );
    case "suspended":
      return <Navigate to="/acesso-suspenso" replace />;
    case "anonymous":
      return <Navigate to="/login" replace state={{ from: location }} />;
    case "authenticated":
      if (mustChangePassword) {
        return location.pathname === CHANGE_PASSWORD_PATH ? <Outlet /> : <Navigate to={CHANGE_PASSWORD_PATH} replace />;
      }
      if (!me) return <LoadingBlock />;
      return <Outlet />;
  }
}

/** Exige uma permissão de /auth/me; sem ela, mostra a tela de acesso negado (o backend segue sendo a autoridade). */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(permission)) return <AccessDenied />;
  return children;
}

