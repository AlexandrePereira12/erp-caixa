import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { businessError, caixa, FORMAS, pageOf, pessoa, signInAs, titulo } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const SALDO = { pessoa_id: 20, saldo_aberto: "40.00", titulos_abertos: 1, aceita_fiado: true, limite_fiado: "200.00", limite_disponivel: "160.00" };
const NOT_FOUND = json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } });

function setupDetail(perfil: Parameters<typeof signInAs>[0] = "frente", t = titulo()) {
  const mock = mockApi();
  signInAs(perfil);
  mock.on("GET /api/v1/contas-receber/8", () => json(200, t));
  mock.on("GET /api/v1/pessoas/20/saldo-aberto", json(200, SALDO));
  mock.on("GET /api/v1/formas-pagamento", json(200, FORMAS));
  mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("ContasPage", () => {
  it("lista as contas abertas por padrão, com saldo e situação da API", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/contas-receber", json(200, pageOf([titulo(), titulo({ id: 9, status: "pago", saldo: "0.00", valor_pago: "50.00", pessoa: { id: 21, nome: "Maria" } })])));
    const { user } = renderApp("/contas-receber");

    expect(await screen.findByRole("link", { name: "#8" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#8" }).getAttribute("href")).toBe("/contas-receber/8");
    expect(screen.getByText("Carlos Lima")).toBeTruthy();
    expect(screen.getByText("R$ 40,00")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/contas-receber")[0]!.query.get("status")).toBe("aberto");

    await user.selectOptions(screen.getByLabelText("Situação"), "todos");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/contas-receber").at(-1)!.query.get("status")).toBeNull());
    await user.selectOptions(screen.getByLabelText("Situação"), "cancelado");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/contas-receber").at(-1)!.query.get("status")).toBe("cancelado"));
  });

  it("filtra por cliente com a busca de pessoas", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/contas-receber", json(200, pageOf([titulo()])));
    mock.on("GET /api/v1/pessoas", json(200, pageOf([pessoa()])));
    const { user } = renderApp("/contas-receber");

    await screen.findByRole("link", { name: "#8" });
    await user.type(screen.getByRole("searchbox", { name: /buscar por nome/ }), "Carl");
    await user.click(await screen.findByRole("button", { name: /Carlos Lima/ }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/contas-receber").some((c) => c.query.get("pessoa_id") === "20")).toBe(true));
  });
});

describe("TituloDetailPage", () => {
  it("mostra baixas (com estorno negativo), saldo do cliente e histórico sob demanda", async () => {
    const t = titulo({
      valor_pago: "0.00",
      saldo: "50.00",
      baixas: [
        { id: 1, valor: "10.00", forma: "Dinheiro", caixa_id: 5, estorno_de_id: null, observacao: null, created_at: "2026-10-13T12:00:00+00:00", usuario_nome: "Ana Souza" },
        { id: 2, valor: "-10.00", forma: "Dinheiro", caixa_id: 6, estorno_de_id: 1, observacao: "Estorno: venda estornada", created_at: "2026-10-13T13:00:00+00:00", usuario_nome: "Bruno Lima" },
      ],
    });
    const mock = setupDetail("frente", t);
    mock.on("GET /api/v1/pessoas/20/historico", json(200, { pessoa_id: 20, comandas: [{ id: 12, tipo: "mesa", status: "fechada", aberta_em: "2026-10-13T12:00:00+00:00", total: "50.00" }], pagamentos: [{ venda_id: 31, forma: "Fiado", valor: "50.00", em: "2026-10-13T12:00:00+00:00" }], titulos: [t] }));
    const { user } = renderApp("/contas-receber/8");

    expect(await screen.findByRole("heading", { name: "Conta #8" })).toBeTruthy();
    const baixas = screen.getByRole("heading", { name: "Baixas" }).closest("div")!;
    expect(within(baixas).getByText(/Recebimento · Dinheiro/)).toBeTruthy();
    expect(within(baixas).getByText(/Estorno · Dinheiro/)).toBeTruthy();
    expect(within(baixas).getByText(/-R\$\s10,00/)).toBeTruthy();
    // Saldo e limite do cliente vêm de /pessoas/{id}/saldo-aberto.
    expect(await screen.findByText("R$ 160,00")).toBeTruthy();
    expect(screen.getByText("Habilitado")).toBeTruthy();
    // Histórico só é buscado quando pedido.
    expect(mock.callsTo("GET /api/v1/pessoas/20/historico")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Ver histórico do cliente" }));
    expect(await screen.findByText(/#12 · Mesa · Fechada/)).toBeTruthy();
    expect(screen.getByText(/Venda #31 · Fiado/)).toBeTruthy();
  });

  it("baixa: valor maior que o saldo é barrado; valor válido vai como string decimal com a forma escolhida", async () => {
    const mock = setupDetail("frente");
    mock.on("POST /api/v1/contas-receber/8/baixas", json(201, titulo({ valor_pago: "35.00", saldo: "15.00" })));
    const { user } = renderApp("/contas-receber/8");

    await user.click(await screen.findByRole("button", { name: "Registrar recebimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar recebimento" });
    // Formas: sem fiado.
    const options = within(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ })).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Selecione…", "Dinheiro", "Pix", "Cartão de crédito"]);

    await user.type(within(dialog).getByLabelText(/^Valor recebido/), "40,01");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Receber" }));
    expect((await within(dialog).findByText(/O valor passa do saldo da conta/)).textContent?.replace(/\u00a0/g, " ")).toContain("R$ 40,00");
    expect(mock.callsTo("POST /api/v1/contas-receber/8/baixas")).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/^Valor recebido/));
    await user.type(within(dialog).getByLabelText(/^Valor recebido/), "35");
    await user.type(within(dialog).getByLabelText("Observação"), "pagou no pix");
    await user.click(within(dialog).getByRole("button", { name: "Receber" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/contas-receber/8/baixas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/contas-receber/8/baixas")[0]!.body).toEqual({
      valor: "35.00",
      forma_pagamento_id: 2,
      observacao: "pagou no pix",
      chave: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar recebimento" })).toBeNull());
    expect(await screen.findByText("Recebimento registrado.")).toBeTruthy();
  });

  it("'Receber o saldo todo' preenche o saldo da API", async () => {
    setupDetail("frente");
    const { user } = renderApp("/contas-receber/8");
    await user.click(await screen.findByRole("button", { name: "Registrar recebimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar recebimento" });
    await user.click(within(dialog).getByRole("button", { name: /Receber o saldo todo/ }));
    expect((within(dialog).getByLabelText(/^Valor recebido/) as HTMLInputElement).value).toBe("40,00");
  });

  it("baixa exige caixa aberto: avisa, bloqueia e aponta para /caixa", async () => {
    const mock = setupDetail("frente");
    mock.on("GET /api/v1/caixas/atual", NOT_FOUND);
    const { user } = renderApp("/contas-receber/8");
    await user.click(await screen.findByRole("button", { name: "Registrar recebimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar recebimento" });
    expect(await within(dialog).findByText("Você não tem caixa aberto")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Abrir o caixa" }).getAttribute("href")).toBe("/caixa");
    expect((within(dialog).getByRole("button", { name: "Receber" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("erros do backend: caixa_fechado orienta abrir o caixa; valor_acima_do_saldo mostra a mensagem", async () => {
    const mock = setupDetail("frente");
    let calls = 0;
    mock.on("POST /api/v1/contas-receber/8/baixas", () => {
      calls += 1;
      return calls === 1 ? businessError(409, "caixa_fechado", "Abra o seu caixa antes de receber valores.") : businessError(422, "valor_acima_do_saldo", "O valor passa do saldo da conta (30.00).", { saldo: "30.00" });
    });
    const { user } = renderApp("/contas-receber/8");
    await user.click(await screen.findByRole("button", { name: "Registrar recebimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar recebimento" });
    await user.type(within(dialog).getByLabelText(/^Valor recebido/), "20");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Receber" }));
    const first = await within(dialog).findByRole("alert");
    expect(first.textContent).toContain("Abra o seu caixa antes de receber valores.");
    expect(within(first).getByRole("link", { name: "Abra o seu caixa" }).getAttribute("href")).toBe("/caixa");

    await user.click(within(dialog).getByRole("button", { name: "Receber" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("O valor passa do saldo da conta (30.00)."));
  });

  it("sem financeiro.baixar ou com a conta paga não há botão de recebimento", async () => {
    setupDetail("frente", titulo({ status: "pago", saldo: "0.00", valor_pago: "50.00" }));
    renderApp("/contas-receber/8");
    await screen.findByRole("heading", { name: "Conta #8" });
    expect(screen.queryByRole("button", { name: "Registrar recebimento" })).toBeNull();
  });

  it("sem financeiro.baixar não há botão", async () => {
    const mock = mockApi();
    signInAs("atendente", ["financeiro.listar"]);
    mock.on("GET /api/v1/contas-receber/8", json(200, titulo()));
    mock.on("GET /api/v1/pessoas/20/saldo-aberto", json(200, SALDO));
    renderApp("/contas-receber/8");
    await screen.findByRole("heading", { name: "Conta #8" });
    expect(screen.queryByRole("button", { name: "Registrar recebimento" })).toBeNull();
  });

  it("conta cancelada mostra o motivo", async () => {
    setupDetail("frente", titulo({ status: "cancelado", cancelado_motivo: "Venda estornada: pedido duplicado" }));
    renderApp("/contas-receber/8");
    expect(await screen.findByText("Venda estornada: pedido duplicado")).toBeTruthy();
  });
});
