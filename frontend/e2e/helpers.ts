import { expect, type Page } from "@playwright/test";

export const SENHA_NOVA = "SenhaDoRestaurante#2026";

/** Texto visível do conteúdo principal numa linha só (diagnóstico e asserções de texto). */
export async function textoPrincipal(page: Page): Promise<string> {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
}

/**
 * Entra com o administrador. Na primeira vez (stack recém-provisionada) a senha é a temporária e a
 * troca é obrigatória; se a troca já foi feita antes (rodadas seguidas na mesma stack), vale a nova.
 */
export async function entrarComoAdmin(page: Page): Promise<"primeiro-acesso" | "acesso-normal"> {
  const email = process.env.E2E_ADMIN_EMAIL!;
  const temporaria = process.env.E2E_ADMIN_SENHA!;
  await page.goto("/login");
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill(temporaria);
  await page.getByRole("button", { name: "Entrar" }).click();
  const resultado = await Promise.race([
    page.waitForURL(/trocar-senha/).then(() => "primeiro-acesso" as const),
    page.getByText("E-mail ou senha incorretos.").waitFor().then(() => "senha-ja-trocada" as const),
  ]);
  if (resultado === "primeiro-acesso") {
    await page.getByLabel(/^Senha atual/).fill(temporaria);
    await page.getByLabel(/^Nova senha/).fill(SENHA_NOVA);
    await page.getByLabel(/^Confirmar nova senha/).fill(SENHA_NOVA);
    await page.getByRole("button", { name: "Alterar senha" }).click();
    await page.waitForURL((u) => !u.pathname.includes("trocar-senha"));
    return "primeiro-acesso";
  }
  await page.getByLabel(/^Senha/).fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"));
  await expect(page.getByRole("link", { name: "Salão" }).first()).toBeVisible();
  return "acesso-normal";
}
