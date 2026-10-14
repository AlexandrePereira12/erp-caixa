import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { caixa, PERMS, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

describe("Home: atalhos por permissão", () => {
  it("frente de loja vê os atalhos de operação que pode usar e o estado do caixa", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/");

    const operacao = await screen.findByRole("region", { name: "Operação" });
    for (const nome of ["Salão", "Comandas", "Caixa", "Vendas", "Contas a receber", "Formas de pagamento"]) {
      expect(within(operacao).getByRole("link", { name: new RegExp(nome) })).toBeTruthy();
    }
    expect(within(operacao).getByRole("link", { name: /Salão/ }).getAttribute("href")).toBe("/mesas");
    // Sem caixa.listar não há histórico.
    expect(within(operacao).queryByRole("link", { name: /Histórico de caixas/ })).toBeNull();
    expect(await within(operacao).findByText(/Caixa #5 aberto desde/)).toBeTruthy();
  });

  it("avisa quando não há caixa aberto", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/caixas/atual", json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } }));
    renderApp("/");
    expect(await screen.findByText(/Nenhum caixa aberto/)).toBeTruthy();
  });

  it("atendente só vê Salão e Comandas", async () => {
    mockApi();
    signInAs("atendente");
    renderApp("/");
    const operacao = await screen.findByRole("region", { name: "Operação" });
    expect(within(operacao).getAllByRole("link").map((a) => a.textContent)).toEqual([expect.stringContaining("Salão"), expect.stringContaining("Comandas")]);
  });

  it("perfil só administrativo mantém a lista de módulos de antes", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar", "configuracoes.ver"] });
    renderApp("/");
    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("link", { name: "Usuários" })).toBeTruthy();
    expect(main.getByRole("link", { name: "Configurações" })).toBeTruthy();
    expect(main.queryByRole("region", { name: "Operação" })).toBeNull();
  });

  it("perfil sem nenhum módulo mostra a orientação", async () => {
    mockApi();
    signIn({ permissoes: [] });
    renderApp("/");
    expect(await screen.findByText(/ainda não tem acesso a nenhum módulo/)).toBeTruthy();
  });

  it("gerente enxerga todos os módulos de operação, inclusive histórico de caixas", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/");
    const operacao = await screen.findByRole("region", { name: "Operação" });
    expect(within(operacao).getAllByRole("link")).toHaveLength(PERMS.gerente.filter((p) => ["mesas.listar", "comandas.listar", "caixa.operar", "caixa.listar", "vendas.listar", "financeiro.listar", "formas_pagamento.listar"].includes(p)).length);
  });
});
