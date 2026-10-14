import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi, ME, TOKEN } from "@/test/mockFetch";
import { page, renderApp } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

async function fillAndSubmit(user: ReturnType<typeof renderApp>["user"], email = "ana@exemplo.com.br", senha = "senha-correta-1") {
  await user.type(screen.getByLabelText(/E-mail/), email);
  await user.type(screen.getByLabelText(/^Senha/), senha);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  it("exibe o erro do backend quando as credenciais são inválidas", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", apiError(401, "credenciais_invalidas", "E-mail ou senha incorretos."));
    const { user, router } = renderApp("/login");

    await fillAndSubmit(user);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("E-mail ou senha incorretos.");
    expect(router.state.location.pathname).toBe("/login");
    expect(mock.callsTo("POST /api/v1/auth/login")[0]!.body).toEqual({ email: "ana@exemplo.com.br", senha: "senha-correta-1" });
    expect(session.getSnapshot().status).toBe("anonymous");
    expect(session.getAccessToken()).toBeNull();
  });

  it("valida campos vazios sem chamar a API", async () => {
    const mock = mockApi();
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe o e-mail.")).toBeTruthy();
    expect(screen.getByText("Informe a senha.")).toBeTruthy();
    expect(screen.getByLabelText(/E-mail/).getAttribute("aria-invalid")).toBe("true");
    expect(mock.calls).toHaveLength(0);
  });

  it("login válido guarda o token só em memória e abre o início", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", json(200, { ...TOKEN, access_token: "tok-login" }));
    mock.on("GET /api/v1/auth/me", json(200, ME));
    const { user, router } = renderApp("/login");

    await fillAndSubmit(user);

    expect(await screen.findByRole("heading", { name: /Olá, Ana/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(session.getAccessToken()).toBe("tok-login");
    expect(mock.callsTo("GET /api/v1/auth/me")[0]!.headers.get("authorization")).toBe("Bearer tok-login");
  });

  it("volta ao destino que o usuário tentou abrir antes de logar", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", json(200, TOKEN));
    mock.on("GET /api/v1/auth/me", json(200, ME));
    mock.on("GET /api/v1/usuarios", json(200, page([])));
    const { user, router } = renderApp("/usuarios?q=ana");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();

    await fillAndSubmit(user);

    expect(await screen.findByRole("heading", { name: "Usuários" })).toBeTruthy();
    expect(router.state.location.pathname + router.state.location.search).toBe("/usuarios?q=ana");
  });

  it("must_change_password no login leva direto à troca de senha", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", json(200, { ...TOKEN, must_change_password: true }));
    const { user, router } = renderApp("/login");

    await fillAndSubmit(user);

    expect(await screen.findByRole("heading", { name: "Trocar senha" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/trocar-senha");
    expect(mock.callsTo("GET /api/v1/auth/me")).toHaveLength(0);
  });

  it("conta suspensa no login vai para /acesso-suspenso", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", apiError(403, "conta_suspensa", "Conta suspensa."));
    const { user, router } = renderApp("/login");

    await fillAndSubmit(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/acesso-suspenso"));
    expect(await screen.findByRole("heading", { name: "Acesso suspenso" })).toBeTruthy();
  });

  it("'Voltar ao login' da tela de acesso suspenso reabre o login", async () => {
    mockApi();
    session.reset("suspended");
    const { user, router } = renderApp("/acesso-suspenso");

    await user.click(await screen.findByRole("button", { name: "Voltar ao login" }));

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("mostra/oculta a senha pelo botão acessível", async () => {
    mockApi();
    const { user } = renderApp("/login");
    const input = screen.getByLabelText(/^Senha/);
    expect(input.getAttribute("type")).toBe("password");

    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Ocultar senha" }).getAttribute("aria-pressed")).toBe("true");
  });
});
