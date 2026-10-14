import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";
import { comanda, mesaMapa, pageOf, pessoa, signInAs } from "./fixtures";

const RESUMO = (over: Record<string, unknown> = {}) => ({
  id: 12,
  tipo: "mesa",
  status: "aberta",
  mesa: { id: 3, nome: "Mesa 3" },
  cliente: null,
  nome_cliente: "Dona Rosa",
  aberta_em: "2026-10-13T12:00:00+00:00",
  fechada_em: null,
  itens_ativos: 3,
  total: "87.50",
  ...over,
});

function setup() {
  const mock = mockApi();
  signInAs("gerente");
  mock.on("GET /api/v1/comandas", json(200, pageOf([RESUMO(), RESUMO({ id: 13, tipo: "balcao", mesa: null, nome_cliente: null, cliente: { id: 20, nome: "Carlos Lima" }, status: "fechada", total: "20.00" })])));
  mock.on("GET /api/v1/mesas/mapa", json(200, [mesaMapa({ id: 3, nome: "Mesa 3" })]));
  mock.on("GET /api/v1/pessoas", json(200, pageOf([pessoa()])));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("ComandasPage", () => {
  it("lista comandas com local, cliente, situação e total da API, com link para a comanda", async () => {
    setup();
    renderApp("/comandas");
    expect(await screen.findByRole("link", { name: "#12" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#12" }).getAttribute("href")).toBe("/comandas/12");
    expect(screen.getByText("Dona Rosa")).toBeTruthy();
    expect(screen.getByText("Carlos Lima")).toBeTruthy();
    expect(screen.getByText("Aberta", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Fechada", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("R$ 87,50")).toBeTruthy();
    expect(screen.getByText("Balcão", { selector: "span" })).toBeTruthy();
  });

  it("filtros (situação, tipo, mesa, período, busca) vão para a API e para a URL", async () => {
    const mock = setup();
    const { user, router } = renderApp("/comandas");
    await screen.findByRole("link", { name: "#12" });

    await user.selectOptions(screen.getByLabelText("Situação"), "aguardando_pagamento");
    await user.selectOptions(screen.getByLabelText("Tipo"), "delivery");
    await user.selectOptions(await screen.findByLabelText("Mesa"), "3");
    await user.type(screen.getByLabelText("De"), "2026-10-01");
    await user.type(screen.getByLabelText("Até"), "2026-10-13");
    await user.type(screen.getByLabelText(/^Buscar/), "Rosa");

    await waitFor(() => {
      const q = mock.callsTo("GET /api/v1/comandas").at(-1)!.query;
      expect(q.get("status")).toBe("aguardando_pagamento");
      expect(q.get("tipo")).toBe("delivery");
      expect(q.get("mesa_id")).toBe("3");
      expect(q.get("de")).toBe(new Date("2026-10-01T00:00").toISOString());
      expect(q.get("ate")).toBe(new Date("2026-10-14T00:00").toISOString());
      expect(q.get("q")).toBe("Rosa");
    });
    expect(router.state.location.search).toContain("status=aguardando_pagamento");

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("filtro por cliente usa a busca de pessoas", async () => {
    const mock = setup();
    const { user } = renderApp("/comandas");
    await screen.findByRole("link", { name: "#12" });
    await user.type(screen.getByRole("searchbox", { name: /buscar por nome/ }), "Carl");
    await user.click(await screen.findByRole("button", { name: /Carlos Lima/ }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/comandas").some((c) => c.query.get("cliente_id") === "20")).toBe(true));
  });

  it("a paginação usa limite e deslocamento da API", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/comandas", json(200, pageOf([RESUMO()], { total: 45 })));
    mock.on("GET /api/v1/mesas/mapa", json(200, []));
    const { user, router } = renderApp("/comandas");
    await screen.findByRole("link", { name: "#12" });
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(router.state.location.search).toContain("pagina=2"));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/comandas").some((c) => c.query.get("deslocamento") === "20" && c.query.get("limite") === "20")).toBe(true));
  });

  it("'Nova comanda' abre o mesmo diálogo do salão; balcão abre direto e leva à comanda", async () => {
    const mock = setup();
    mock.on("POST /api/v1/comandas", json(201, comanda({ id: 50, tipo: "balcao", mesa: null, itens: [] })));
    mock.on("GET /api/v1/comandas/50", json(200, comanda({ id: 50, tipo: "balcao", mesa: null, itens: [] })));
    mock.on("GET /api/v1/categorias", json(200, []));
    mock.on("GET /api/v1/produtos", json(200, pageOf([], { limite: 100 })));
    const { user, router } = renderApp("/comandas");

    await user.click(await screen.findByRole("button", { name: "Nova comanda" }));
    const dialog = await screen.findByRole("dialog", { name: "Abrir comanda" });
    await user.click(within(dialog).getByRole("radio", { name: "Balcão" }));
    await user.type(within(dialog).getByLabelText("Nome na comanda"), "João");
    await user.click(within(dialog).getByRole("button", { name: "Abrir comanda" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas")[0]?.body).toEqual({ tipo: "balcao", nome_cliente: "João" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/comandas/50"));
  });

  it("delivery envia o endereço", async () => {
    const mock = setup();
    mock.on("POST /api/v1/comandas", json(201, comanda({ id: 51, tipo: "delivery", mesa: null, endereco_entrega: "Rua A, 10", itens: [] })));
    mock.on("GET /api/v1/comandas/51", json(200, comanda({ id: 51, tipo: "delivery", mesa: null, itens: [] })));
    mock.on("GET /api/v1/categorias", json(200, []));
    mock.on("GET /api/v1/produtos", json(200, pageOf([], { limite: 100 })));
    const { user } = renderApp("/comandas");
    await user.click(await screen.findByRole("button", { name: "Nova comanda" }));
    const dialog = await screen.findByRole("dialog", { name: "Abrir comanda" });
    await user.click(within(dialog).getByRole("radio", { name: "Delivery" }));
    await user.type(within(dialog).getByLabelText(/Endereço de entrega/), "Rua A, 10");
    await user.click(within(dialog).getByRole("button", { name: "Abrir comanda" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas")[0]?.body).toEqual({ tipo: "delivery", endereco_entrega: "Rua A, 10" }));
  });

  it("sem comandas.abrir não há 'Nova comanda'; sem comandas.listar a tela é negada", async () => {
    const mock = mockApi();
    signInAs("atendente", [], { permissoes: ["comandas.listar"] });
    mock.on("GET /api/v1/comandas", json(200, pageOf([RESUMO()])));
    renderApp("/comandas");
    await screen.findByRole("link", { name: "#12" });
    expect(screen.queryByRole("button", { name: "Nova comanda" })).toBeNull();
  });

  it("estado vazio e erro", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/comandas", json(200, pageOf([])));
    mock.on("GET /api/v1/mesas/mapa", json(200, []));
    renderApp("/comandas");
    expect(await screen.findByText("Nenhuma comanda ainda")).toBeTruthy();
  });
});
