import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

describe("AppLayout", () => {
  it("o menu só mostra módulos cuja permissão de listar/ver o usuário tem", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar", "configuracoes.ver"] });
    renderApp("/");

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Início" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Usuários" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Configurações" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Papéis e permissões" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Auditoria" })).toBeNull();
  });

  it("criar/editar sem listar não libera o link do módulo", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.criar", "usuarios.editar"] });
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).queryByRole("link", { name: "Usuários" })).toBeNull();
  });

  it("mostra o nome do usuário e o link marca a página atual", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/usuarios", json(200, { itens: [], total: 0, limite: 20, deslocamento: 0 }));
    mock.on("GET /api/v1/papeis", json(200, []));
    renderApp("/usuarios");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByText("Ana Souza").length).toBeGreaterThan(0);
  });

  it("Sair chama o logout, limpa a sessão e volta ao login", async () => {
    const mock = mockApi();
    signIn();
    mock.on("POST /api/v1/auth/logout", json(204));
    const { user, router } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "Sair" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(mock.callsTo("POST /api/v1/auth/logout")).toHaveLength(1);
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("menu em gaveta: abre, navega e fecha com Esc", async () => {
    mockApi();
    signIn();
    const { user, router } = renderApp("/");

    const opener = await screen.findByRole("button", { name: "Abrir menu" });
    await user.click(opener);
    const drawer = screen.getByRole("dialog", { name: "Menu de navegação" });
    expect(drawer.getAttribute("aria-modal")).toBe("true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await user.click(opener);
    await user.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Configurações" }));
    expect(router.state.location.pathname).toBe("/configuracoes");
    expect(screen.queryByRole("dialog", { name: "Menu de navegação" })).toBeNull();
  });

  it("tem link de pular para o conteúdo", async () => {
    mockApi();
    signIn();
    renderApp("/");
    const skip = await screen.findByRole("link", { name: "Ir para o conteúdo" });
    expect(skip.getAttribute("href")).toBe("#conteudo");
  });
});
