import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { relatorioPerdas, signInWith } from "./fixtures";
import { renderRelatorio } from "./renderRelatorio";

const ROUTE = "GET /api/v1/relatorios/perdas";
const kpi = (label: string) => within(screen.getByText(label, { selector: "dt" }).parentElement!);

beforeEach(() => {
  session.reset("anonymous");
});

describe("RelatorioPerdasPage", () => {
  it("mostra o custo total, as ocorrências, o gráfico e a tabela por produto", async () => {
    const mock = mockApi();
    signInWith("relatorios.perdas", "estoque.listar");
    mock.on(ROUTE, json(200, relatorioPerdas()));
    renderRelatorio("/relatorios/perdas");

    expect(await screen.findByText("01/10/2026 a 14/10/2026")).toBeTruthy();
    const first = mock.callsTo(ROUTE)[0]!.query;
    expect(first.get("de")).toBeNull();
    expect(first.get("ate")).toBeNull();

    expect(kpi("Custo total das perdas").getByText("R$ 87,40")).toBeTruthy();
    expect(kpi("Ocorrências").getByText("5")).toBeTruthy();
    expect(kpi("Produtos com perda").getByText("2")).toBeTruthy();

    const table = screen.getByRole("table", { name: /Perdas por produto, de 01\/10\/2026 a 14\/10\/2026/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Quantidade perdida", "Ocorrências", "Custo estimado"]);
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("Farinha de trigo")).toBeTruthy();
    expect(within(rows[1]!).getByText("3,5 KG")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 52,50")).toBeTruthy();
    expect(within(rows[2]!).getByText("6 UN")).toBeTruthy();

    expect(screen.getByRole("img", { name: /custo estimado das perdas por produto. Maior: Farinha de trigo, R\$\s52,50/ })).toBeTruthy();
    // Atalho para os movimentos de perda da mesma janela.
    const link = screen.getByRole("link", { name: "Ver movimentos de perda" }).getAttribute("href")!;
    expect(new URLSearchParams(link.split("?")[1]).get("mtipo")).toBe("perda");
    expect(link).toContain("/estoque?aba=movimentos");
    expect(link).toContain("de=2026-10-01");
    expect(link).toContain("ate=2026-10-14");
  });

  it("filtros de período enviam de/ate e a data final antes da inicial não consulta a API", async () => {
    const mock = mockApi();
    signInWith("relatorios.perdas");
    mock.on(ROUTE, json(200, relatorioPerdas()));
    const { user } = renderRelatorio("/relatorios/perdas");
    await screen.findByText("01/10/2026 a 14/10/2026");

    await user.type(screen.getByLabelText("De"), "2026-09-01");
    await user.type(screen.getByLabelText("Até"), "2026-09-30");
    await waitFor(() => {
      const last = mock.callsTo(ROUTE).at(-1)!.query;
      expect(last.get("de")).toBe("2026-09-01");
      expect(last.get("ate")).toBe("2026-09-30");
    });

    await user.clear(screen.getByLabelText("De"));
    await waitFor(() => expect(mock.callsTo(ROUTE).at(-1)!.query.get("de")).toBeNull());
    const before = mock.callsTo(ROUTE).length;
    await user.type(screen.getByLabelText("De"), "2026-10-05");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(mock.callsTo(ROUTE)).toHaveLength(before);
  });

  it("sem perdas no período mostra o estado vazio", async () => {
    const mock = mockApi();
    signInWith("relatorios.perdas");
    mock.on(ROUTE, json(200, relatorioPerdas({ linhas: [], ocorrencias: 0, custo_total: "0.00" })));
    renderRelatorio("/relatorios/perdas");
    expect(await screen.findByText("Nenhuma perda neste período")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sem estoque.listar não oferece o atalho para os movimentos", async () => {
    const mock = mockApi();
    signInWith("relatorios.perdas");
    mock.on(ROUTE, json(200, relatorioPerdas()));
    renderRelatorio("/relatorios/perdas");
    await screen.findByRole("table", { name: /Perdas por produto/ });
    expect(screen.queryByRole("link", { name: "Ver movimentos de perda" })).toBeNull();
  });

  it("erro da API aparece uma vez", async () => {
    const mock = mockApi();
    signInWith("relatorios.perdas");
    mock.on(ROUTE, apiError(500, "erro_interno", "Falha no servidor."));
    renderRelatorio("/relatorios/perdas");
    await screen.findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("sem relatorios.perdas a tela é negada e a API não é chamada", async () => {
    const mock = mockApi();
    signInWith("relatorios.vendas");
    renderRelatorio("/relatorios/perdas");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
