import { ApiError } from "@/lib/api/errors";
import { request } from "@/lib/api/http";
import type { TokenOut } from "@/lib/api/types";
import { session } from "./session";

let inflight: Promise<TokenOut> | null = null;

async function doRefresh(): Promise<TokenOut> {
  try {
    // O cookie pdv_refresh (httpOnly) é enviado pelo navegador; este request nunca passa por retry.
    const token = await request<TokenOut>({ method: "POST", path: "/auth/refresh" });
    session.setAccessToken(token.access_token);
    if (token.must_change_password) session.setMustChangePassword(true);
    return token;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 403 && error.codigo === "conta_suspensa") {
        session.suspend();
      } else if (error.status >= 400 && error.status < 500) {
        // Sem cookie, cookie expirado ou revogado: não há sessão a restaurar.
        session.expire();
      }
      // Rede/5xx: a sessão não é descartada; quem chamou decide como reagir.
    }
    throw error;
  }
}

/**
 * Renovação com single-flight: chamadas simultâneas compartilham a mesma promessa,
 * então N requisições com 401 geram um único POST /auth/refresh.
 */
export function refreshSession(): Promise<TokenOut> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
