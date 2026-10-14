import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comanda, mesaMapa, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const MAPA = [
  mesaMapa({ id: 1, nome: "Mesa 1", status: "livre" }),
  mesaMapa({
    id: 2,
    nome: "Mesa 2",
    status: "ocupada",
    comanda: { id: 12, status: "aberta", nome_cliente: "Dona Rosa", num_pessoas: 3, itens_ativos: 4, total_parcial: "87.50", aberta_em: new Date(Date.now() - 35 * 60_000).toISOString() },
  }),
  mesaMapa({
    id: 3,
    nome: "Mesa 3",
    status: "aguardando_pagamento",
    comanda: { id: 13, status: "aguardando_pagamento", nome_cliente: null, num_pessoas: null, itens_ativos: 1, total_parcial: "30.00", aberta_em: new Date(Date.now() - 5 * 60_000).toISOString() },
  }),
  mesaMapa({ id: 4, nome: "Mesa 4", status: "reservada" }),
  mesaMapa({ id: 5, nome: "Mesa 5", status: "bloqueada" }),
];

beforeEach(() => {
  session.reset("anonymous");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SalaoPage (mapa de mesas)", () => {
  it("mostra cada mesa com status em texto, comanda em andamento e total da API", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    renderApp("/mesas");

    const lista = await screen.findByRole("list", { name: "Mesas" });
    const cards = within(lista).getAllByRole("listitem");
    expect(cards).toHaveLength(5);
    // Status como texto (não só cor/ícone), um por cartão.
    expect(within(cards[0]!).getByText("Livre")).toBeTruthy();
    expect(within(cards[1]!).getByText("Ocupada")).toBeTruthy();
    expect(within(cards[2]!).getByText("Aguardando pagamento")).toBeTruthy();
    expect(within(cards[3]!).getByText("Reservada")).toBeTruthy();
    expect(within(cards[4]!).getByText("Bloqueada")).toBeTruthy();
    // Comanda em andamento: total parcial vem pronto da API.
    expect(within(cards[1]!).getByText(/87,50/)).toBeTruthy();
    expect(within(cards[1]!).getByText(/Comanda #12 · 4 itens · 3 pessoas/)).toBeTruthy();
    expect(within(cards[1]!).getByText("Dona Rosa")).toBeTruthy();
    expect(within(cards[1]!).getByText(/aberta há 35 min/)).toBeTruthy();
    // Mesa ocupada leva à comanda; mesa bloqueada não é interativa.
    expect(within(cards[1]!).getByRole("link").getAttribute("href")).toBe("/comandas/12");
    expect(within(cards[4]!).queryByRole("button")).toBeNull();
    expect(within(cards[4]!).queryByRole("link")).toBeNull();
    // Resumo por situação.
    const resumo = screen.getByRole("list", { name: "Resumo por situação" });
    expect(within(resumo).getByText(/Livre/).textContent).toContain("1");
  });

  it("tocar numa mesa livre abre o diálogo com a mesa escolhida e abre a comanda", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    mock.on("POST /api/v1/comandas", json(201, comanda({ id: 40, mesa: { id: 1, nome: "Mesa 1" }, itens: [] })));
    mock.on("GET /api/v1/comandas/40", json(200, comanda({ id: 40, mesa: { id: 1, nome: "Mesa 1" }, itens: [] })));
    mock.on("GET /api/v1/categorias", json(200, []));
    mock.on("GET /api/v1/produtos", json(200, { itens: [], total: 0, limite: 100, deslocamento: 0 }));
    const { user, router } = renderApp("/mesas");

    await user.click(await screen.findByRole("button", { name: /Mesa 1/ }));
    const dialog = await screen.findByRole("dialog", { name: "Abrir comanda" });
    expect((within(dialog).getByRole("combobox", { name: /^Mesa/ }) as HTMLSelectElement).value).toBe("1");
    await user.type(within(dialog).getByLabelText("Número de pessoas"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Abrir comanda" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas")[0]!.body).toEqual({ tipo: "mesa", mesa_id: 1, num_pessoas: 4 });
    await waitFor(() => expect(router.state.location.pathname).toBe("/comandas/40"));
  });

  it("delivery exige endereço antes de enviar", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    const { user } = renderApp("/mesas");

    await user.click(await screen.findByRole("button", { name: "Delivery" }));
    const dialog = await screen.findByRole("dialog", { name: "Abrir comanda" });
    await user.click(within(dialog).getByRole("button", { name: "Abrir comanda" }));
    expect(await within(dialog).findByText("Informe o endereço de entrega.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/comandas")).toHaveLength(0);
  });

  it("mesa_indisponivel mostra a mensagem do backend no diálogo", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    mock.on("POST /api/v1/comandas", json(409, { erro: { codigo: "mesa_indisponivel", mensagem: "A mesa Mesa 1 está ocupada." } }));
    const { user } = renderApp("/mesas");

    await user.click(await screen.findByRole("button", { name: /Mesa 1/ }));
    const dialog = await screen.findByRole("dialog", { name: "Abrir comanda" });
    await user.click(within(dialog).getByRole("button", { name: "Abrir comanda" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("A mesa Mesa 1 está ocupada.");
  });

  it("sem comandas.abrir não há atalhos de balcão/retirada/delivery e a mesa livre não é botão", async () => {
    const mock = mockApi();
    signInAs("atendente", [], { permissoes: ["mesas.listar", "comandas.listar"] });
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    renderApp("/mesas");

    await screen.findByRole("list", { name: "Mesas" });
    expect(screen.queryByRole("button", { name: "Balcão" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mesa 1/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Gerenciar mesas" })).toBeNull();
  });

  it("gerente vê o link de gestão; falha ao carregar oferece nova tentativa", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas/mapa", json(500, { erro: { codigo: "erro_interno", mensagem: "Falha no mapa." } }));
    renderApp("/mesas");
    expect((await screen.findByRole("alert")).textContent).toContain("Falha no mapa.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gerenciar mesas" }).getAttribute("href")).toBe("/mesas/gerenciar");
  });

  it("o mapa é recarregado ao tocar em atualizar", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    const { user } = renderApp("/mesas");
    await screen.findByRole("list", { name: "Mesas" });
    await user.click(screen.getByRole("button", { name: "Atualizar mapa agora" }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/mesas/mapa").length).toBeGreaterThanOrEqual(2));
  });

  it("atualiza sozinho a cada 15 segundos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/mesas/mapa", json(200, MAPA));
    renderApp("/mesas");
    await screen.findByRole("list", { name: "Mesas" });
    const first = mock.callsTo("GET /api/v1/mesas/mapa").length;

    await vi.advanceTimersByTimeAsync(14_000);
    expect(mock.callsTo("GET /api/v1/mesas/mapa")).toHaveLength(first);
    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => expect(mock.callsTo("GET /api/v1/mesas/mapa").length).toBeGreaterThan(first));
  });
});
