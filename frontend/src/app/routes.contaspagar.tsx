import type { RouteObject } from "react-router-dom";
import { RequirePermission } from "@/features/auth/guards";
import { ContaPagarDetailPage } from "@/features/contas-pagar/ContaPagarDetailPage";
import { ContasPagarPage } from "@/features/contas-pagar/ContasPagarPage";

/** Contas a pagar: lista com resumo e detalhe (pagar, editar, cancelar, estornar), ambos sob contas_pagar.listar. */
export const contasPagarRoutes: RouteObject[] = [
  {
    path: "/contas-pagar",
    element: (
      <RequirePermission permission="contas_pagar.listar">
        <ContasPagarPage />
      </RequirePermission>
    ),
  },
  {
    path: "/contas-pagar/:id",
    element: (
      <RequirePermission permission="contas_pagar.listar">
        <ContaPagarDetailPage />
      </RequirePermission>
    ),
  },
];
