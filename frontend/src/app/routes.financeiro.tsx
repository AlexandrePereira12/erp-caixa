import type { RouteObject } from "react-router-dom";
import { RequirePermission } from "@/features/auth/guards";
import { CategoriasPage } from "@/features/financeiro/CategoriasPage";

/** Rotas do módulo Financeiro que não são de contas a receber/pagar. */
export const financeiroRoutes: RouteObject[] = [
  {
    path: "/financeiro/categorias",
    element: (
      <RequirePermission permission="financeiro.categorias">
        <CategoriasPage />
      </RequirePermission>
    ),
  },
];
