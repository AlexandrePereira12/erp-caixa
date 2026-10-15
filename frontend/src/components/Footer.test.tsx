import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

function conferirRodape() {
  const rodape = screen.getByRole("contentinfo");
  expect(within(rodape).getByText(/Gestão de salão, comandas e caixa para restaurantes\./)).toBeTruthy();
  expect(rodape.textContent).toContain(`© ${new Date().getFullYear()} alexandre-dev. Todos os direitos reservados.`);
  expect(within(rodape).getByRole("link", { name: "Créditos" }).getAttribute("href")).toBe("/creditos");
}

describe("Footer", () => {
  it("aparece nas telas públicas, com o link para os créditos", async () => {
    renderApp("/creditos");
    expect(await screen.findByRole("heading", { name: "Créditos" })).toBeTruthy();
    expect(screen.getByText(/Sistema desenvolvido por alexandre-dev/)).toBeTruthy();
    conferirRodape();
  });

  it("aparece no layout do sistema para quem está logado", async () => {
    signIn();
    renderApp("/nao-existe");
    expect(await screen.findByRole("heading", { name: "Página não encontrada" })).toBeTruthy();
    conferirRodape();
  });

  it("a página de créditos abre sem login e o link do rodapé leva até ela", async () => {
    const { user } = renderApp("/creditos");
    await user.click(await screen.findByRole("link", { name: "Créditos" }));
    expect(screen.getByRole("heading", { name: "Créditos" })).toBeTruthy();
  });
});
