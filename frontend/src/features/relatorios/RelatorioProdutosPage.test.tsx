import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BEBIDAS, LANCHES } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { linhaProdutos, produtosSemCusto, produtosVazio, relatorioProdutos, signInWith } from "./fixtures";
import { formatPercent } from "./format";
import { parseLimite, parseOrdenar } from "./RelatorioProdutosPage";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/produtos";
const TABLE = /Produtos vendidos, de 01\/10\/2026 a 14\/10\/2026/;
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioProdutosPage", () => {
  it("mostra receita, custo, margem (com %), produtos vendidos e a tabela com os percentuais formatados da API", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos");

    expect(await screen.findByText("01/10/2026 a 14/10/2026")).toBeTruthy();
    expect(screen.getByText(/ordenado por receita/)).toBeTruthy();
    // Ordenação e limite vão sempre explícitos (padrões do backend: receita e 100).
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("ordenar")).toBe("receita");
    expect(first.get("limite")).toBe("100");
    expect(first.get("de")).toBeNull();
    expect(first.get("categoria_id")).toBeNull();
    expect(first.get("tipo")).toBeNull();

    expect(kpi("Receita").getByText("R$ 1.000,00")).toBeTruthy();
    expect(kpi("Custo").getByText("R$ 474,00")).toBeTruthy();
    expect(kpi("Margem").getByText("R$ 526,00")).toBeTruthy();
    expect(kpi("Margem").getByText("52,60% da receita")).toBeTruthy();
    expect(kpi("Produtos vendidos").getByText("5")).toBeTruthy();
    expect(kpi("Produtos vendidos").getByText("1 sem custo conhecido")).toBeTruthy();

    const table = screen.getByRole("table", { name: TABLE });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Curva ABC", "Quantidade", "Receita", "Custo", "Margem", "Participação"]);
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(6);
    const picanha = rows[1]!;
    expect(within(picanha).getByText("Picanha por kg")).toBeTruthy();
    expect(within(picanha).getByText(/Revenda · Carnes/)).toBeTruthy();
    expect(within(picanha).getByText("6,5 KG")).toBeTruthy();
    expect(within(picanha).getByText("R$ 500,00")).toBeTruthy();
    expect(within(picanha).getByText("R$ 300,00")).toBeTruthy();
    expect(within(picanha).getByText("R$ 200,00")).toBeTruthy();
    expect(within(picanha).getByText("40,00%")).toBeTruthy(); // margem %
    expect(within(picanha).getByText("50,00%")).toBeTruthy(); // participação
    expect(within(picanha).getByText("50,00% acumulado")).toBeTruthy();
    expect(within(rows[3]!).getByText(/Preparado/)).toBeTruthy(); // categoria ausente: só o tipo

    // Barras da receita dos primeiros, com resumo para leitor de tela.
    expect(screen.getByRole("img", { name: /Gráfico de barras: receita dos primeiros produtos. Maior: Picanha por kg, R\$\s500,00/ })).toBeTruthy();
  });

  it("curva ABC em selos com texto (A, B, C) e legenda com os cortes", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos");

    const table = await screen.findByRole("table", { name: TABLE });
    const rows = within(table).getAllByRole("row");
    expect(rows.slice(1).map((row) => within(row).getByText(/^Curva [ABC]$/).textContent)).toEqual(["Curva A", "Curva A", "Curva B", "Curva C", "Curva C"]);

    const legend = screen.getByRole("list", { name: "Legenda da curva ABC" });
    expect(within(legend).getByText("Curva A").parentElement?.textContent).toContain("até 80% da receita acumulada");
    expect(within(legend).getByText("Curva B").parentElement?.textContent).toContain("até 95%");
    expect(within(legend).getByText("Curva C").parentElement?.textContent).toContain("o restante");
  });

  it("produto sem custo: aviso com texto e ícone e 'sem custo' na linha, para a margem não passar por real", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos");

    const alert = (await screen.findByText("1 produto sem custo conhecido")).closest('[role="status"]') as HTMLElement;
    expect(alert.textContent).toContain("margem aparece cheia");
    expect(alert.querySelector("svg")).toBeTruthy();

    const table = screen.getByRole("table", { name: TABLE });
    const suco = within(table).getAllByRole("row")[4]!;
    expect(within(suco).getByText("Suco de laranja")).toBeTruthy();
    expect(within(suco).getByText("sem custo")).toBeTruthy(); // no lugar do "R$ 0,00" do custo
    expect(within(suco).getByText("sem custo: margem cheia, não é real")).toBeTruthy();
    expect(within(suco).getByText("100,00%")).toBeTruthy();
    // Os demais não carregam o selo.
    expect(within(within(table).getAllByRole("row")[1]!).queryByText(/sem custo/)).toBeNull();
  });

  it("sem produto sem custo conhecido não há aviso", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, produtosSemCusto()));
    renderRelatorio("/relatorios/produtos");
    await screen.findByRole("table", { name: TABLE });
    expect(screen.queryByText(/sem custo conhecido/)).toBeNull();
    expect(kpi("Produtos vendidos").getByText("Com venda válida no período")).toBeTruthy();
  });

  it("margem total negativa fica em destaque (tom de erro) e 'margem_pct_total' nulo diz que não há receita", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos({ resumo: { receita_total: "0.00", custo_total: "10.00", margem_total: "-10.00", margem_pct_total: null, produtos_vendidos: 1, produtos_sem_custo: 0, sem_venda_qtd: 0 }, sem_venda: [] })));
    renderRelatorio("/relatorios/produtos");
    await screen.findByRole("table", { name: TABLE });
    const margem = kpi("Margem");
    expect(margem.getByText(/10,00/)).toBeTruthy();
    expect(margem.getByText("Sem receita no período")).toBeTruthy();
    expect(screen.getByText("Margem", { selector: "dt" }).parentElement!.className).toContain("bg-danger-soft");
  });

  it("filtros e ordenação chegam à API com os parâmetros certos", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos", "catalogo.listar");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    mock.on("GET /api/v1/categorias", json(200, [BEBIDAS, LANCHES]));
    const { user, router } = renderRelatorio("/relatorios/produtos");
    await screen.findByRole("table", { name: TABLE });

    await user.selectOptions(screen.getByLabelText("Tipo de produto"), "preparado");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("tipo")).toBe("preparado"));
    await user.selectOptions(await screen.findByLabelText("Categoria"), "2");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("categoria_id")).toBe("2"));

    const ordenar = screen.getByRole("group", { name: "Ordenar por" });
    expect(within(ordenar).getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Receita", "Quantidade", "Margem"]);
    await user.click(within(ordenar).getByRole("radio", { name: "Margem" }));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("ordenar")).toBe("margem"));

    const limite = screen.getByLabelText("Quantas linhas");
    expect(within(limite).getAllByRole("option").map((o) => o.textContent)).toEqual(["25 produtos", "50 produtos", "100 produtos", "500 produtos"]);
    await user.selectOptions(limite, "25");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("limite")).toBe("25");
      expect(last.get("ordenar")).toBe("margem");
      expect(last.get("tipo")).toBe("preparado");
      expect(last.get("categoria_id")).toBe("2");
    });

    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("de")).toBe("2026-10-01");
      expect(last.get("ate")).toBe("2026-10-13");
    });
    expect(router.state.location.search).toContain("ordenar=margem");

    // Limpar volta ao padrão: sem filtros, receita, 100 linhas.
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect((screen.getByLabelText("Quantas linhas") as HTMLSelectElement).value).toBe("100");
    expect(within(screen.getByRole("group", { name: "Ordenar por" })).getByRole("radio", { name: "Receita" })).toHaveProperty("checked", true);
  });

  it("sem catalogo.listar a categoria não é oferecida", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos");
    await screen.findByRole("table", { name: TABLE });
    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(mock.callsTo("GET /api/v1/categorias")).toHaveLength(0);
  });

  it("valores inválidos na URL caem nos padrões (receita, 100 linhas, sem filtros)", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos?ordenar=lucro&limite=9999&tipo=bebida&categoria=abc");
    await screen.findByRole("table", { name: TABLE });
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("ordenar")).toBe("receita");
    expect(first.get("limite")).toBe("100");
    expect(first.get("tipo")).toBeNull();
    expect(first.get("categoria_id")).toBeNull();
    expect(parseOrdenar("quantidade")).toBe("quantidade");
    expect(parseLimite("500")).toBe(500);
    expect(parseLimite("501")).toBe(100);
  });

  it("limite menor que o total de produtos vendidos avisa que a curva e os totais consideram todos", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos({ linhas: [linhaProdutos()] })));
    renderRelatorio("/relatorios/produtos?limite=25");
    expect(await screen.findByText("Mostrando 1 de 5 produtos vendidos. A curva ABC e os totais consideram todos.")).toBeTruthy();
  });

  it("produtos sem venda: lista com saldo (ou 'sem controle de estoque'); sem nenhum, mensagem positiva", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    const first = renderRelatorio("/relatorios/produtos");

    const table = await screen.findByRole("table", { name: "Produtos sem venda no período" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Saldo em estoque"]);
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Torresmo")).toBeTruthy();
    expect(within(rows[1]!).getByText("12 UN")).toBeTruthy();
    expect(within(rows[2]!).getByText("Almoço executivo")).toBeTruthy();
    expect(within(rows[2]!).getByText("Sem controle de estoque")).toBeTruthy();
    first.unmount();

    mock.on(ROUTE, json(200, relatorioProdutos({ sem_venda: [] })));
    renderRelatorio("/relatorios/produtos");
    expect(await screen.findByText("Todos os produtos à venda tiveram saída no período.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Produtos sem venda no período" })).toBeNull();
  });

  it("nenhum produto vendido: estado vazio na seção de vendidos, e os sem venda continuam listados", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, produtosVazio()));
    renderRelatorio("/relatorios/produtos");
    expect(await screen.findByText("Nenhum produto vendido neste período")).toBeTruthy();
    expect(screen.queryByRole("table", { name: TABLE })).toBeNull();
    expect(screen.getByRole("table", { name: "Produtos sem venda no período" })).toBeTruthy();
    expect(kpi("Margem").getByText("Sem receita no período")).toBeTruthy();
  });

  it("nada vendido e nada à venda nos filtros (ex.: insumo): texto neutro, sem a mensagem positiva", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos({ ...produtosVazio(), resumo: { ...produtosVazio().resumo, sem_venda_qtd: 0 }, sem_venda: [] })));
    renderRelatorio("/relatorios/produtos?tipo=insumo");
    expect(await screen.findByText("Nenhum produto vendido neste período")).toBeTruthy();
    expect(screen.getByText("Nenhum produto à venda com esses filtros.")).toBeTruthy();
    expect(screen.queryByText("Todos os produtos à venda tiveram saída no período.")).toBeNull();
  });

  it("data final antes da inicial não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    mock.on(ROUTE, json(200, relatorioProdutos()));
    renderRelatorio("/relatorios/produtos?de=2026-10-20&ate=2026-10-10");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(0);
  });

  it("erro da API aparece uma vez, com 'Tentar novamente'", async () => {
    const mock = mockApi();
    signInWith("relatorios.produtos");
    let fail = true;
    mock.on(ROUTE, () => (fail ? apiError(500, "erro_interno", "Falha no servidor.") : json(200, relatorioProdutos())));
    const { user } = renderRelatorio("/relatorios/produtos");
    const alert = await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("table", { name: TABLE })).toBeTruthy();
  });

  it("sem relatorios.produtos a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas", "estoque.listar");
    renderRelatorio("/relatorios/produtos");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});

describe("formatPercent", () => {
  it("só formata o percentual que a API mandou (2 casas), sem recalcular", () => {
    expect(formatPercent("62.5")).toBe("62,50%");
    expect(formatPercent("100.00")).toBe("100,00%");
    expect(formatPercent("0.00")).toBe("0,00%");
    expect(formatPercent("-3.456")).toBe("-3,46%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent("abc")).toBe("—");
  });
});
