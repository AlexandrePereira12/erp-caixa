import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { caixa, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

const linksOf = (region: HTMLElement) => within(region).getAllByRole("link").map((a) => a.textContent ?? "");

describe("Home: atalhos por módulo e permissão", () => {
  it("frente de loja vê os atalhos que pode usar, agrupados por módulo, e o estado do caixa", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    renderApp("/");

    const atendimento = await screen.findByRole("region", { name: "Atendimento" });
    expect(linksOf(atendimento)).toEqual([expect.stringContaining("Salão"), expect.stringContaining("Comandas")]);
    expect(within(atendimento).getByRole("link", { name: /Salão/ }).getAttribute("href")).toBe("/mesas");

    const vendas = screen.getByRole("region", { name: "Vendas" });
    // Sem caixa.listar não há histórico de caixas.
    expect(linksOf(vendas)).toEqual([expect.stringContaining("Caixa"), expect.stringContaining("Vendas")]);
    expect(within(vendas).queryByRole("link", { name: /Histórico de caixas/ })).toBeNull();
    expect(await within(vendas).findByText(/Caixa #5 aberto desde/)).toBeTruthy();

    const financeiro = screen.getByRole("region", { name: "Financeiro" });
    expect(linksOf(financeiro)).toEqual([expect.stringContaining("Contas a receber"), expect.stringContaining("Formas de pagamento")]);

    // Sem permissão de relatórios ou de administração, esses módulos nem aparecem.
    expect(screen.queryByRole("region", { name: "Relatórios" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Administração" })).toBeNull();
  });

  it("avisa quando não há caixa aberto", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/caixas/atual", json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } }));
    renderApp("/");
    expect(await screen.findByText(/Nenhum caixa aberto/)).toBeTruthy();
  });

  it("atendente só vê Salão e Comandas no atendimento e nenhum módulo financeiro", async () => {
    mockApi();
    signInAs("atendente");
    renderApp("/");
    const atendimento = await screen.findByRole("region", { name: "Atendimento" });
    expect(linksOf(atendimento)).toEqual([expect.stringContaining("Salão"), expect.stringContaining("Comandas")]);
    expect(screen.queryByRole("region", { name: "Vendas" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Financeiro" })).toBeNull();
  });

  it("perfil só administrativo vê apenas o módulo de administração", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar", "configuracoes.ver"] });
    renderApp("/");
    const main = within(await screen.findByRole("main"));
    const administracao = await main.findByRole("region", { name: "Administração" });
    expect(linksOf(administracao)).toEqual([expect.stringContaining("Usuários"), expect.stringContaining("Configurações")]);
    expect(main.queryByRole("region", { name: "Atendimento" })).toBeNull();
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
    const vendas = await screen.findByRole("region", { name: "Vendas" });
    expect(linksOf(vendas)).toEqual([expect.stringContaining("Caixa"), expect.stringContaining("Vendas"), expect.stringContaining("Histórico de caixas")]);
    expect(linksOf(screen.getByRole("region", { name: "Atendimento" }))).toHaveLength(2);
  });

  it("a saudação usa o primeiro nome", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar"] });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: /Olá, Ana/ })).toBeTruthy();
  });
});
