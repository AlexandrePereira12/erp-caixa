import type { ApiError } from "@/lib/api/errors";
import type { MeOut } from "@/lib/api/types";

/**
 * Sessão em memória. O access token vive numa variável de módulo (nunca no Web Storage do
 * navegador); o refresh token é cookie httpOnly e o JS não o vê.
 * Recarregar a página perde o token e o app o restaura via POST /auth/refresh.
 */
export type SessionStatus = "loading" | "anonymous" | "authenticated" | "suspended" | "error";

export interface SessionSnapshot {
  status: SessionStatus;
  /** Null enquanto a troca de senha obrigatória está pendente (não se consulta /auth/me nesse estado). */
  me: MeOut | null;
  mustChangePassword: boolean;
  /** Erro de bootstrap (rede/5xx) para a tela "tentar de novo". */
  error: ApiError | null;
}

const INITIAL: SessionSnapshot = { status: "loading", me: null, mustChangePassword: false, error: null };

let accessToken: string | null = null;
let snapshot: SessionSnapshot = INITIAL;
const listeners = new Set<() => void>();

function update(next: SessionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export const session = {
  getAccessToken: (): string | null => accessToken,
  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  getSnapshot: (): SessionSnapshot => snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setLoading(): void {
    update({ ...snapshot, status: "loading", error: null });
  },
  setAuthenticated(me: MeOut | null, mustChangePassword: boolean): void {
    update({ status: "authenticated", me, mustChangePassword, error: null });
  },
  setMustChangePassword(value: boolean): void {
    if (snapshot.mustChangePassword !== value) update({ ...snapshot, mustChangePassword: value });
  },
  /** Sessão encerrada/inválida: limpa token e dados do usuário. */
  expire(): void {
    accessToken = null;
    update({ status: "anonymous", me: null, mustChangePassword: false, error: null });
  },
  suspend(): void {
    accessToken = null;
    update({ status: "suspended", me: null, mustChangePassword: false, error: null });
  },
  fail(error: ApiError): void {
    update({ ...snapshot, status: "error", error });
  },

  /** Uso em testes. */
  reset(status: SessionStatus = "loading"): void {
    accessToken = null;
    update({ ...INITIAL, status });
  },
};
