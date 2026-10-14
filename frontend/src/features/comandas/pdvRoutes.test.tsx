import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

const ROUTES: [string, string][] = [
  ["/mesas", "mesas.listar"],
  ["/mesas/gerenciar", "mesas.gerenciar"],
  ["/comandas", "comandas.listar"],
  ["/comandas/12", "comandas.listar"],
  ["/caixa", "caixa.operar"],
  ["/caixas", "caixa.listar"],
  ["/caixas/5", "caixa.listar"],
  ["/vendas", "vendas.listar"],
  ["/vendas/31", "vendas.listar"],
  ["/contas-receber", "financeiro.listar"],
  ["/contas-receber/8", "financeiro.listar"],
  ["/formas-pagamento", "formas_pagamento.listar"],
];

describe("rotas do PDV: cada uma exige a sua permissão", () => {
  it.each(ROUTES)("%s sem %s mostra acesso negado e não chama a API", async (path) => {
    const mock = mockApi();
    signIn({ permissoes: ["usuarios.listar"] });
    renderApp(path);
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(mock.calls.filter((c) => c.path !== "/api/v1/auth/me")).toHaveLength(0);
  });
});

describe("menu do PDV", () => {
  it("mostra só os itens cuja permissão o usuário tem", async () => {
    const mock = mockApi();
    signInAs("atendente");
    mock.on("GET /api/v1/mesas/mapa", json(200, []));
    renderApp("/mesas");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Salão" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Comandas" })).toBeTruthy();
    for (const nome of ["Caixa", "Histórico de caixas", "Vendas", "Contas a receber", "Formas de pagamento"]) {
      expect(within(nav).queryByRole("link", { name: nome })).toBeNull();
    }
  });

  it("gerente vê todos e o item da página atual fica marcado", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas/mapa", json(200, []));
    renderApp("/mesas");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    for (const nome of ["Salão", "Comandas", "Caixa", "Histórico de caixas", "Vendas", "Contas a receber", "Formas de pagamento"]) {
      expect(within(nav).getByRole("link", { name: nome })).toBeTruthy();
    }
    expect(within(nav).getByRole("link", { name: "Salão" }).getAttribute("aria-current")).toBe("page");
    // "/caixa" não marca "/caixas" como ativo (e vice-versa).
    expect(within(nav).getByRole("link", { name: "Caixa" }).getAttribute("aria-current")).toBeNull();
  });
});
