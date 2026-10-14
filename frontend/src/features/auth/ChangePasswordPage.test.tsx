import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, json, mockApi, ME, TOKEN } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

async function fill(user: ReturnType<typeof renderApp>["user"], atual: string, nova: string, confirmacao: string) {
  await user.type(screen.getByLabelText(/Senha atual/), atual);
  await user.type(screen.getByLabelText(/^Nova senha/), nova);
  await user.type(screen.getByLabelText(/Confirmar nova senha/), confirmacao);
  await user.click(screen.getByRole("button", { name: "Alterar senha" }));
}

describe("ChangePasswordPage", () => {
  it("mostra a política de senha (mínimo de 10 caracteres)", () => {
    mockApi();
    signIn({ must_change_password: true });
    renderApp("/trocar-senha");
    expect(screen.getByText(/Mínimo de 10 caracteres/)).toBeTruthy();
    expect(screen.getByLabelText(/^Nova senha/).getAttribute("aria-describedby")).toBeTruthy();
  });

  it("valida tamanho mínimo, confirmação e senha repetida antes de chamar a API", async () => {
    const mock = mockApi();
    signIn();
    const { user } = renderApp("/trocar-senha");

    await fill(user, "antiga-123456", "curta", "outra");
    expect(await screen.findByText("A nova senha deve ter no mínimo 10 caracteres.")).toBeTruthy();
    expect(screen.getByText("A confirmação não confere com a nova senha.")).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });

  it("recusa nova senha igual à atual", async () => {
    const mock = mockApi();
    signIn();
    const { user } = renderApp("/trocar-senha");
    await fill(user, "mesma-senha-123", "mesma-senha-123", "mesma-senha-123");
    expect(await screen.findByText("A nova senha deve ser diferente da atual.")).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });

  it("exibe senha_atual_incorreta no campo correspondente", async () => {
    const mock = mockApi();
    signIn({ must_change_password: true });
    mock.on("POST /api/v1/auth/change-password", apiError(400, "senha_atual_incorreta", "A senha atual está incorreta."));
    const { user, router } = renderApp("/trocar-senha");

    await fill(user, "errada-123456", "nova-senha-forte-1", "nova-senha-forte-1");

    const field = await screen.findByLabelText(/Senha atual/);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("A senha atual está incorreta.")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/trocar-senha");
  });

  it("exibe senha_fraca no campo da nova senha", async () => {
    const mock = mockApi();
    signIn();
    mock.on("POST /api/v1/auth/change-password", apiError(400, "senha_fraca", "A senha é fraca demais."));
    const { user } = renderApp("/trocar-senha");
    await fill(user, "antiga-123456", "1234567890", "1234567890");
    expect(await screen.findByText("A senha é fraca demais.")).toBeTruthy();
    expect(screen.getByLabelText(/^Nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("troca obrigatória concluída libera o app com o novo token", async () => {
    const mock = mockApi();
    signIn({ must_change_password: true });
    mock.on("POST /api/v1/auth/change-password", json(200, { ...TOKEN, access_token: "tok-pos-troca" }));
    mock.on("GET /api/v1/auth/me", json(200, ME));
    const { user, router } = renderApp("/trocar-senha");

    await fill(user, "temporaria-123", "nova-senha-forte-1", "nova-senha-forte-1");

    expect(await screen.findByRole("heading", { name: /Olá, Ana/ })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(mock.callsTo("POST /api/v1/auth/change-password")[0]!.body).toEqual({ senha_atual: "temporaria-123", nova_senha: "nova-senha-forte-1" });
    expect(mock.callsTo("GET /api/v1/auth/me")[0]!.headers.get("authorization")).toBe("Bearer tok-pos-troca");
    expect(within(screen.getByRole("status")).getByText("Senha alterada com sucesso.")).toBeTruthy();
  });

  it("troca voluntária: mostra Cancelar e não o aviso de obrigatoriedade", () => {
    mockApi();
    signIn();
    renderApp("/trocar-senha");
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByText(/precisa trocar a senha/)).toBeNull();
  });
});
