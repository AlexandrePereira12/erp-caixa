import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page } from "@/test/render";
import { comprasPorCategoria, comprasPorFornecedor, comprasPorProduto, comprasSemCusto, comprasVazio, relatorioCompras, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/compras";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);
const FORNECEDOR = { id: 7, nome: "Distribuidora Sul", nome_fantasia: "Sul Atacado" };

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioComprasPage", () => {
  it("mostra o período efetivo, os totais, o gráfico por dia (com zero nos dias sem compra) e a tabela", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras()));
    renderRelatorio("/relatorios/compras");

    expect(await screen.findByText("01/10/2026 a 05/10/2026")).toBeTruthy();
    // Sem datas nada é enviado; o agrupamento padrão é por dia e não há fornecedor.
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("de")).toBeNull();
    expect(first.get("ate")).toBeNull();
    expect(first.get("agrupar")).toBe("dia");
    expect(first.get("fornecedor_id")).toBeNull();

    expect(kpi("Valor total").getByText("R$ 1.500,00")).toBeTruthy();
    expect(kpi("Entradas").getByText("7")).toBeTruthy();
    expect(kpi("Itens").getByText("5")).toBeTruthy();

    const table = screen.getByRole("table", { name: /Compras por dia, de 01\/10\/2026 a 05\/10\/2026/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Data", "Entradas", "Valor"]);
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[2]!).getByText("04/10/2026")).toBeTruthy();
    expect(within(rows[2]!).getByText("R$ 1.200,00")).toBeTruthy();

    const chart = screen.getByRole("img", { name: /Gráfico de colunas: valor das compras por dia, de 01\/10\/2026 a 05\/10\/2026. Maior dia: 04\/10\/2026, R\$\s1\.200,00/ });
    const columns = Array.from(chart.querySelectorAll<HTMLElement>("[title]"));
    expect(columns.map((c) => c.title.replace(/\s/g, " "))).toEqual([
      "01/10/2026: R$ 0,00",
      "02/10/2026: R$ 300,00",
      "03/10/2026: R$ 0,00",
      "04/10/2026: R$ 1.200,00",
      "05/10/2026: R$ 0,00",
    ]);
    expect(columns.map((c) => (c.firstElementChild as HTMLElement).style.height)).toEqual(["0%", "25%", "0%", "100%", "0%"]);
  });

  it("entradas sem custo: aviso com texto e ícone e selo 'N sem custo' nas linhas afetadas", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras()));
    renderRelatorio("/relatorios/compras");

    const alert = (await screen.findByText("2 entradas sem custo informado")).closest('[role="status"]') as HTMLElement;
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("valem R$ 0,00");
    expect(alert.querySelector("svg")).toBeTruthy(); // ícone, não só cor
    const table = screen.getByRole("table", { name: /Compras por dia/ });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[2]!).getByText("2 sem custo")).toBeTruthy();
    expect(within(rows[1]!).queryByText(/sem custo/)).toBeNull();
  });

  it("uma entrada sem custo usa o singular; nenhuma entrada sem custo não mostra o aviso", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras({ resumo: { valor_total: "1500.00", quantidade_entradas: 7, itens: 5, entradas_sem_custo: 1 } })));
    const first = renderRelatorio("/relatorios/compras");
    expect(await screen.findByText("1 entrada sem custo informado")).toBeTruthy();
    first.unmount();

    mock.on(ROUTE, json(200, comprasSemCusto()));
    renderRelatorio("/relatorios/compras");
    await screen.findByRole("table", { name: /Compras por dia/ });
    expect(screen.queryByText(/sem custo/)).toBeNull();
  });

  it("agrupar por fornecedor, produto e categoria pede à API e ajusta as colunas; sem fornecedor/categoria vêm rotuladas", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, (call) => {
      const agrupar = call.query.get("agrupar");
      return json(200, agrupar === "fornecedor" ? comprasPorFornecedor() : agrupar === "produto" ? comprasPorProduto() : agrupar === "categoria" ? comprasPorCategoria() : relatorioCompras());
    });
    const { user, router } = renderRelatorio("/relatorios/compras");
    await screen.findByRole("table", { name: /Compras por dia/ });

    const group = screen.getByRole("group", { name: "Agrupar por" });
    expect(within(group).getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Dia", "Fornecedor", "Produto", "Categoria"]);

    await user.click(within(group).getByRole("radio", { name: "Fornecedor" }));
    const fornecedor = await screen.findByRole("table", { name: /Compras por fornecedor/ });
    expect(within(fornecedor).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Fornecedor", "Entradas", "Valor"]);
    expect(within(fornecedor).getByText("Distribuidora Sul")).toBeTruthy();
    expect(within(fornecedor).getByText("Sem fornecedor")).toBeTruthy();
    expect(screen.getByRole("img", { name: /valor das compras por fornecedor. Maior: Distribuidora Sul, R\$\s1\.000,00/ })).toBeTruthy();
    expect(router.state.location.search).toContain("agrupar=fornecedor");

    await user.click(within(group).getByRole("radio", { name: "Produto" }));
    const produto = await screen.findByRole("table", { name: /Compras por produto/ });
    // A quantidade (com a unidade) só existe por produto.
    expect(within(produto).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Quantidade", "Entradas", "Valor"]);
    const row = within(produto).getAllByRole("row")[1]!;
    expect(within(row).getByText("Farinha de trigo")).toBeTruthy();
    expect(within(row).getByText("20 KG")).toBeTruthy();
    expect(within(row).getByText("R$ 900,00")).toBeTruthy();

    await user.click(within(group).getByRole("radio", { name: "Categoria" }));
    const categoria = await screen.findByRole("table", { name: /Compras por categoria/ });
    expect(within(categoria).getByText("Sem categoria")).toBeTruthy();
    expect(mock.callsTo(ROUTE).at(-1)!.query.get("agrupar")).toBe("categoria");

    await user.click(within(group).getByRole("radio", { name: "Dia" }));
    await screen.findByRole("table", { name: /Compras por dia/ });
    expect(router.state.location.search).not.toContain("agrupar");
  });

  it("o gráfico por produto mostra só os 10 maiores e avisa que a tabela traz todos", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    const linhas = Array.from({ length: 12 }, (_, i) => ({ chave: String(i + 1), rotulo: `Produto ${i + 1}`, entradas_qtd: 1, quantidade: "1.000", unidade: "UN", valor: `${120 - i}.00`, entradas_sem_custo: 0 }));
    mock.on(ROUTE, json(200, relatorioCompras({ agrupado_por: "produto", linhas })));
    renderRelatorio("/relatorios/compras?agrupar=produto");
    const table = await screen.findByRole("table", { name: /Compras por produto/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("Gráfico com os 10 maiores; a tabela traz todos os 12.")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Gráfico de barras/ }).children).toHaveLength(10);
  });

  it("filtros de período enviam de/ate como datas puras; data final antes da inicial não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras()));
    const { user } = renderRelatorio("/relatorios/compras");
    await screen.findByRole("table", { name: /Compras por dia/ });

    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("de")).toBe("2026-10-01");
      expect(last.get("ate")).toBe("2026-10-13");
    });

    // Limpar o "De" é uma consulta válida (só "ate"): espera ela terminar antes de contar as chamadas.
    await user.clear(screen.getByLabelText("De"));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("de")).toBeNull());
    const before = mock.callsTo(ROUTE).length;
    await user.type(screen.getByLabelText("De"), "2026-10-20");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(screen.getByText("Ajuste o período")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(before);
  });

  it("período inválido já na URL não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras()));
    renderRelatorio("/relatorios/compras?de=2026-10-20&ate=2026-10-10");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(0);
  });

  it("filtro de fornecedor: busca pelo nome, envia fornecedor_id e 'Trocar' volta à busca", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras", "pessoas.listar");
    mock.on(ROUTE, json(200, relatorioCompras()));
    mock.on("GET /api/v1/pessoas", json(200, page([FORNECEDOR])));
    const { user, router } = renderRelatorio("/relatorios/compras");
    await screen.findByRole("table", { name: /Compras por dia/ });

    await user.type(screen.getByRole("combobox", { name: "Fornecedor" }), "Dis");
    await user.click(await screen.findByRole("option", { name: /Distribuidora Sul/ }));

    const search = mock.callsTo("GET /api/v1/pessoas").at(-1)!.query;
    expect(search.get("papel")).toBe("fornecedor");
    expect(search.get("q")).toBe("Dis");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("fornecedor_id")).toBe("7"));
    expect(within(screen.getByRole("group", { name: "Fornecedor selecionado" })).getByText("Distribuidora Sul")).toBeTruthy();
    expect(router.state.location.search).toContain("fornecedor=7");

    await user.click(screen.getByRole("button", { name: "Trocar" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("fornecedor"));
    expect(screen.getByRole("combobox", { name: "Fornecedor" })).toBeTruthy();
  });

  it("fornecedor da URL vale ao abrir; 'Limpar filtros' o remove", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras", "pessoas.listar");
    mock.on(ROUTE, json(200, relatorioCompras()));
    const { user, router } = renderRelatorio("/relatorios/compras?fornecedor=7&fnome=Distribuidora%20Sul&agrupar=produto");
    await screen.findByRole("table", { name: /Compras por/ });
    expect(mock.callsTo(ROUTE)[0]!.query.get("fornecedor_id")).toBe("7");
    expect(within(screen.getByRole("group", { name: "Fornecedor selecionado" })).getByText("Distribuidora Sul")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe("?agrupar=produto")); // o agrupamento é de exibição e permanece
  });

  it("sem pessoas.listar o filtro de fornecedor não aparece e a busca não é feita", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, relatorioCompras()));
    renderRelatorio("/relatorios/compras");
    await screen.findByRole("table", { name: /Compras por dia/ });
    expect(screen.queryByRole("combobox", { name: "Fornecedor" })).toBeNull();
    expect(mock.callsTo("GET /api/v1/pessoas")).toHaveLength(0);
  });

  it("sem compras no período mostra o estado vazio com o período", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    mock.on(ROUTE, json(200, comprasVazio()));
    renderRelatorio("/relatorios/compras");
    expect(await screen.findByText("Nenhuma compra neste período")).toBeTruthy();
    expect(screen.getByText("01/10/2026 a 05/10/2026")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("erro da API aparece uma vez, com 'Tentar novamente'", async () => {
    const mock = mockApi();
    signInWith("relatorios.compras");
    let fail = true;
    mock.on(ROUTE, () => (fail ? apiError(500, "erro_interno", "Falha no servidor.") : json(200, relatorioCompras())));
    const { user } = renderRelatorio("/relatorios/compras");
    const alert = await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("01/10/2026 a 05/10/2026")).toBeTruthy();
  });

  it("sem relatorios.compras a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas", "estoque.listar");
    renderRelatorio("/relatorios/compras");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
