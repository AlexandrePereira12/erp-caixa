import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { movimento, saldo, STOCK_PERMISSIONS } from "./fixtures";
import { BEBIDAS, KG, UN } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const SALDOS = [
  saldo(),
  saldo({ produto_id: 8, nome: "Coca-Cola Lata", tipo: "revenda", unidade: "UN", saldo: "2.000", estoque_minimo: "10.000", abaixo_minimo: true, custo_medio: "3.2500", valor_em_estoque: "6.50" }),
];

function setup(permissoes: string[] = STOCK_PERMISSIONS) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/estoque/saldos", json(200, page(SALDOS, { limite: 20 })));
  mock.on("GET /api/v1/estoque/movimentos", json(200, page([movimento(), movimento({ id: 2, tipo: "perda", quantidade: "-1.500", saldo_apos: "23.500", origem_tipo: "manual_ajuste", documento: null, justificativa: "Quebra", custo_unitario: null }), movimento({ id: 3, tipo: "venda", quantidade: "-2.000", saldo_apos: "21.500", origem_tipo: "venda", origem_id: 55, documento: null, justificativa: null, usuario_nome: null })], { limite: 20 })));
  mock.on("GET /api/v1/categorias", json(200, [BEBIDAS]));
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("StockPage: saldos", () => {
  it("mostra as colunas da API e destaca o que está abaixo do mínimo, sem somar nada", async () => {
    const mock = setup();
    renderApp("/estoque");
    const table = await screen.findByRole("table", { name: "Saldos de estoque" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // cabeçalho + 2: nenhuma linha de total
    expect(within(rows[1]!).getByText("20 KG")).toBeTruthy();
    expect(within(rows[1]!).getByText("5 KG")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 80,00")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Abaixo do mínimo")).toBeNull();
    expect(within(rows[2]!).getByText("Abaixo do mínimo")).toBeTruthy();
    expect(within(rows[2]!).getByText("R$ 6,50")).toBeTruthy();
    expect(within(rows[2]!).getByText(/R\$\s3,25/)).toBeTruthy();
    expect(screen.queryByText(/total em estoque/i)).toBeNull();
    expect(mock.callsTo("GET /api/v1/estoque/saldos")[0]!.query.get("limite")).toBe("20");
  });

  it("filtros (busca, tipo, categoria, abaixo do mínimo) vão para a URL e para a API", async () => {
    const mock = setup([...STOCK_PERMISSIONS, "catalogo.listar"]);
    const { user, router } = renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });

    await user.selectOptions(screen.getByLabelText("Tipo"), "insumo");
    await user.selectOptions(await screen.findByLabelText("Categoria"), "1");
    await user.click(screen.getByRole("checkbox", { name: "Abaixo do mínimo" }));
    await user.type(screen.getByLabelText("Buscar"), "farinha");
    await waitFor(
      () => {
        const query = mock.callsTo("GET /api/v1/estoque/saldos").at(-1)!.query;
        expect([query.get("q"), query.get("tipo"), query.get("categoria_id"), query.get("abaixo_minimo")]).toEqual(["farinha", "insumo", "1", "true"]);
      },
      { timeout: 2000 },
    );
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ tipo: "insumo", categoria: "1", abaixo_minimo: "1", q: "farinha" });
  });

  it("o filtro de categoria some sem catalogo.listar", async () => {
    setup(STOCK_PERMISSIONS);
    renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });
    expect(screen.queryByLabelText("Categoria")).toBeNull();
  });

  it("botões de entrada e ajuste seguem as permissões", async () => {
    setup(["estoque.listar"]);
    renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });
    expect(screen.queryByRole("button", { name: "Registrar entrada" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ajuste, perda ou saída" })).toBeNull();
  });
});

describe("StockPage: movimentos", () => {
  it("compra com fornecedor mostra o nome do fornecedor nos detalhes", async () => {
    const mock = setup();
    mock.on("GET /api/v1/estoque/movimentos", json(200, page([movimento({ fornecedor: { id: 21, nome: "Distribuidora Boa Mesa Ltda" } })])));
    renderApp("/estoque?aba=movimentos");
    expect(await screen.findByText("Fornecedor: Distribuidora Boa Mesa Ltda")).toBeTruthy();
  });

  it("troca de aba pelo teclado e mostra tipo, quantidade com sinal, saldo após, usuário, origem e justificativa", async () => {
    const mock = setup();
    const { user, router } = renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });

    const tab = screen.getByRole("tab", { name: "Saldos" });
    tab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Movimentos" }).getAttribute("aria-selected")).toBe("true");
    expect(router.state.location.search).toBe("?aba=movimentos");

    const table = await screen.findByRole("table", { name: "Movimentos de estoque" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("Entrada")).toBeTruthy();
    expect(within(rows[1]!).getByText("+5 KG")).toBeTruthy();
    expect(within(rows[1]!).getByText("25 KG")).toBeTruthy();
    expect(within(rows[1]!).getByText("Ana Souza")).toBeTruthy();
    expect(within(rows[1]!).getByText("Entrada manual")).toBeTruthy();
    expect(within(rows[1]!).getByText("Compra semanal")).toBeTruthy();
    expect(within(rows[1]!).getByText("Doc.: NF 123")).toBeTruthy();
    expect(within(rows[2]!).getByText("-1,5 KG")).toBeTruthy();
    expect(within(rows[2]!).getByText("Perda")).toBeTruthy();
    expect(within(rows[3]!).getByText("Venda #55")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/estoque/movimentos")[0]!.query.get("limite")).toBe("20");
  });

  it("período vira ISO no horário local (o `ate` é exclusivo no backend: meia-noite do dia seguinte)", async () => {
    const mock = setup();
    const { user, router } = renderApp("/estoque?aba=movimentos");
    await screen.findByRole("table", { name: "Movimentos de estoque" });

    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await user.selectOptions(screen.getByLabelText("Tipo de movimento"), "perda");
    await waitFor(() => {
      const query = mock.callsTo("GET /api/v1/estoque/movimentos").at(-1)!.query;
      expect(query.get("de")).toBe(new Date(2026, 9, 1, 0, 0).toISOString());
      expect(query.get("ate")).toBe(new Date(2026, 9, 14, 0, 0).toISOString());
      expect(query.get("tipo")).toBe("perda");
    });
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toMatchObject({ aba: "movimentos", de: "2026-10-01", ate: "2026-10-13", mtipo: "perda" });
  });

  it("filtra por produto escolhido na busca e lembra o nome na URL", async () => {
    const mock = setup();
    mock.on("GET /api/v1/estoque/saldos", json(200, page(SALDOS)));
    const { user, router } = renderApp("/estoque?aba=movimentos");
    await screen.findByRole("table", { name: "Movimentos de estoque" });

    await user.click(screen.getByRole("combobox", { name: "Produto" }));
    await user.click(await screen.findByRole("option", { name: /Farinha de Trigo/ }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/estoque/movimentos").at(-1)!.query.get("produto_id")).toBe("7"));
    expect(router.state.location.search).toContain("produto=7");
    expect(within(screen.getByRole("search", { name: "Filtrar movimentos" })).getByText("Farinha de Trigo")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remover filtro de produto" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("produto="));
  });
});
