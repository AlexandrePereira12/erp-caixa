import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessError, caixa, pageOf, signInAs, venda } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const RESUMO = { id: 31, comanda_id: 12, caixa_id: 5, cliente: { id: 20, nome: "Carlos Lima" }, total: "19.80", created_at: "2026-10-13T12:00:00+00:00", estornada: false };
const ESTORNO = { motivo: "pedido duplicado", em: "2026-10-13T13:00:00+00:00", por: "Ana Souza" };

beforeEach(() => {
  session.reset("anonymous");
});

describe("VendasPage", () => {
  it("lista vendas com situação, total da API e filtros enviados à API", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas", json(200, pageOf([RESUMO, { ...RESUMO, id: 30, total: "40.00", estornada: true }])));
    const { user } = renderApp("/vendas");

    expect(await screen.findByRole("link", { name: "#31" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#31" }).getAttribute("href")).toBe("/vendas/31");
    expect(screen.getByText("Válida")).toBeTruthy();
    expect(screen.getByText("Estornada")).toBeTruthy();
    expect(screen.getByText("R$ 19,80")).toBeTruthy();
    // Padrão: todas, sem filtro de período.
    const first = mock.callsTo("GET /api/v1/vendas")[0]!.query;
    expect(first.get("status")).toBe("todas");
    expect(first.get("de")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Situação"), "estornadas");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/vendas").some((c) => c.query.get("status") === "estornadas")).toBe(true));

    // Período: "de" no início do dia e "até" exclusivo no início do dia seguinte (horário local).
    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await waitFor(() => {
      const last = mock.callsTo("GET /api/v1/vendas").at(-1)!.query;
      expect(last.get("de")).toBe(new Date("2026-10-01T00:00").toISOString());
      expect(last.get("ate")).toBe(new Date("2026-10-14T00:00").toISOString());
    });
  });

  it("filtro por caixa e paginação na URL", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas", (call) => json(200, pageOf([RESUMO], { total: 45, deslocamento: call.query.get("deslocamento") === "20" ? 20 : 0 })));
    const { user, router } = renderApp("/vendas");

    await screen.findByRole("link", { name: "#31" });
    await user.type(screen.getByLabelText("Caixa nº"), "5");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/vendas").some((c) => c.query.get("caixa_id") === "5")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(router.state.location.search).toContain("pagina=2"));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/vendas").some((c) => c.query.get("deslocamento") === "20")).toBe(true));
  });

  it("sem vendas.listar a tela é negada", async () => {
    mockApi();
    signInAs("atendente");
    renderApp("/vendas");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
  });
});

