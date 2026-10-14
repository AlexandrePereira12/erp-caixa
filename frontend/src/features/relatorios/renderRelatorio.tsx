/*
 * Renderiza uma tela de relatório pelas rotas reais (`relatoriosRoutes`, com a permissão) num router
 * em memória, sem o layout do app. Só é importado por testes.
 */
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppProviders, createQueryClient } from "@/app/providers";
import { relatoriosRoutes } from "@/app/routes.relatorios";

export function renderRelatorio(path: string) {
  const router = createMemoryRouter([{ element: <Outlet />, children: relatoriosRoutes }], { initialEntries: [path] });
  const client = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const utils = render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, client, user, ...utils };
}
