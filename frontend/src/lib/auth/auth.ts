import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { request } from "@/lib/api/http";
import type { TokenOut } from "@/lib/api/types";
import { refreshSession } from "./refresh";
import { session } from "./session";

/**
 * Com o token em mãos, completa a sessão. Se a troca de senha for obrigatória não se consulta
 * /auth/me: o backend pode bloquear (senha_expirada) e o flag já vem no TokenOut.
 */
async function establishSession(token: TokenOut): Promise<void> {
  session.setAccessToken(token.access_token);
  if (token.must_change_password) {
    session.setAuthenticated(null, true);
    return;
  }
  try {
    const me = await api.get("/auth/me");
    session.setAuthenticated(me, me.must_change_password);
  } catch (error) {
    if (error instanceof ApiError && error.codigo === "senha_expirada") {
      session.setAuthenticated(null, true);
      return;
    }
    throw error;
  }
}

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "erro_desconhecido", "Não foi possível iniciar a sessão.");
}

export async function login(email: string, senha: string): Promise<void> {
  try {
    const token = await request<TokenOut>({ method: "POST", path: "/auth/login", body: { email, senha } });
    await establishSession(token);
  } catch (error) {
    if (error instanceof ApiError && error.codigo === "conta_suspensa") session.suspend();
    else if (session.getSnapshot().status !== "suspended") session.expire();
    throw error;
  }
}

export async function logout(): Promise<void> {
  try {
    await request<void>({ method: "POST", path: "/auth/logout" });
  } catch {
    // Melhor esforço: a sessão local é encerrada de qualquer forma.
  } finally {
    session.expire();
  }
}

export async function changePassword(input: { senha_atual: string; nova_senha: string }): Promise<void> {
  const token = await api.post("/auth/change-password", { body: input });
  await establishSession(token);
}

let bootstrapping: Promise<void> | null = null;

/** Restaura a sessão ao carregar o app: refresh via cookie + /auth/me. */
export function bootstrapSession(): Promise<void> {
  if (!bootstrapping) {
    bootstrapping = (async () => {
      session.setLoading();
      try {
        await establishSession(await refreshSession());
      } catch (error) {
        const apiError = toApiError(error);
        if (apiError.status >= 400 && apiError.status < 500) {
          // 4xx: sem sessão a restaurar (ou conta suspensa, já tratada). Rede/5xx cai em "error".
          if (session.getSnapshot().status === "loading") session.expire();
        } else {
          session.fail(apiError);
        }
      }
    })().finally(() => {
      bootstrapping = null;
    });
  }
  return bootstrapping;
}
