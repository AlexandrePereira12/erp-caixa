import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppProviders, createQueryClient } from "@/app/providers";
import { routes } from "@/app/routes";
import type { MeOut } from "@/lib/api/types";
import { session } from "@/lib/auth/session";
import { ME } from "./mockFetch";

/** Sessão autenticada em memória, sem passar pela rede. */
export function signIn(overrides: Partial<MeOut> = {}): MeOut {
  const me = { ...ME, ...overrides };
  session.reset("authenticated");
  session.setAccessToken("tok-teste");
  session.setAuthenticated(me, me.must_change_password);
  return me;
}

/** Renderiza a árvore real de rotas num router em memória, com providers de teste. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const utils = render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, client, user, ...utils };
}

export const usuario = (over: Record<string, unknown> = {}) => ({
  id: 10,
  nome: "Bruno Lima",
  email: "bruno@exemplo.com.br",
  suspenso: false,
  must_change_password: false,
  ultimo_login_em: "2026-10-10T14:30:00+00:00",
  created_at: "2026-01-05T12:00:00+00:00",
  papeis: [{ id: 2, nome: "Gerente" }],
  ...over,
});

export const page = <T,>(itens: T[], extra: { total?: number; limite?: number; deslocamento?: number } = {}) => ({
  itens,
  total: extra.total ?? itens.length,
  limite: extra.limite ?? 20,
  deslocamento: extra.deslocamento ?? 0,
});