describe("VendaDetailPage", () => {
  it("mostra itens, pagamentos com troco, totais e operador vindos da API", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas/31", json(200, venda()));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/vendas/31");

    expect(await screen.findByRole("heading", { name: "Venda #31" })).toBeTruthy();
    expect(screen.getByText(/operador Ana Souza/)).toBeTruthy();
    expect(screen.getByText(/Chopp 300ml/)).toBeTruthy();
    expect(screen.getByText(/Recebido R\$\s20,00 · troco R\$\s0,20/)).toBeTruthy();
    const totais = screen.getByText("Totais").closest("div")!;
    expect(within(totais).getByText("R$ 19,80", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#12" }).getAttribute("href")).toBe("/comandas/12");
    expect(screen.getByRole("link", { name: "#5" }).getAttribute("href")).toBe("/caixas/5");
  });

  it("estornar exige motivo (3+ caracteres), explica o caixa e o estoque e envia o motivo", async () => {
    const mock = mockApi();
    signInAs("gerente");
    let estornada = false;
    mock.on("GET /api/v1/vendas/31", () => json(200, venda(estornada ? { estorno: ESTORNO } : {})));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    mock.on("POST /api/v1/vendas/31/estornar", () => {
      estornada = true;
      return json(200, venda({ estorno: ESTORNO }));
    });
    const { user } = renderApp("/vendas/31");

    await user.click(await screen.findByRole("button", { name: "Estornar venda" }));
    const dialog = await screen.findByRole("dialog", { name: "Estornar venda #31" });
    expect(within(dialog).getByText(/seu caixa aberto/)).toBeTruthy();
    expect(within(dialog).getByText(/estoque dos itens é devolvido/)).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/Motivo do estorno/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Estornar venda" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/vendas/31/estornar")).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Motivo do estorno/));
    await user.type(within(dialog).getByLabelText(/Motivo do estorno/), "pedido duplicado");
    await user.click(within(dialog).getByRole("button", { name: "Estornar venda" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/vendas/31/estornar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/vendas/31/estornar")[0]!.body).toEqual({ motivo: "pedido duplicado" });
    expect(await screen.findByText("Venda estornada")).toBeTruthy();
    expect(screen.getByText(/Motivo: pedido duplicado/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Estornar venda" })).toBeNull();
  });

  it("estorno sem caixa aberto: avisa antes e, se o backend recusar (caixa_fechado), aponta para /caixa", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas/31", json(200, venda()));
    mock.on("GET /api/v1/caixas/atual", json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } }));
    mock.on("POST /api/v1/vendas/31/estornar", businessError(409, "caixa_fechado", "Abra o seu caixa: o estorno devolve valores por ele."));
    const { user } = renderApp("/vendas/31");

    await user.click(await screen.findByRole("button", { name: "Estornar venda" }));
    const dialog = await screen.findByRole("dialog", { name: "Estornar venda #31" });
    expect(await within(dialog).findByText(/Você não tem caixa aberto/)).toBeTruthy();
    // O front não bloqueia (venda só em fiado estorna sem caixa): quem decide é o backend.
    await user.type(within(dialog).getByLabelText(/Motivo do estorno/), "erro de digitação");
    await user.click(within(dialog).getByRole("button", { name: "Estornar venda" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Abra o seu caixa: o estorno devolve valores por ele.");
    expect(within(alert).getByRole("link", { name: "Abra o seu caixa" }).getAttribute("href")).toBe("/caixa");
  });

  it("venda_ja_estornada: mostra a mensagem e recarrega a venda", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas/31", json(200, venda()));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    mock.on("POST /api/v1/vendas/31/estornar", businessError(409, "venda_ja_estornada", "A venda #31 já foi estornada."));
    const { user } = renderApp("/vendas/31");
    await user.click(await screen.findByRole("button", { name: "Estornar venda" }));
    const dialog = await screen.findByRole("dialog", { name: "Estornar venda #31" });
    const before = mock.callsTo("GET /api/v1/vendas/31").length;
    await user.type(within(dialog).getByLabelText(/Motivo do estorno/), "duplicada");
    await user.click(within(dialog).getByRole("button", { name: "Estornar venda" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("A venda #31 já foi estornada.");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/vendas/31").length).toBeGreaterThan(before));
  });

  it("venda estornada mostra o estorno e não oferece estornar de novo; sem vendas.estornar não há botão", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/vendas/31", json(200, venda({ estorno: ESTORNO })));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/vendas/31");
    expect(await screen.findByText("Venda estornada")).toBeTruthy();
    expect(screen.getByText(/por Ana Souza/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Estornar venda" })).toBeNull();
  });

  it("frente de loja (sem vendas.estornar) não vê o botão de estorno", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/vendas/31", json(200, venda()));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/vendas/31");
    await screen.findByRole("heading", { name: "Venda #31" });
    expect(screen.queryByRole("button", { name: "Estornar venda" })).toBeNull();
  });

  it("imprimir recibo chama window.print com o recibo da venda", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/vendas/31", json(200, venda()));
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderApp("/vendas/31");
    await user.click(await screen.findByRole("button", { name: "Imprimir recibo" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(within(screen.getByTestId("print-root")).getByText("Recibo de venda #31")).toBeTruthy();
  });
});
