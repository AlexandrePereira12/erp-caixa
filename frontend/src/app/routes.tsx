import { Outlet, type RouteObject } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { cadastrosRoutes } from "./routes.cadastros";
import { contasPagarRoutes } from "./routes.contaspagar";
import { financeiroRoutes } from "./routes.financeiro";
import { relatoriosRoutes } from "./routes.relatorios";
import { pdvRoutes } from "./routes.pdv";
import { AuditDetailPage } from "@/features/audit/AuditDetailPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { ChangePasswordPage } from "@/features/auth/ChangePasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RequireAuth, RequirePermission } from "@/features/auth/guards";
import { RolesPage } from "@/features/roles/RolesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { UsersPage } from "@/features/users/UsersPage";
import { Credits } from "@/routes/Credits";
import { ErrorPage } from "@/routes/ErrorPage";
import { Home } from "@/routes/Home";
import { NotFound } from "@/routes/NotFound";
import { Suspended } from "@/routes/Suspended";

/** Árvore de rotas (também usada nos testes com createMemoryRouter). */
export const routes: RouteObject[] = [
  {
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/acesso-suspenso", element: <Suspended /> },
      { path: "/creditos", element: <Credits /> },
      {
        element: <RequireAuth />,
        children: [
          // Fora do layout: serve à troca obrigatória (sem menu) e à voluntária.
          { path: "/trocar-senha", element: <ChangePasswordPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: "/", element: <Home /> },
              ...pdvRoutes,
              ...cadastrosRoutes,
              ...financeiroRoutes,
              ...contasPagarRoutes,
              ...relatoriosRoutes,
              {
                path: "/usuarios",
                element: (
                  <RequirePermission permission="usuarios.listar">
                    <UsersPage />
                  </RequirePermission>
                ),
              },
              {
                path: "/papeis",
                element: (
                  <RequirePermission permission="papeis.listar">
                    <RolesPage />
                  </RequirePermission>
                ),
              },
              {
                path: "/auditoria",
                element: (
                  <RequirePermission permission="auditoria.listar">
                    <AuditPage />
                  </RequirePermission>
                ),
              },
              {
                path: "/auditoria/:id",
                element: (
                  <RequirePermission permission="auditoria.listar">
                    <AuditDetailPage />
                  </RequirePermission>
                ),
              },
              {
                path: "/configuracoes",
                element: (
                  <RequirePermission permission="configuracoes.ver">
                    <SettingsPage />
                  </RequirePermission>
                ),
              },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
];
