/*
 * Apoio dos testes de contas a pagar: dados no formato real da API (dinheiro como string decimal) e
 * renderização pelas rotas reais (`contasPagarRoutes`, com a permissão), sem o layout do app.
 * Só é importado por testes.
 */
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router-dom";
import { AppProviders, createQueryClient } from "@/app/providers";
import { contasPagarRoutes } from "@/app/routes.contaspagar";
import { FORMAS } from "@/features/comandas/fixtures";
import type { Permission } from "@/lib/auth/permissions";
import { json, mockApi } from "@/test/mockFetch";
import { signIn } from "@/test/render";

export const T0 = "2026-10-13T12:00:00+00:00";

export const TODAS_AS_PERMISSOES: Permission[] = [
  "contas_pagar.listar",
  "contas_pagar.criar",
  "contas_pagar.editar",
  "contas_pagar.baixar",
  "contas_pagar.cancelar",
  "financeiro.listar",
  "formas_pagamento.listar",
  "pessoas.listar",
];

export const titulo = (over: Record<string, unknown> = {}) => ({
  id: 8,
  fornecedor: { id: 30, nome: "Distribuidora Sol" },
  categoria: { id: 3, nome: "Insumos" },
  descricao: "Compra de insumos",
  documento: "NF 1234",
  observacao: null,
  cancelado_motivo: null,
  created_at: T0,
  valor_original: "100.00",
  valor_pago: "0.00",
  saldo: "100.00",
  vencimento: "2026-10-20",
  status: "aberto",
  situacao: "a_vencer",
  dias_para_vencer: 7,
  pago_em: null,
  ...over,
});

export const baixa = (over: Record<string, unknown> = {}) => ({
  id: 1,
  valor: "40.00",
  forma_pagamento_id: 1,
  forma: "Dinheiro",
  data_pagamento: "2026-10-12",
  estorno_de_id: null,
  estornada: false,
  observacao: null,
  created_at: T0,
  usuario_nome: "Ana Souza",
  ...over,
});

export const detalhe = (over: Record<string, unknown> = {}) => ({ ...titulo(), baixas: [], ...over });

/** Conta com um pagamento parcial vigente de R$ 40,00. */
export const detalheParcial = (over: Record<string, unknown> = {}) => detalhe({ valor_pago: "40.00", saldo: "60.00", baixas: [baixa()], ...over });

export const resumo = (over: Record<string, unknown> = {}) => ({
  data_referencia: "2026-10-13",
  em_aberto: "1250.00",
  em_aberto_qtd: 7,
  vencido: "300.50",
  vencido_qtd: 2,
  a_vencer_7_dias: "480.00",
  a_vencer_7_dias_qtd: 3,
  pago_no_mes: "900.00",
  pago_no_mes_qtd: 4,
  mes_de: "2026-10-01",
  mes_ate: "2026-10-31",
  ...over,
});

export const categoria = (over: Record<string, unknown> = {}) => ({ id: 3, nome: "Insumos", tipo: "despesa", ativa: true, ...over });
export const CATEGORIAS = [categoria(), categoria({ id: 4, nome: "Aluguel" }), categoria({ id: 5, nome: "Obras", ativa: false })];

export const fornecedor = (over: Record<string, unknown> = {}) => ({
  id: 30,
  nome: "Distribuidora Sol",
  nome_fantasia: null,
  tipo: "J",
  documento: null,
  email: null,
  telefone: "11999990000",
  whatsapp: null,
  observacoes: null,
  ativo: true,
  papeis: ["fornecedor"],
  enderecos: [],
  cliente: null,
  ...over,
});

export const pageOf = <T,>(itens: T[], extra: { total?: number; limite?: number; deslocamento?: number } = {}) => ({
  itens,
  total: extra.total ?? itens.length,
  limite: extra.limite ?? 20,
  deslocamento: extra.deslocamento ?? 0,
});

/** Entra com as permissões dadas e responde as consultas de apoio (resumo, categorias, formas, fornecedores). */
export function setup(permissoes: Permission[] = TODAS_AS_PERMISSOES) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/contas-pagar", json(200, pageOf([titulo()])));
  mock.on("GET /api/v1/contas-pagar/resumo", json(200, resumo()));
  mock.on("GET /api/v1/categorias-financeiras", (call) => json(200, CATEGORIAS.filter((c) => c.tipo === (call.query.get("tipo") ?? c.tipo))));
  mock.on("GET /api/v1/formas-pagamento", json(200, FORMAS));
  mock.on("GET /api/v1/pessoas", json(200, pageOf([fornecedor()])));
  return mock;
}

export function renderContasPagar(path: string) {
  const router = createMemoryRouter([{ element: <Outlet />, children: contasPagarRoutes }], { initialEntries: [path] });
  const client = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const utils = render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, client, user, ...utils };
}

/** Renderiza um diálogo sozinho (sem rotas), com os providers do app. */
export function renderDialog(ui: ReactNode) {
  const client = createQueryClient({ retry: false });
  const user = userEvent.setup();
  const utils = render(<AppProviders client={client}>{ui}</AppProviders>);
  return { client, user, ...utils };
}
