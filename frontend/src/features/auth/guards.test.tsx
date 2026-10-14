import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { networkError } from "@/lib/api/errors";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi, ME, TOKEN } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

describe("RequireAuth", () => {
  it("sem sessão, redireciona para /login", async () => {
    mockApi();
    const { router } = renderApp("/usuarios");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("enquanto a sessão é restaurada mostra carregando, sem redirecionar", () => {
    mockApi();
    session.reset("loading");
    const { router } = renderApp("/usuarios");
    expect(screen.getByText("Verificando sua sessão…")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/usuarios");
  });

  it("falha de rede ao restaurar a sessão oferece tentar de novo (não manda para o login)", async () => {
    const mock = mockApi();
    session.reset("error");
    session.fail(networkError());
    mock.on("POST /api/v1/auth/refresh", json(200, TOKEN));
    mock.on("GET /api/v1/auth/me", json(200, ME));
    mock.on("GET /api/v1/usuarios", json(200, page([])));

    const { router, user } = renderApp("/usuarios");
    expect(screen.getByText(/Não foi possível conectar ao servidor/)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/usuarios");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { name: "Usuários" })).toBeTruthy();
  });

  it("conta suspensa vai para /acesso-suspenso", async () => {
    mockApi();
    session.reset("suspended");
    const { router } = renderApp("/usuarios");
    expect(await screen.findByRole("heading", { name: "Acesso suspenso" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/acesso-suspenso");
  });

  it("troca de senha obrigatória: qualquer rota autenticada vai para /trocar-senha", async () => {
    mockApi();
    signIn({ must_change_password: true });
    const { router } = renderApp("/usuarios");
    expect(await screen.findByRole("heading", { name: "Trocar senha" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/trocar-senha");
    expect(screen.getByText(/precisa trocar a senha antes de continuar/)).toBeTruthy();
  });

  it("must_change_password vindo do TokenOut (sem /auth/me) também redireciona", async () => {
    mockApi();
    session.reset("authenticated");
    session.setAccessToken("tok");
    session.setAuthenticated(null, true);
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { name: "Trocar senha" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/trocar-senha");
  });

  it("senha_expirada numa chamada autenticada leva à troca de senha, sem loop", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/usuarios", apiError(403, "senha_expirada", "Sua senha expirou."));
    mock.on("GET /api/v1/papeis", json(200, []));

    const { router } = renderApp("/usuarios");
    await waitFor(() => expect(router.state.location.pathname).toBe("/trocar-senha"));
    expect(await screen.findByRole("heading", { name: "Trocar senha" })).toBeTruthy();
    // Na tela de troca nenhuma chamada extra é disparada.
    expect(mock.callsTo("GET /api/v1/usuarios")).toHaveLength(1);
  });

  it("usuário autenticado que abre /login é levado ao início", async () => {
    mockApi();
    signIn();
    const { router } = renderApp("/login");
    expect(await screen.findByRole("heading", { name: /Olá, Ana/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
  });

  it("sessão perdida durante o uso (refresh falha) manda para /login", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/usuarios", apiError(401, "token_invalido", "Token inválido"));
    mock.on("GET /api/v1/papeis", apiError(401, "token_invalido", "Token inválido"));
    mock.on("POST /api/v1/auth/refresh", apiError(401, "token_invalido", "Sessão expirada"));

    const { router } = renderApp("/usuarios");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(session.getAccessToken()).toBeNull();
    // Várias consultas simultâneas, um único refresh.
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);
  });
});

describe("RequirePermission", () => {
  it("sem a permissão, mostra a tela de acesso negado dentro do layout", async () => {
    mockApi();
    signIn({ permissoes: ["configuracoes.ver"] });
    renderApp("/usuarios");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Usuários" })).toBeNull();
  });

  it("com a permissão, renderiza a página", async () => {
    const mock = mockApi();
    signIn({ permissoes: ["usuarios.listar"] });
    mock.on("GET /api/v1/usuarios", json(200, page([])));
    renderApp("/usuarios");
    expect(await screen.findByRole("heading", { name: "Usuários" })).toBeTruthy();
  });

  it("rotas de auditoria também exigem auditoria.listar", async () => {
    mockApi();
    signIn({ permissoes: ["usuarios.listar"] });
    renderApp("/auditoria/5");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
  });

  it("rota inexistente mostra a página 404", async () => {
    mockApi();
    signIn();
    renderApp("/nao-existe");
    expect(await screen.findByRole("heading", { name: "Página não encontrada" })).toBeTruthy();
  });
});
