import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { dashboard, dashboardVazio, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/dashboard";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("PainelPage", () => {
  it("mostra os indicadores, o ranking, as formas de pagamento, o caixa aberto e o estoque baixo da API", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver", "estoque.listar", "caixa.listar", "financeiro.listar");
    mock.on(ROUTE, json(200, dashboard()));
    renderRelatorio("/relatorios");

    expect(await screen.findByRole("heading", { name: "Hoje, 14/10/2026" })).toBeTruthy();
    expect(kpi("Faturamento").getByText("R$ 1.234,50")).toBeTruthy();
    expect(kpi("Vendas").getByText("31")).toBeTruthy();
    expect(kpi("Ticket médio").getByText("R$ 39,82")).toBeTruthy();
    // O período vai explícito (o padrão do backend seria o mês) e sem referência.
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("periodo")).toBe("dia");
    expect(first.get("referencia")).toBeNull();

    const ranking = screen.getByRole("table", { name: "Produtos mais vendidos no período" });
    const rows = within(ranking).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Chopp 300ml")).toBeTruthy();
    expect(within(rows[1]!).getByText("42")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 378,00")).toBeTruthy();
    expect(within(rows[2]!).getByText("6,5")).toBeTruthy();

    const formas = screen.getByRole("table", { name: "Total por forma de pagamento no período" });
    expect(within(formas).getByText("R$ 700,00")).toBeTruthy();
    expect(within(formas).getByText("18")).toBeTruthy();

    // Gráficos são imagens com resumo; os números estão nas tabelas.
    expect(screen.getByRole("img", { name: /Mais vendido: Chopp 300ml, 42/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Maior: Pix, R\$\s700,00/ })).toBeTruthy();

    // Situação de agora.
    expect(kpi("A receber (fiado)").getByText("R$ 540,00")).toBeTruthy();
    expect(kpi("A receber (fiado)").getByText(/3 títulos em aberto/)).toBeTruthy();
    expect(kpi("A receber (fiado)").getByRole("link", { name: "Ver contas" }).getAttribute("href")).toBe("/contas-receber");
    expect(screen.getByText("Esperado")).toBeTruthy();
    expect(screen.getByText("R$ 330,00")).toBeTruthy(); // 250,00 + 80,00 do caixa #5
    expect(screen.getByRole("link", { name: "Caixa #5" }).getAttribute("href")).toBe("/caixas/5");
    expect(screen.getByText("12 produtos no mínimo ou abaixo")).toBeTruthy();
    expect(screen.getByText("Coca-Cola lata")).toBeTruthy();
    expect(screen.getByText(/Mostrando os 2 mais críticos/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver no estoque" }).getAttribute("href")).toBe("/estoque?abaixo_minimo=1");
  });

  it("trocar o período e o dia de referência consulta a API com os parâmetros certos", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, (call) => json(200, dashboard({ periodo_detalhe: call.query.get("periodo") })));
    const { user, router } = renderRelatorio("/relatorios");

    expect(await screen.findByRole("heading", { name: "Hoje, 14/10/2026" })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Período" });
    expect(within(group).getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Hoje", "Semana", "Mês"]);

    await user.click(within(group).getByRole("radio", { name: "Semana" }));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("periodo")).toBe("semana"));
    expect(await screen.findByRole("heading", { name: "Semana de 12/10/2026 a 18/10/2026" })).toBeTruthy();
    expect(router.state.location.search).toContain("periodo=semana");

    await user.click(within(group).getByRole("radio", { name: "Mês" }));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("periodo")).toBe("mes"));
    expect(await screen.findByRole("heading", { name: "Mês de 01/10/2026 a 31/10/2026" })).toBeTruthy();

    await user.type(screen.getByLabelText("Dia de referência"), "2026-10-09");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("referencia")).toBe("2026-10-09");
      expect(last.get("periodo")).toBe("mes");
    });
    // Com um dia escolhido, "Hoje" deixa de ser verdade.
    expect(within(group).getByRole("radio", { name: "Dia" })).toBeTruthy();

    // Limpar tira só o dia de referência; o período escolhido permanece (a consulta do mês de hoje
    // já está no cache, por isso não há nova chamada).
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe("?periodo=mes"));
    expect((screen.getByLabelText("Dia de referência") as HTMLInputElement).value).toBe("");
    expect(within(group).getByRole("radio", { name: "Hoje" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });

  it("o período e o dia da URL valem ao abrir a tela", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, json(200, dashboard({ periodo_detalhe: "mes" })));
    renderRelatorio("/relatorios?periodo=mes&referencia=2026-10-09");
    await screen.findByRole("heading", { name: "Mês de 01/10/2026 a 31/10/2026" });
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("periodo")).toBe("mes");
    expect(first.get("referencia")).toBe("2026-10-09");
  });

  it("período desconhecido e data que não existe na URL são ignorados", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, json(200, dashboard()));
    renderRelatorio("/relatorios?periodo=ano&referencia=2026-02-30");
    await screen.findByRole("heading", { name: "Hoje, 14/10/2026" });
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("periodo")).toBe("dia");
    expect(first.get("referencia")).toBeNull();
  });

  it("sem vendas, caixa aberto nem estoque baixo mostra mensagens claras em vez de listas vazias", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, json(200, dashboardVazio()));
    renderRelatorio("/relatorios");

    expect(await screen.findAllByText("Nenhuma venda neste período.")).toHaveLength(2);
    expect(kpi("Faturamento").getByText("R$ 0,00")).toBeTruthy();
    expect(screen.getByText("Nenhum caixa aberto agora.")).toBeTruthy();
    expect(screen.getByText("Estoque em dia")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ver no estoque" })).toBeNull();
  });

  it("sem estoque.listar o alerta de estoque baixo não oferece o link", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, json(200, dashboard({ estoque_baixo_qtd: 1, estoque_baixo: [dashboard().estoque_baixo[0]] })));
    renderRelatorio("/relatorios");
    expect(await screen.findByText("1 produto no mínimo ou abaixo")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ver no estoque" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Caixa #5" })).toBeNull(); // sem caixa.listar: só o texto
    expect(screen.getByText("Caixa #5")).toBeTruthy();
  });

  it("erro da API mostra uma única mensagem e 'Tentar novamente' busca de novo", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    let fail = true;
    mock.on(ROUTE, () => (fail ? apiError(500, "erro_interno", "Falha no servidor.") : json(200, dashboard())));
    const { user } = renderRelatorio("/relatorios");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível carregar");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { name: "Hoje, 14/10/2026" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("'Atualizar' consulta de novo", async () => {
    const mock = mockApi();
    signInWith("dashboard.ver");
    mock.on(ROUTE, json(200, dashboard()));
    const { user } = renderRelatorio("/relatorios");
    await screen.findByRole("heading", { name: "Hoje, 14/10/2026" });
    const before = mock.callsTo(ROUTE).length;
    await user.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(mock.callsTo(ROUTE).length).toBe(before + 1));
  });

  it("sem dashboard.ver a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    renderRelatorio("/relatorios");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
