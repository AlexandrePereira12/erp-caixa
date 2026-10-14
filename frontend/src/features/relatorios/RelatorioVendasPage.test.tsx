import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { relatorioVendas, signInWith, vendasPorForma, vendasPorOperador, vendasPorProduto, vendasVazio } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/vendas";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioVendasPage", () => {
  it("mostra o período efetivo devolvido pela API, os totais, o gráfico por dia e a tabela", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, relatorioVendas()));
    renderRelatorio("/relatorios/vendas");

    expect(await screen.findByText("01/10/2026 a 05/10/2026")).toBeTruthy();
    // Sem datas: nada é enviado (o backend escolhe o mês atual) e o agrupamento padrão é por dia.
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("de")).toBeNull();
    expect(first.get("ate")).toBeNull();
    expect(first.get("agrupar")).toBe("dia");

    expect(kpi("Faturamento").getByText("R$ 1.500,00")).toBeTruthy();
    expect(kpi("Vendas").getByText("40")).toBeTruthy();
    expect(kpi("Ticket médio").getByText("R$ 37,50")).toBeTruthy();
    expect(kpi("Subtotal dos itens").getByText("R$ 1.450,00")).toBeTruthy();
    expect(kpi("Descontos").getByText("R$ 30,00")).toBeTruthy();
    expect(kpi("Acréscimos").getByText("R$ 5,00")).toBeTruthy();
    expect(kpi("Taxa de serviço").getByText("R$ 75,00")).toBeTruthy();
    expect(kpi("Estornos").getByText("R$ 88,00")).toBeTruthy();
    expect(kpi("Estornos").getByText("2 vendas estornadas, fora do faturamento")).toBeTruthy();

    const table = screen.getByRole("table", { name: /Faturamento por dia/ });
    const rows = within(table).getAllByRole("row");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Data", "Vendas", "Total"]);
    expect(rows).toHaveLength(3); // cabeçalho + os 2 dias com venda
    expect(within(rows[2]!).getByText("04/10/2026")).toBeTruthy();
    expect(within(rows[2]!).getByText("R$ 1.100,00")).toBeTruthy();
  });

  it("o gráfico por dia tem uma coluna por dia da janela, com zero nos dias sem venda, e alturas proporcionais", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, relatorioVendas()));
    renderRelatorio("/relatorios/vendas");

    const chart = await screen.findByRole("img", { name: /Gráfico de colunas: faturamento por dia, de 01\/10\/2026 a 05\/10\/2026. Maior dia: 04\/10\/2026, R\$\s1\.100,00/ });
    const columns = Array.from(chart.querySelectorAll<HTMLElement>("[title]"));
    expect(columns.map((c) => c.title.replace(/\s/g, " "))).toEqual([
      "01/10/2026: R$ 0,00",
      "02/10/2026: R$ 400,00",
      "03/10/2026: R$ 0,00",
      "04/10/2026: R$ 1.100,00",
      "05/10/2026: R$ 0,00",
    ]);
    const heights = columns.map((c) => (c.firstElementChild as HTMLElement).style.height);
    expect(heights).toEqual(["0%", "36%", "0%", "100%", "0%"]); // 400 / 1100 = 36%
  });

  it("agrupar por produto, forma de pagamento e operador pede à API e ajusta as colunas", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, (call) => {
      const agrupar = call.query.get("agrupar");
      return json(200, agrupar === "produto" ? vendasPorProduto() : agrupar === "forma_pagamento" ? vendasPorForma() : agrupar === "operador" ? vendasPorOperador() : relatorioVendas());
    });
    const { user, router } = renderRelatorio("/relatorios/vendas");
    await screen.findByRole("table", { name: /Faturamento por dia/ });

    const group = screen.getByRole("group", { name: "Agrupar por" });
    await user.click(within(group).getByRole("radio", { name: "Produto" }));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("agrupar")).toBe("produto"));
    const produto = await screen.findByRole("table", { name: /Total por produto/ });
    expect(within(produto).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Quantidade", "Vendas", "Total"]);
    const row = within(produto).getAllByRole("row")[1]!;
    expect(within(row).getByText("Picanha por kg")).toBeTruthy();
    expect(within(row).getByText("6,5")).toBeTruthy();
    expect(within(row).getByText("R$ 584,35")).toBeTruthy();
    // Barras horizontais, na ordem da API, com resumo para leitor de tela.
    expect(screen.getByRole("img", { name: /Gráfico de barras: total por produto. Maior: Picanha por kg, R\$\s584,35/ })).toBeTruthy();
    expect(router.state.location.search).toContain("agrupar=produto");

    await user.click(within(group).getByRole("radio", { name: "Forma de pagamento" }));
    const forma = await screen.findByRole("table", { name: /Total por forma de pagamento/ });
    // Por forma, a contagem é de pagamentos (uma venda pode ter vários).
    expect(within(forma).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Forma de pagamento", "Pagamentos", "Total"]);
    expect(within(forma).getByText("R$ 700,00")).toBeTruthy();

    await user.click(within(group).getByRole("radio", { name: "Operador" }));
    const operador = await screen.findByRole("table", { name: /Total por operador/ });
    expect(within(operador).getByText("Ana Souza")).toBeTruthy();
    expect(mock.callsTo(ROUTE).at(-1)!.query.get("agrupar")).toBe("operador");

    // Voltar para "Dia" tira o parâmetro da URL (é o padrão).
    await user.click(within(group).getByRole("radio", { name: "Dia" }));
    await screen.findByRole("table", { name: /Faturamento por dia/ });
    expect(router.state.location.search).not.toContain("agrupar");
  });

  it("o gráfico por produto mostra só os 10 maiores e avisa que a tabela traz todos", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    const linhas = Array.from({ length: 12 }, (_, i) => ({ chave: String(i + 1), rotulo: `Produto ${i + 1}`, vendas_qtd: 3, quantidade: "3.000", total: `${120 - i}.00` }));
    mock.on(ROUTE, json(200, relatorioVendas({ agrupado_por: "produto", linhas })));
    renderRelatorio("/relatorios/vendas?agrupar=produto");

    const table = await screen.findByRole("table", { name: /Total por produto/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("Gráfico com os 10 maiores; a tabela traz todos os 12.")).toBeTruthy();
    const chart = screen.getByRole("img", { name: /Gráfico de barras/ });
    expect(chart.children).toHaveLength(10);
  });

  it("filtros de período enviam de/ate como datas puras", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, relatorioVendas()));
    const { user } = renderRelatorio("/relatorios/vendas");
    await screen.findByRole("table", { name: /Faturamento por dia/ });

    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("de")).toBe("2026-10-01");
      expect(last.get("ate")).toBe("2026-10-13");
      expect(last.get("agrupar")).toBe("dia");
    });

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect((screen.getByLabelText("De") as HTMLInputElement).value).toBe(""));
    expect((screen.getByLabelText("Até") as HTMLInputElement).value).toBe("");
  });

  it("data final antes da inicial: mostra o erro no campo e não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, relatorioVendas()));
    const { user } = renderRelatorio("/relatorios/vendas");
    await screen.findByRole("table", { name: /Faturamento por dia/ });

    await user.type(screen.getByLabelText("De"), "2026-10-20");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("de")).toBe("2026-10-20"));
    const before = mock.callsTo(ROUTE).length;

    await user.type(screen.getByLabelText("Até"), "2026-10-10");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(screen.getByLabelText("Até").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Ajuste o período")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(mock.callsTo(ROUTE)).toHaveLength(before);
  });

  it("período de 366 dias ou mais é recusado antes de chamar a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, relatorioVendas()));
    renderRelatorio("/relatorios/vendas?de=2025-01-01&ate=2026-10-14");
    expect(await screen.findByText("O período máximo é de 366 dias.")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(0);
  });

  it("sem vendas no período mostra o estado vazio com o período", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    mock.on(ROUTE, json(200, vendasVazio()));
    renderRelatorio("/relatorios/vendas");
    expect(await screen.findByText("Nenhuma venda neste período")).toBeTruthy();
    expect(screen.getByText("01/10/2026 a 05/10/2026")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("erro da API (período recusado pelo backend) aparece uma vez, com 'Tentar novamente'", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    let fail = true;
    mock.on(ROUTE, () => (fail ? apiError(422, "periodo_invalido", "A data inicial é maior que a final.") : json(200, relatorioVendas())));
    const { user } = renderRelatorio("/relatorios/vendas");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A data inicial é maior que a final.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("01/10/2026 a 05/10/2026")).toBeTruthy();
  });

  it("sem relatorios.vendas a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver", "relatorios.caixa");
    renderRelatorio("/relatorios/vendas");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
