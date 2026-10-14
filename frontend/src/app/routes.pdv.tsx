import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import { RequirePermission } from "@/features/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { CaixaDetailPage } from "@/features/caixa/CaixaDetailPage";
import { CaixaPage } from "@/features/caixa/CaixaPage";
import { CaixasPage } from "@/features/caixa/CaixasPage";
import { ComandaPage } from "@/features/comandas/ComandaPage";
import { ComandasPage } from "@/features/comandas/ComandasPage";
import { ContasPage } from "@/features/financeiro/ContasPage";
import { TituloDetailPage } from "@/features/financeiro/TituloDetailPage";
import { FormasPage } from "@/features/formas-pagamento/FormasPage";
import { MesasGerenciarPage } from "@/features/mesas/MesasGerenciarPage";
import { SalaoPage } from "@/features/mesas/SalaoPage";
import { VendaDetailPage } from "@/features/vendas/VendaDetailPage";
import { VendasPage } from "@/features/vendas/VendasPage";

const guarded = (permission: Permission, element: ReactNode): ReactNode => <RequirePermission permission={permission}>{element}</RequirePermission>;

/** Rotas de operação do PDV (mesas, comandas, caixa, vendas, financeiro), cada uma na sua permissão. */
export const pdvRoutes: RouteObject[] = [
  { path: "/mesas", element: guarded("mesas.listar", <SalaoPage />) },
  { path: "/mesas/gerenciar", element: guarded("mesas.gerenciar", <MesasGerenciarPage />) },
  { path: "/comandas", element: guarded("comandas.listar", <ComandasPage />) },
  { path: "/comandas/:id", element: guarded("comandas.listar", <ComandaPage />) },
  { path: "/caixa", element: guarded("caixa.operar", <CaixaPage />) },
  { path: "/caixas", element: guarded("caixa.listar", <CaixasPage />) },
  { path: "/caixas/:id", element: guarded("caixa.listar", <CaixaDetailPage />) },
  { path: "/vendas", element: guarded("vendas.listar", <VendasPage />) },
  { path: "/vendas/:id", element: guarded("vendas.listar", <VendaDetailPage />) },
  { path: "/contas-receber", element: guarded("financeiro.listar", <ContasPage />) },
  { path: "/contas-receber/:id", element: guarded("financeiro.listar", <TituloDetailPage />) },
  { path: "/formas-pagamento", element: guarded("formas_pagamento.listar", <FormasPage />) },
];
