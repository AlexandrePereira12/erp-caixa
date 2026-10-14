import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

describe("AppLayout: menu por módulos e submódulos", () => {
  it("o menu só mostra módulos cujo submódulo a pessoa tem permissão de listar/ver", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar", "configuracoes.ver"] });
    const { user } = renderApp("/");

    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Início" })).toBeTruthy();
    // módulos sem nenhum submódulo permitido nem aparecem
    for (const modulo of ["Atendimento", "Vendas", "Financeiro", "Estoque", "Cadastros", "Relatórios"]) {
      expect(within(nav).queryByRole("button", { name: modulo })).toBeNull();
    }
    const administracao = within(nav).getByRole("button", { name: "Administração" });
    expect(administracao.getAttribute("aria-expanded")).toBe("false");
    await user.click(administracao);
    expect(administracao.getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Usuários" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Configurações" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Papéis e permissões" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Auditoria" })).toBeNull();
  });

  it("criar/editar sem listar não libera o link do submódulo", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.criar", "usuarios.editar"] });
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).queryByRole("button", { name: "Administração" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Usuários" })).toBeNull();
  });

  it("o módulo da página atual vem aberto e o link marca a página", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/usuarios", json(200, { itens: [], total: 0, limite: 20, deslocamento: 0 }));
    mock.on("GET /api/v1/papeis", json(200, []));
    renderApp("/usuarios");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("button", { name: "Administração" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Usuários" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByText("Ana Souza").length).toBeGreaterThan(0);
  });

  it("os módulos do dia a dia começam abertos e os demais fechados", async () => {
    mockApi();
    signIn({ permissoes: ["mesas.listar", "caixa.operar", "financeiro.listar", "estoque.listar", "catalogo.listar"] });
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    for (const [modulo, aberto] of [["Atendimento", "true"], ["Vendas", "true"], ["Financeiro", "true"], ["Estoque", "false"], ["Cadastros", "false"]] as const) {
      expect(within(nav).getByRole("button", { name: modulo }).getAttribute("aria-expanded")).toBe(aberto);
    }
  });

  it("a escolha de abrir/fechar um módulo é lembrada neste navegador", async () => {
    mockApi();
    signIn({ permissoes: ["mesas.listar", "estoque.listar"] });
    const { user } = renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Principal" });

    await user.click(within(nav).getByRole("button", { name: "Atendimento" })); // fecha
    await user.click(within(nav).getByRole("button", { name: "Estoque" })); // abre
    expect(within(nav).queryByRole("link", { name: "Salão" })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Saldos e movimentos" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("pdv-nav-open") ?? "[]")).toEqual(["vendas", "financeiro", "estoque"]);
  });

  it("submódulos de relatório com rótulo repetido têm nome acessível próprio", async () => {
    mockApi();
    signIn({ permissoes: ["vendas.listar", "relatorios.vendas", "relatorios.compras"] });
    const { user } = renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    await user.click(within(nav).getByRole("button", { name: "Relatórios" }));
    expect(within(nav).getByRole("link", { name: "Vendas" }).getAttribute("href")).toBe("/vendas");
    expect(within(nav).getByRole("link", { name: "Relatório de vendas" }).getAttribute("href")).toBe("/relatorios/vendas");
    expect(within(nav).getByRole("link", { name: "Relatório de compras" }).getAttribute("href")).toBe("/relatorios/compras");
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
    const aberto = screen.getByRole("dialog");
    await user.click(within(aberto).getByRole("button", { name: "Administração" }));
    await user.click(within(aberto).getByRole("link", { name: "Configurações" }));
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

describe("AppLayout: tema claro, escuro ou do sistema", () => {
  it("a escolha vai para o <html>, é lembrada e 'sistema' volta a seguir o sistema", async () => {
    mockApi();
    signIn();
    const { user } = renderApp("/");
    const grupo = await screen.findAllByRole("radiogroup", { name: "Tema" });
    const toggle = within(grupo[0]!);
    expect(toggle.getByRole("radio", { name: "Tema do sistema" }).getAttribute("aria-checked")).toBe("true");

    await user.click(toggle.getByRole("radio", { name: "Tema escuro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("pdv-theme")).toBe("dark");
    expect(toggle.getByRole("radio", { name: "Tema escuro" }).getAttribute("aria-checked")).toBe("true");

    await user.click(toggle.getByRole("radio", { name: "Tema claro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    await user.click(toggle.getByRole("radio", { name: "Tema do sistema" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("pdv-theme")).toBeNull();
  });

  it("setas do teclado trocam a opção", async () => {
    mockApi();
    signIn();
    const { user } = renderApp("/");
    const grupo = await screen.findAllByRole("radiogroup", { name: "Tema" });
    const toggle = within(grupo[0]!);
    toggle.getByRole("radio", { name: "Tema do sistema" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
