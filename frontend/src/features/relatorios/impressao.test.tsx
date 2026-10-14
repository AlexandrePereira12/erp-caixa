import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { dashboard, relatorioCaixa, relatorioCompras, relatorioEstoque, relatorioPerdas, relatorioProdutos, relatorioVendas, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

beforeEach(() => {
  session.reset("anonymous");
});

const CASES = [
  { path: "/relatorios", permission: "dashboard.ver", route: "GET /api/v1/dashboard", body: () => dashboard(), title: "Painel", ready: "Hoje, 14/10/2026", inSheet: /Produtos mais vendidos/ },
  { path: "/relatorios/vendas", permission: "relatorios.vendas", route: "GET /api/v1/relatorios/vendas", body: () => relatorioVendas(), title: "Relatório de vendas", ready: "01/10/2026 a 05/10/2026", inSheet: /Faturamento por dia/ },
  { path: "/relatorios/caixa", permission: "relatorios.caixa", route: "GET /api/v1/relatorios/caixa", body: () => relatorioCaixa(), title: "Relatório de caixa", ready: "01/10/2026 a 14/10/2026", inSheet: /Caixas do período/ },
  { path: "/relatorios/estoque?abaixo_minimo=1", permission: "relatorios.estoque", route: "GET /api/v1/relatorios/estoque", body: () => relatorioEstoque(), title: "Relatório de estoque", ready: "Posição do estoque", inSheet: /Posição do estoque por produto/ },
  { path: "/relatorios/perdas", permission: "relatorios.perdas", route: "GET /api/v1/relatorios/perdas", body: () => relatorioPerdas(), title: "Relatório de perdas", ready: "01/10/2026 a 14/10/2026", inSheet: /Perdas por produto/ },
  { path: "/relatorios/compras", permission: "relatorios.compras", route: "GET /api/v1/relatorios/compras", body: () => relatorioCompras(), title: "Relatório de compras", ready: "01/10/2026 a 05/10/2026", inSheet: /Compras por dia/ },
  { path: "/relatorios/produtos", permission: "relatorios.produtos", route: "GET /api/v1/relatorios/produtos", body: () => relatorioProdutos(), title: "Relatório de produtos", ready: "01/10/2026 a 14/10/2026", inSheet: /Produtos vendidos/ },
] as const;

describe("botão Imprimir", () => {
  it.each(CASES)("$title: monta a folha com o resultado, chama window.print e some ao terminar", async ({ path, permission, route, body, title, ready, inSheet }) => {
    const mock = mockApi();
    signInWith(permission);
    mock.on(route, json(200, body()));
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderRelatorio(path);
    await screen.findAllByText(ready);

    await user.click(await screen.findByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const sheet = screen.getByTestId("print-root");
    expect(within(sheet).getByRole("heading", { level: 1, name: title, hidden: true })).toBeTruthy();
    expect(within(sheet).getAllByRole("table", { hidden: true }).some((table) => inSheet.test(table.querySelector("caption")?.textContent ?? ""))).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await waitFor(() => expect(screen.queryByTestId("print-root")).toBeNull());
  });

  it("estoque: a folha diz quais filtros estavam ligados", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on("GET /api/v1/relatorios/estoque", json(200, relatorioEstoque()));
    vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderRelatorio("/relatorios/estoque?tipo=insumo&abaixo_minimo=1");
    await user.click(await screen.findByRole("button", { name: "Imprimir" }));
    expect(within(await screen.findByTestId("print-root")).getByText("Tipo: Insumo · Só abaixo do mínimo")).toBeTruthy();
  });

  it("produtos: a folha diz a ordenação e o limite escolhidos", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on("GET /api/v1/relatorios/produtos", json(200, relatorioProdutos()));
    vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderRelatorio("/relatorios/produtos?tipo=revenda&ordenar=margem&limite=50");
    await user.click(await screen.findByRole("button", { name: "Imprimir" }));
    expect(within(await screen.findByTestId("print-root")).getByText("Tipo: Revenda · Ordenado por margem · Até 50 produtos")).toBeTruthy();
  });

  it("sem resultado (erro ou período inválido) não há o que imprimir", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on("GET /api/v1/relatorios/vendas", apiError(500, "erro_interno", "Falha no servidor."));
    const first = renderRelatorio("/relatorios/vendas");
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Imprimir" })).toBeNull();
    first.unmount();

    renderRelatorio("/relatorios/vendas?de=2026-10-20&ate=2026-10-10");
    await screen.findByText("Ajuste o período");
    expect(screen.queryByRole("button", { name: "Imprimir" })).toBeNull();
  });
});
