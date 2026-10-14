import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { page, usuario } from "@/test/render";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { linhaCaixa, relatorioCaixa, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/caixa";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioCaixaPage", () => {
  it("destaca a diferença total (falta, com texto além da cor) e lista os fechamentos", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa", "caixa.listar");
    mock.on(ROUTE, json(200, relatorioCaixa()));
    renderRelatorio("/relatorios/caixa");

    expect(await screen.findByText("01/10/2026 a 14/10/2026")).toBeTruthy();
    const total = kpi("Diferença total");
    expect(total.getByText(/12,50/)).toBeTruthy();
    expect(total.getByText("Falta")).toBeTruthy();
    expect(total.getByText(/contado ficou abaixo do esperado/)).toBeTruthy();
    expect(kpi("Caixas no período").getByText("2")).toBeTruthy();
    expect(kpi("Caixas no período").getByText("1 fechado, 1 aberto")).toBeTruthy();
    expect(screen.getByText("Caixas abertos ficam fora da diferença")).toBeTruthy();

    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("de")).toBeNull();
    expect(first.get("operador_id")).toBeNull();

    const table = screen.getByRole("table", { name: "Caixas do período, por operador" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole("link", { name: "#5" }).getAttribute("href")).toBe("/caixas/5");
    expect(within(rows[1]!).getByText("Ana Souza")).toBeTruthy();
    expect(within(rows[1]!).getByText("Fechado")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 620,00")).toBeTruthy();
    expect(within(rows[1]!).getByText("14 vendas")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 520,00")).toBeTruthy(); // esperado
    expect(within(rows[1]!).getByText("Inicial R$ 100,00")).toBeTruthy();
    expect(within(rows[1]!).getByText(/Sangrias/).textContent).toContain("200,00");
    expect(within(rows[1]!).getByText(/Reforços/).textContent).toContain("0,00");
    expect(within(rows[1]!).getByText(/Estornos/).textContent).toContain("0,00");
    expect(within(rows[1]!).getByText("Falta")).toBeTruthy();
    // Caixa aberto: sem conferência, nunca "R$ 0,00".
    expect(within(rows[2]!).getByText("Aberto")).toBeTruthy();
    expect(within(rows[2]!).getByText("Em aberto")).toBeTruthy();
    expect(within(rows[2]!).getByText("Ainda aberto")).toBeTruthy();

    const porForma = screen.getByRole("table", { name: "Esperado, contado e diferença por forma de pagamento" });
    const formaRows = within(porForma).getAllByRole("row");
    expect(within(formaRows[1]!).getByText("Dinheiro")).toBeTruthy();
    expect(within(formaRows[1]!).getByText("R$ 407,50")).toBeTruthy();
    expect(within(formaRows[2]!).getByText("Confere")).toBeTruthy();
  });

  it("diferença positiva é 'Sobra' e zero é 'Confere'", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa({ diferenca_total: "5.00", caixas: [linhaCaixa({ diferenca_total: "5.00" })], por_forma: [] })));
    const first = renderRelatorio("/relatorios/caixa");
    expect(await screen.findAllByText("Sobra")).toHaveLength(2); // selo do total e linha do caixa
    expect(kpi("Diferença total").getByText(/contado passou do esperado/)).toBeTruthy();
    first.unmount();

    mock.on(ROUTE, json(200, relatorioCaixa({ diferenca_total: "0.00", caixas: [linhaCaixa({ diferenca_total: "0.00" })], por_forma: [] })));
    renderRelatorio("/relatorios/caixa");
    expect(await screen.findAllByText("Confere")).toHaveLength(2); // selo do total e linha do caixa
    expect(kpi("Diferença total").getByText(/contado bate com o esperado/)).toBeTruthy();
  });

  it("sem caixa fechado não diz 'Confere': não há o que conferir", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa({ diferenca_total: "0.00", caixas_qtd: 1, caixas: [linhaCaixa({ status: "aberto", fechado_em: null, diferenca_total: null })], por_forma: [] })));
    renderRelatorio("/relatorios/caixa");

    expect(await screen.findByText("Nenhum caixa fechado no período: ainda não há o que conferir.")).toBeTruthy();
    expect(kpi("Diferença total").getByText("—")).toBeTruthy();
    expect(screen.queryByText("Confere")).toBeNull();
  });

  it("sem caixa.listar o número do caixa não vira link", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa()));
    renderRelatorio("/relatorios/caixa");
    const table = await screen.findByRole("table", { name: "Caixas do período, por operador" });
    expect(within(table).queryByRole("link")).toBeNull();
    expect(within(table).getByText("#5")).toBeTruthy();
  });

  it("filtro de operador com lista de usuários (usuarios.listar) envia operador_id", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa", "usuarios.listar");
    mock.on(ROUTE, json(200, relatorioCaixa()));
    mock.on("GET /api/v1/usuarios", json(200, page([usuario({ id: 1, nome: "Ana Souza" }), usuario({ id: 2, nome: "Bruno Lima", suspenso: true })], { limite: 200 })));
    const { user } = renderRelatorio("/relatorios/caixa");
    await screen.findByRole("table", { name: "Caixas do período, por operador" });

    expect(mock.callsTo("GET /api/v1/usuarios")[0]!.query.get("limite")).toBe("200");
    const select = screen.getByLabelText("Operador");
    expect(within(select).getByRole("option", { name: "Bruno Lima (suspenso)" })).toBeTruthy();
    await user.selectOptions(select, "2");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("operador_id")).toBe("2"));
    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("de")).toBe("2026-10-01");
      expect(last.get("operador_id")).toBe("2");
    });
  });

  it("sem usuarios.listar o operador é um campo com o número do usuário, só aceita inteiro positivo", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa()));
    const { user } = renderRelatorio("/relatorios/caixa");
    await screen.findByRole("table", { name: "Caixas do período, por operador" });
    expect(mock.callsTo("GET /api/v1/usuarios")).toHaveLength(0);

    const field = screen.getByLabelText("Operador (nº do usuário)");
    expect(field.getAttribute("inputmode")).toBe("numeric");
    expect(field.getAttribute("type")).not.toBe("number");

    await user.type(field, "x");
    expect(await screen.findByText("Use só números, maior que zero.")).toBeTruthy();
    expect(mock.callsTo(ROUTE).every((c) => c.query.get("operador_id") === null)).toBe(true);

    await user.clear(field);
    await user.type(field, "7");
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("operador_id")).toBe("7"));
    expect(screen.queryByText("Use só números, maior que zero.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect((screen.getByLabelText("Operador (nº do usuário)") as HTMLInputElement).value).toBe(""));
  });

  it("período com data final antes da inicial não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa()));
    renderRelatorio("/relatorios/caixa?de=2026-10-20&ate=2026-10-10");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(0);
  });

  it("sem caixas no período mostra o estado vazio", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, json(200, relatorioCaixa({ caixas: [], caixas_qtd: 0, diferenca_total: "0.00", por_forma: [] })));
    renderRelatorio("/relatorios/caixa");
    expect(await screen.findByText("Nenhum caixa neste período")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("erro da API aparece uma vez", async () => {
    const mock = mockApi();
    signInWith("relatorios.caixa");
    mock.on(ROUTE, apiError(500, "erro_interno", "Falha no servidor."));
    renderRelatorio("/relatorios/caixa");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível carregar");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("sem relatorios.caixa a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("caixa.listar", "relatorios.vendas");
    renderRelatorio("/relatorios/caixa");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
