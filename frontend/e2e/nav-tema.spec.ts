import { expect, test } from "@playwright/test";
import { entrarComoAdmin } from "./helpers";

/** Menu em módulos e submódulos, e alternância de tema (claro, escuro, sistema), no navegador de verdade. */
test.describe("menu por módulos e tema", () => {
  test("os módulos do dia a dia vêm abertos, abrem e fecham, e a escolha sobrevive ao recarregar", async ({ page }) => {
    await entrarComoAdmin(page);
    const menu = page.getByRole("navigation", { name: "Principal" });

    await expect(menu.getByRole("button", { name: "Vendas" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("link", { name: "Histórico de caixas" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Estoque" })).toHaveAttribute("aria-expanded", "false");
    await expect(menu.getByRole("link", { name: "Saldos e movimentos" })).toBeHidden();

    await menu.getByRole("button", { name: "Vendas" }).click();
    await expect(menu.getByRole("link", { name: "Histórico de caixas" })).toBeHidden();
    await page.reload();
    await expect(menu.getByRole("button", { name: "Vendas" })).toHaveAttribute("aria-expanded", "false");

    // chegar numa página de um módulo fechado abre o módulo e marca o submódulo
    await page.goto("/estoque");
    await expect(menu.getByRole("button", { name: "Estoque" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("link", { name: "Saldos e movimentos" })).toHaveAttribute("aria-current", "page");
  });

  test("o tema escolhido vale para o sistema todo, sobrevive ao recarregar e 'sistema' volta ao padrão", async ({ page }) => {
    await entrarComoAdmin(page);
    const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole("radio", { name: "Tema escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await fundo()).toBe("rgb(17, 18, 20)");

    await page.reload(); // sem piscar: o tema salvo é aplicado antes da primeira pintura
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await fundo()).toBe("rgb(17, 18, 20)");

    await page.getByRole("radio", { name: "Tema claro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await fundo()).toBe("rgb(243, 244, 246)");

    await page.getByRole("radio", { name: "Tema do sistema" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });
});
