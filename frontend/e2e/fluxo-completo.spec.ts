import { expect, test, type Page } from "@playwright/test";
import { entrarComoAdmin, textoPrincipal } from "./helpers";

/**
 * login -> abrir caixa -> abrir mesa -> lançar itens -> pedir a conta -> fechar com pagamento dividido
 * -> conferir caixa, estoque e auditoria -> fechar o caixa (conferência cega).
 *
 * Números (dados de demonstração): 2 x Refrigerante lata (6,00) + 1 x Hambúrguer artesanal (28,00)
 * = 40,00. Pago 15,00 no PIX e 25,00 em dinheiro (entregues 30,00: troco de 5,00).
 */
test.describe.serial("fluxo completo do salão", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("entra no sistema (com troca de senha obrigatória no primeiro acesso)", async () => {
    await entrarComoAdmin(page);
    await expect(page.getByRole("heading", { name: /Olá, Admin/ })).toBeVisible();
  });

  test("abre o caixa com R$ 100,00 na gaveta", async () => {
    await page.goto("/caixa");
    await page.getByLabel(/Valor inicial/).fill("100");
    await page.getByRole("button", { name: "Abrir caixa" }).click();
    await expect(page.getByText("Caixa #")).toBeVisible();
    await expect(page.getByText("Aberto", { exact: true })).toBeVisible();
    expect(await textoPrincipal(page)).toContain("R$ 100,00");
  });

  test("abre a Mesa 1 e lança os itens; os totais vêm da API", async () => {
    await page.goto("/mesas");
    await page.getByRole("button", { name: /^Mesa 1(?!\d)/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abrir comanda" }).click();
    await page.waitForURL(/\/comandas\/\d+/);
    await expect(page.getByRole("heading", { name: /Comanda #\d+/ })).toBeVisible();

    const produto = (nome: string) => page.getByRole("button", { name: new RegExp(`^Adicionar ${nome}`) }).first();
    await produto("Refrigerante lata").click();
    await expect(page.getByText("Itens (1)")).toBeVisible();
    await produto("Refrigerante lata").click();
    await produto("Hambúrguer artesanal").click();
    await expect(page.getByText("Itens (3)")).toBeVisible();
    await expect(page.getByText("R$ 40,00").first()).toBeVisible();
    expect(await textoPrincipal(page)).toMatch(/Subtotal R\$ 40,00/);
  });

  test("pede a conta: itens travados e total confirmado pela API", async () => {
    await page.getByRole("button", { name: /Pedir conta/ }).click();
    await expect(page.getByText("Aguardando pagamento").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reabrir comanda" })).toBeVisible();
    // itens travados: o painel de produtos some ou fica desabilitado
    await expect(page.getByRole("button", { name: /^Adicionar Refrigerante lata/ })).toHaveCount(0);
  });

  test("fecha a conta dividindo em PIX e dinheiro com troco", async () => {
    await page.getByRole("button", { name: "Fechar conta" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    await expect(dlg.getByText("R$ 40,00").first()).toBeVisible();

    await dlg.getByRole("button", { name: "Pagar tudo em PIX" }).click();
    const pagamento1 = dlg.getByRole("group", { name: "Pagamento 1" });
    await pagamento1.getByLabel(/^Valor/).fill("15,00");
    await dlg.getByRole("button", { name: /Dividir por valor/ }).click();
    const pagamento2 = dlg.getByRole("group", { name: "Pagamento 2" });
    await pagamento2.getByLabel("Forma").selectOption({ label: "Dinheiro" });
    await expect(pagamento2.getByLabel(/^Valor \(R\$\)/).first()).toHaveValue("25,00");
    await pagamento2.getByLabel(/Valor recebido/).fill("30,00");
    await expect(dlg.getByText(/Troco previsto/).first()).toBeVisible();
    await expect(pagamento2).toContainText("R$ 5,00");

    await dlg.getByRole("button", { name: "Confirmar fechamento" }).click();
    // sucesso: total, pagamentos e TROCO vêm da resposta da API
    await expect(page.getByRole("heading", { name: /Venda #\d+ concluída/ })).toBeVisible();
    const sucesso = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
    expect(sucesso).toContain("R$ 40,00");
    expect(sucesso).toMatch(/troco R\$ 5,00/i);
  });

  test("estoque e caixa refletem a venda (ficha técnica baixou os insumos)", async () => {
    await page.getByRole("button", { name: "Concluir" }).click();

    await page.goto("/estoque");
    await expect(page.getByText("Saldos de estoque")).toBeVisible();
    const estoque = await textoPrincipal(page);
    expect(estoque).toContain("Refrigerante lata Revenda 118 UN"); // 120 - 2
    expect(estoque).toContain("Pão de hambúrguer Insumo 99 UN"); // ficha do hambúrguer: 1 pão
    expect(estoque).toContain("Carne bovina moída Insumo 24,82 KG"); // 25 - 0,18 kg

    await page.goto("/caixa");
    await page.getByRole("button", { name: "Mostrar valores esperados" }).click();
    const caixa = await textoPrincipal(page);
    expect(caixa).toContain("Vendas (1) R$ 40,00");
    expect(caixa).toContain("Dinheiro R$ 125,00"); // abertura 100 + 25 (o troco não entra)
    expect(caixa).toContain("PIX R$ 15,00");
  });

  test("fecha o caixa na conferência cega (faltando forma e com diferença)", async () => {
    await page.getByRole("button", { name: "Fechar caixa" }).click();
    const dlg = page.getByRole("dialog");
    // o valor esperado não aparece antes do envio
    expect(await dlg.innerText()).not.toContain("125,00");

    await dlg.getByLabel(/^Dinheiro/).fill("120,00");
    await dlg.getByRole("button", { name: "Enviar conferência" }).click();
    await expect(dlg.getByText(/Informe o valor contado de: PIX/)).toBeVisible(); // faltou o PIX

    await dlg.getByLabel(/^PIX/).fill("15,00");
    await dlg.getByRole("button", { name: "Enviar conferência" }).click();
    await expect(dlg.getByText(/há diferença de -5.00/)).toBeVisible(); // faltam R$ 5,00 no dinheiro
  });

  test("justifica a diferença e o caixa fecha com a conferência registrada", async () => {
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel(/^Justificativa da diferença em Dinheiro/).fill("Troco devolvido a mais ao cliente");
    await dlg.getByRole("button", { name: "Enviar conferência" }).click();
    await expect(page.getByRole("heading", { name: /Caixa #\d+ fechado/ })).toBeVisible();
    const resultado = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
    expect(resultado).toContain("R$ 125,00"); // esperado, revelado só agora
    expect(resultado).toContain("R$ 120,00"); // contado
    expect(resultado).toMatch(/Falta R\$ 5,00/); // diferença
    expect(resultado).toContain("Troco devolvido a mais ao cliente");
    await page.getByRole("button", { name: "Concluir" }).click();
    await page.goto("/caixa");
    await expect(page.getByRole("button", { name: "Abrir caixa" })).toBeVisible(); // sem caixa aberto
  });

  test("a auditoria guarda o fluxo inteiro com o usuário certo", async () => {
    await page.goto("/auditoria");
    await expect(page.getByText("Registros de auditoria")).toBeVisible();
    const trilha = await textoPrincipal(page);
    for (const trecho of [
      "LOGIN Autenticação",
      "Caixa #1 aberto com 100.00",
      "Comanda #1 aberta (mesa)",
      "FECHAMENTO_COMANDA Vendas venda #1",
      "pagamento de 15.00 em pix",
      "pagamento de 25.00 em dinheiro",
      "FECHAMENTO_CAIXA Caixa caixa #1",
    ]) {
      expect(trilha, trecho).toContain(trecho);
    }
    expect(trilha).toContain("Admin E2E Administrador");
  });

  test("a frente de loja só enxerga e só acessa o que o papel permite", async ({ browser }) => {
    // o administrador cria a usuária pela tela de Usuários
    await page.goto("/usuarios");
    await page.getByRole("button", { name: /Novo usuário/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel(/^Nome/).fill("Maria Frente");
    await dlg.getByLabel(/^E-mail/).fill("maria@e2e.example.com");
    await dlg.getByLabel(/^Senha temporária/).fill("Temporaria#2026ab");
    await dlg.getByRole("checkbox", { name: /Frente de loja/ }).check();
    await dlg.getByRole("button", { name: "Criar usuário" }).click();
    await expect(page.getByText("maria@e2e.example.com")).toBeVisible();

    // sessão separada: primeiro acesso da Maria
    const contexto = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Fortaleza" });
    const maria = await contexto.newPage();
    await maria.goto("/login");
    await maria.getByLabel(/^E-mail/).fill("maria@e2e.example.com");
    await maria.getByLabel(/^Senha/).fill("Temporaria#2026ab");
    await maria.getByRole("button", { name: "Entrar" }).click();
    await maria.waitForURL(/trocar-senha/);
    await maria.getByLabel(/^Senha atual/).fill("Temporaria#2026ab");
    await maria.getByLabel(/^Nova senha/).fill("SenhaDaFrente#2026x");
    await maria.getByLabel(/^Confirmar nova senha/).fill("SenhaDaFrente#2026x");
    await maria.getByRole("button", { name: "Alterar senha" }).click();
    await maria.waitForURL((u) => !u.pathname.includes("trocar-senha"));

    const menu = maria.getByRole("navigation");
    for (const permitido of ["Salão", "Comandas", "Caixa", "Vendas"]) {
      await expect(menu.getByRole("link", { name: permitido, exact: true })).toBeVisible();
    }
    for (const proibido of ["Usuários", "Papéis e permissões", "Auditoria", "Configurações"]) {
      await expect(menu.getByRole("link", { name: proibido, exact: true })).toHaveCount(0);
    }
    // e a rota também é barrada (não só escondida)
    await maria.goto("/usuarios");
    await expect(maria.getByText(/não tem permissão/i).first()).toBeVisible();
    await contexto.close();
  });
});
