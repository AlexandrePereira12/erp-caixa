import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { RequirePermission } from "@/features/auth/guards";
import { PainelPage } from "@/features/relatorios/PainelPage";
import { RelatorioCaixaPage } from "@/features/relatorios/RelatorioCaixaPage";
import { RelatorioComprasPage } from "@/features/relatorios/RelatorioComprasPage";
import { RelatorioEstoquePage } from "@/features/relatorios/RelatorioEstoquePage";
import { RelatorioPerdasPage } from "@/features/relatorios/RelatorioPerdasPage";
import { RelatorioProdutosPage } from "@/features/relatorios/RelatorioProdutosPage";
import { RelatorioVendasPage } from "@/features/relatorios/RelatorioVendasPage";
import type { Permission } from "@/lib/auth/permissions";

const guarded = (permission: Permission, element: ReactNode): ReactNode => <RequirePermission permission={permission}>{element}</RequirePermission>;

/** Painel e relatórios, cada rota na sua permissão (dashboard.ver, relatorios.*). */
export const relatoriosRoutes: RouteObject[] = [
  { path: "/relatorios", element: guarded("dashboard.ver", <PainelPage />) },
  { path: "/relatorios/vendas", element: guarded("relatorios.vendas", <RelatorioVendasPage />) },
  { path: "/relatorios/caixa", element: guarded("relatorios.caixa", <RelatorioCaixaPage />) },
  { path: "/relatorios/estoque", element: guarded("relatorios.estoque", <RelatorioEstoquePage />) },
  { path: "/relatorios/perdas", element: guarded("relatorios.perdas", <RelatorioPerdasPage />) },
  { path: "/relatorios/compras", element: guarded("relatorios.compras", <RelatorioComprasPage />) },
  { path: "/relatorios/produtos", element: guarded("relatorios.produtos", <RelatorioProdutosPage />) },
];
