import { expect, test } from "@playwright/test";
import { entrarComoAdmin, textoPrincipal } from "./helpers";

/**
 * Contas a pagar e relatórios no navegador de verdade, contra a stack com dados de demonstração e a
 * venda que o fluxo completo fez antes (2 refrigerantes + 1 hambúrguer = R$ 40,00; esta spec roda depois).
 */
test.describe.serial("contas a pagar e relatórios", () => {
  test("lança uma conta, paga parte dela e o saldo cai", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/contas-pagar");
    await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();

    // resumo das contas de demonstração: uma vencida, duas a vencer, uma paga no mês
    await expect.poll(() => textoPrincipal(page)).toContain("Vencido R$ 2.500,00");
    expect(await textoPrincipal(page)).toContain("Em aberto R$ 3.880,40");

    const venceEm = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await page.getByRole("button", { name: "Nova conta" }).click();
    const lancar = page.getByRole("dialog");
    await lancar.getByLabel(/^Descrição/).fill("Gás de cozinha");
    await lancar.getByLabel(/^Valor \(R\$\)/).fill("150,00");
    await lancar.getByLabel(/^Vencimento/).fill(venceEm);
    await lancar.getByRole("button", { name: "Lançar conta" }).click();
    await expect(page.getByText("Conta lançada.")).toBeVisible();

    // a lista abre em "Em aberto": a conta nova está lá
    await page.getByRole("link", { name: "Gás de cozinha" }).click();
    await expect(page.getByRole("heading", { name: /Conta a pagar #\d+/ })).toBeVisible();
    await page.getByRole("button", { name: "Pagar" }).click();
    const pagamento = page.getByRole("dialog", { name: "Registrar pagamento" });
    await pagamento.getByLabel(/^Valor pago/).fill("50,00");
    await pagamento.getByLabel(/^Forma de pagamento/).selectOption({ label: "PIX" });
    await pagamento.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect.poll(() => textoPrincipal(page)).toContain("R$ 100,00"); // saldo
    expect(await textoPrincipal(page)).toContain("R$ 50,00"); // pago
  });

  test("relatório de compras: as entradas de demonstração, por dia e por fornecedor", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/relatorios/compras");
    await expect(page.getByRole("heading", { name: "Relatório de compras" })).toBeVisible();
    await expect(page.getByText("R$ 3.048,00").first()).toBeVisible();

    await page.getByRole("radio", { name: "Fornecedor" }).check({ force: true });
    await expect(page.getByText("Distribuidora Boa Mesa Ltda").first()).toBeVisible();
  });

  test("relatórios de vendas e de produtos refletem a venda do fluxo completo", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/relatorios/vendas");
    await expect(page.getByRole("heading", { name: "Relatório de vendas" })).toBeVisible();
    await expect(page.getByText("R$ 40,00").first()).toBeVisible();

    await page.goto("/relatorios/produtos");
    await expect(page.getByRole("heading", { name: "Relatório de produtos" })).toBeVisible();
    await expect.poll(() => textoPrincipal(page)).toContain("Hambúrguer artesanal");
    expect(await textoPrincipal(page)).toContain("R$ 40,00"); // receita total
  });

  test("painel e menu de relatórios abrem para quem tem permissão", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    const menu = page.getByRole("navigation", { name: "Principal" });
    await expect(menu.getByRole("button", { name: "Relatórios" })).toHaveAttribute("aria-expanded", "true");
    for (const relatorio of ["Relatório de vendas", "Relatório de produtos", "Relatório de compras", "Relatório de caixa", "Relatório de estoque", "Relatório de perdas"]) {
      await expect(menu.getByRole("link", { name: relatorio })).toBeVisible();
    }
  });
});
