import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BEBIDAS, LANCHES } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { linhaEstoque, relatorioEstoque, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/estoque";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioEstoquePage", () => {
  it("mostra o valor em estoque, as contagens e a posição de cada produto, com o item abaixo do mínimo em destaque", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque", "estoque.listar");
    mock.on(ROUTE, json(200, relatorioEstoque()));
    renderRelatorio("/relatorios/estoque");

    expect(await screen.findByRole("table", { name: "Posição do estoque por produto" })).toBeTruthy();
    expect(kpi("Valor em estoque").getByText("R$ 1.234,56")).toBeTruthy();
    expect(kpi("Produtos").getByText("3")).toBeTruthy();
    expect(kpi("Abaixo do mínimo").getByText("1")).toBeTruthy();
    expect(kpi("Abaixo do mínimo").getByText(/hora de repor/)).toBeTruthy();
    // Sem filtro nenhum, nada além disso vai para a API.
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect([...first.keys()]).toEqual([]);

    const table = screen.getByRole("table", { name: "Posição do estoque por produto" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    // Abaixo do mínimo: selo com texto (a cor sozinha não basta) e saldo em destaque.
    expect(within(rows[1]!).getByText("Abaixo do mínimo")).toBeTruthy();
    expect(within(rows[1]!).getByText("2 UN")).toBeTruthy();
    expect(within(rows[1]!).getByText("12 UN")).toBeTruthy();
    expect(within(rows[1]!).getByText(/Revenda · Bebidas/)).toBeTruthy();
    expect(within(rows[1]!).getByText(/R\$\s3,25/)).toBeTruthy(); // custo médio com mais de 2 casas
    expect(within(rows[1]!).getByText("R$ 6,50")).toBeTruthy();
    expect(within(rows[2]!).getByText("Em dia")).toBeTruthy();
    expect(within(rows[2]!).getByText("20 KG")).toBeTruthy();
    expect(within(rows[3]!).getByText("Sem mínimo definido")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver saldos e movimentos" }).getAttribute("href")).toBe("/estoque");
  });

  it("filtros de tipo, categoria e 'só abaixo do mínimo' chegam à API", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque", "catalogo.listar");
    mock.on(ROUTE, json(200, relatorioEstoque()));
    mock.on("GET /api/v1/categorias", json(200, [BEBIDAS, LANCHES]));
    const { user, router } = renderRelatorio("/relatorios/estoque");
    await screen.findByRole("table", { name: "Posição do estoque por produto" });

    const tipo = screen.getByLabelText("Tipo de produto");
    expect(within(tipo).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todos os tipos", "Revenda", "Preparado", "Insumo", "Embalagem"]);
    await user.selectOptions(tipo, "insumo");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("tipo")).toBe("insumo"));

    await user.selectOptions(await screen.findByLabelText("Categoria"), "2");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("categoria_id")).toBe("2"));

    await user.click(screen.getByRole("checkbox", { name: "Só abaixo do mínimo" }));
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("abaixo_minimo")).toBe("true");
      expect(last.get("tipo")).toBe("insumo");
      expect(last.get("categoria_id")).toBe("2");
    });
    expect(router.state.location.search).toContain("abaixo_minimo=1");

    // Limpar volta ao relatório sem filtros (já no cache, por isso sem nova chamada).
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect((screen.getByLabelText("Tipo de produto") as HTMLSelectElement).value).toBe("");
    expect((screen.getByRole("checkbox", { name: "Só abaixo do mínimo" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });

  it("sem catalogo.listar a categoria não é oferecida (e a lista de categorias não é pedida)", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on(ROUTE, json(200, relatorioEstoque()));
    renderRelatorio("/relatorios/estoque");
    await screen.findByRole("table", { name: "Posição do estoque por produto" });
    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(mock.callsTo("GET /api/v1/categorias")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Ver saldos e movimentos" })).toBeNull();
  });

  it("os filtros da URL valem ao abrir (valores inválidos são ignorados)", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on(ROUTE, json(200, relatorioEstoque()));
    renderRelatorio("/relatorios/estoque?tipo=insumo&categoria=3&abaixo_minimo=1");
    await screen.findByRole("table", { name: "Posição do estoque por produto" });
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("tipo")).toBe("insumo");
    expect(first.get("categoria_id")).toBe("3");
    expect(first.get("abaixo_minimo")).toBe("true");
  });

  it("tipo desconhecido na URL não vira filtro", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on(ROUTE, json(200, relatorioEstoque()));
    renderRelatorio("/relatorios/estoque?tipo=bebida&categoria=abc");
    await screen.findByRole("table", { name: "Posição do estoque por produto" });
    expect([...mock.callsTo(ROUTE)[0]!.query.keys()]).toEqual([]);
  });

  it("nenhum produto nos filtros mostra o estado vazio; nenhum abaixo do mínimo mostra o aviso positivo", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on(ROUTE, json(200, relatorioEstoque({ linhas: [], produtos_qtd: 0, abaixo_minimo_qtd: 0, valor_total_em_estoque: "0.00" })));
    renderRelatorio("/relatorios/estoque?abaixo_minimo=1");
    expect(await screen.findByText("Nenhum produto encontrado")).toBeTruthy();
    expect(kpi("Abaixo do mínimo").getByText("Nenhum produto precisa de reposição")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("produto abaixo do mínimo sem categoria mostra só o tipo", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    mock.on(ROUTE, json(200, relatorioEstoque({ linhas: [linhaEstoque({ categoria: null })], produtos_qtd: 1 })));
    renderRelatorio("/relatorios/estoque");
    const table = await screen.findByRole("table", { name: "Posição do estoque por produto" });
    expect(within(table).getByText("Revenda")).toBeTruthy();
  });

  it("erro da API aparece uma vez, com 'Tentar novamente'", async () => {
    const mock = mockApi();
    signInWith("relatorios.estoque");
    let fail = true;
    mock.on(ROUTE, () => (fail ? apiError(500, "erro_interno", "Falha no servidor.") : json(200, relatorioEstoque())));
    const { user } = renderRelatorio("/relatorios/estoque");
    const alert = await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("table", { name: "Posição do estoque por produto" })).toBeTruthy();
  });

  it("sem relatorios.estoque a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("estoque.listar");
    renderRelatorio("/relatorios/estoque");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
