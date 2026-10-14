import { expect, test, type Page } from "@playwright/test";
import { entrarComoAdmin } from "./helpers";

/** Celular (viewport estreito): sem rolagem horizontal e com o essencial do atendimento visível. */
async function semRolagemHorizontal(page: Page, onde: string) {
  // Largura do viewport configurado (não window.innerWidth: o Chrome de celular amplia o viewport
  // de layout quando algo estoura, e a comparação com ele esconderia justamente esse defeito).
  const janela = page.viewportSize()!.width;
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura, `rolagem horizontal em ${onde}`).toBeLessThanOrEqual(janela);
}

test.describe.serial("atendimento no celular", () => {
  test("login, caixa, mapa de mesas e comanda cabem na tela", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/caixa");
    const abrir = page.getByRole("button", { name: "Abrir caixa" });
    // espera a tela decidir entre "abrir caixa" e "caixa aberto" antes de agir
    await expect(abrir.or(page.getByText("Aberto", { exact: true }))).toBeVisible();
    if (await abrir.isVisible()) {
      await page.getByLabel(/Valor inicial/).fill("50");
      await abrir.click();
    }
    await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
    await semRolagemHorizontal(page, "/caixa");
    await page.screenshot({ path: "test-results/mobile-caixa.png" });

    await page.goto("/mesas");
    await expect(page.getByRole("button", { name: /^Mesa 2(?!\d)/ })).toBeVisible();
    await semRolagemHorizontal(page, "/mesas");
    await page.screenshot({ path: "test-results/mobile-mesas.png" });

    await page.getByRole("button", { name: /^Mesa 2(?!\d)/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abrir comanda" }).click();
    await page.waitForURL(/\/comandas\/\d+/);
    await semRolagemHorizontal(page, "comanda");
    await page.screenshot({ path: "test-results/mobile-comanda-vazia.png" });

    await page.getByRole("button", { name: /^Adicionar Suco natural/ }).click();
    await page.getByRole("button", { name: /^Adicionar X-Queijo/ }).click();
    // total sempre à vista no celular, vindo da API
    await expect(page.getByText("R$ 41,00").first()).toBeVisible();
    await semRolagemHorizontal(page, "comanda com itens");
    await page.screenshot({ path: "test-results/mobile-comanda.png", fullPage: false });

    for (const rota of ["/vendas", "/comandas", "/produtos", "/estoque", "/usuarios", "/contas-receber"]) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      await semRolagemHorizontal(page, rota);
    }
    await page.goto("/vendas");
    await page.screenshot({ path: "test-results/mobile-vendas.png" });
  });
});
