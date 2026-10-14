import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { businessError, caixa, FORMAS, pageOf, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const MOVIMENTOS = pageOf([
  { id: 3, caixa_id: 5, tipo: "venda", forma_pagamento_id: 1, forma: "Dinheiro", valor: "50.00", origem_tipo: "venda_pagamento", origem_id: 1, descricao: "Venda #1 (comanda #1)", created_at: "2026-10-13T12:10:00+00:00", usuario_nome: "Ana Souza" },
  { id: 2, caixa_id: 5, tipo: "sangria", forma_pagamento_id: 1, forma: "Dinheiro", valor: "-20.00", origem_tipo: null, origem_id: null, descricao: "levar ao cofre", created_at: "2026-10-13T12:05:00+00:00", usuario_nome: "Ana Souza" },
  { id: 1, caixa_id: 5, tipo: "abertura", forma_pagamento_id: 1, forma: "Dinheiro", valor: "100.00", origem_tipo: "abertura_caixa", origem_id: 5, descricao: "Valor inicial do caixa", created_at: "2026-10-13T12:00:00+00:00", usuario_nome: "Ana Souza" },
]);

/** Texto do elemento com o espaço inseparável do Intl ("R$ 1,00") normalizado. */
const txt = (el: Element | null) => el?.textContent?.replace(/\u00a0/g, " ");

const NOT_FOUND = json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } });

function setup(perfil: Parameters<typeof signInAs>[0] = "frente") {
  const mock = mockApi();
  signInAs(perfil);
  mock.on("GET /api/v1/formas-pagamento", json(200, FORMAS));
  mock.on("GET /api/v1/caixas/5/movimentos", json(200, MOVIMENTOS));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("CaixaPage", () => {
  it("sem caixa aberto oferece abrir caixa e envia o valor inicial como string decimal", async () => {
    const mock = setup();
    let aberto = false;
    mock.on("GET /api/v1/caixas/atual", () => (aberto ? json(200, caixa({ valor_abertura: "150.00" })) : NOT_FOUND.clone()));
    mock.on("POST /api/v1/caixas/abrir", () => {
      aberto = true;
      return json(201, caixa({ valor_abertura: "150.00" }));
    });
    const { user } = renderApp("/caixa");

    expect(await screen.findByRole("heading", { name: "Abrir caixa" })).toBeTruthy();
    const valor = screen.getByLabelText(/Valor inicial/);
    await user.clear(valor);
    await user.type(valor, "150");
    await user.click(screen.getByRole("button", { name: "Abrir caixa" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/caixas/abrir")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/caixas/abrir")[0]!.body).toEqual({ valor_abertura: "150.00" });
    expect(await screen.findByRole("heading", { name: /Caixa #5/ })).toBeTruthy();
    expect(screen.getByText("Aberto", { selector: "span" })).toBeTruthy();
  });

  it("caixa_ja_aberto mostra a mensagem do backend", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", NOT_FOUND);
    mock.on("POST /api/v1/caixas/abrir", businessError(409, "caixa_ja_aberto", "Você já tem um caixa aberto."));
    const { user } = renderApp("/caixa");
    await user.click(await screen.findByRole("button", { name: "Abrir caixa" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Você já tem um caixa aberto.");
  });

  it("valor inicial inválido não é enviado", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", NOT_FOUND);
    const { user } = renderApp("/caixa");
    const valor = await screen.findByLabelText(/Valor inicial/);
    await user.clear(valor);
    await user.type(valor, "abc");
    await user.click(screen.getByRole("button", { name: "Abrir caixa" }));
    expect(await screen.findByText("Informe um valor válido, como 12,50.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/caixas/abrir")).toHaveLength(0);
  });

  it("com caixa aberto mostra o resumo da API e os movimentos, sem revelar o esperado por forma", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", json(200, caixa({ sangrias: "20.00", reforcos: "5.00" })));
    renderApp("/caixa");

    expect(await screen.findByRole("heading", { name: /Caixa #5/ })).toBeTruthy();
    expect(txt(screen.getByText("Valor de abertura").nextElementSibling)).toBe("R$ 100,00");
    expect(txt(screen.getByText("Vendas (4)").nextElementSibling)).toBe("R$ 230,00");
    expect(txt(screen.getByText("Sangrias").nextElementSibling)).toBe("R$ 20,00");
    expect(txt(screen.getByText("Reforços").nextElementSibling)).toBe("R$ 5,00");
    // Movimentos (valor com sinal vindo da API).
    expect(await screen.findByText("levar ao cofre")).toBeTruthy();
    expect(screen.getAllByText("Sangria").length).toBeGreaterThan(0);
    // Fechamento cego: o esperado (R$ 250,00 / R$ 80,00) não aparece e quem não gerencia não pode mostrá-lo.
    expect(screen.queryByText("R$ 250,00")).toBeNull();
    expect(screen.queryByText("R$ 80,00")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mostrar valores esperados" })).toBeNull();
  });

  it("quem tem caixa.gerenciar_todos pode mostrar o esperado por forma", async () => {
    const mock = setup("gerente");
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    const { user } = renderApp("/caixa");
    await screen.findByRole("heading", { name: /Caixa #5/ });
    expect(screen.queryByText("R$ 250,00")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mostrar valores esperados" }));
    expect(screen.getByText("R$ 250,00")).toBeTruthy();
    expect(screen.getByText("R$ 80,00")).toBeTruthy();
  });

  it("sangria: envia valor e descrição e mostra saldo_dinheiro_insuficiente do backend", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    let calls = 0;
    mock.on("POST /api/v1/caixas/5/movimentos", () => {
      calls += 1;
      return calls === 1
        ? businessError(409, "saldo_dinheiro_insuficiente", "A sangria de 900.00 passa do dinheiro esperado no caixa (250.00).")
        : json(201, { ...MOVIMENTOS.itens[1], valor: "-100.00" });
    });
    const { user } = renderApp("/caixa");

    await user.click(await screen.findByRole("button", { name: "Sangria" }));
    const dialog = await screen.findByRole("dialog", { name: "Sangria" });
    await user.type(within(dialog).getByLabelText(/^Valor/), "900");
    await user.type(within(dialog).getByLabelText(/^Descrição/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Registrar sangria" }));
    // Descrição curta: barrada no formulário.
    expect(await within(dialog).findByText(/mínimo de 3 caracteres/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/caixas/5/movimentos")).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/^Descrição/));
    await user.type(within(dialog).getByLabelText(/^Descrição/), "levar ao cofre");
    await user.click(within(dialog).getByRole("button", { name: "Registrar sangria" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("passa do dinheiro esperado no caixa");
    expect(mock.callsTo("POST /api/v1/caixas/5/movimentos")[0]!.body).toEqual({ tipo: "sangria", valor: "900.00", descricao: "levar ao cofre" });

    // Corrige o valor e conclui.
    await user.clear(within(dialog).getByLabelText(/^Valor/));
    await user.type(within(dialog).getByLabelText(/^Valor/), "100,5");
    await user.click(within(dialog).getByRole("button", { name: "Registrar sangria" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/caixas/5/movimentos")).toHaveLength(2));
    expect(mock.callsTo("POST /api/v1/caixas/5/movimentos")[1]!.body).toEqual({ tipo: "sangria", valor: "100.50", descricao: "levar ao cofre" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sangria" })).toBeNull());
    expect(await screen.findByText(/Sangria registrada/)).toBeTruthy();
  });

  it("reforço usa o mesmo diálogo com tipo reforco", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    mock.on("POST /api/v1/caixas/5/movimentos", json(201, { ...MOVIMENTOS.itens[0], tipo: "reforco", valor: "30.00" }));
    const { user } = renderApp("/caixa");
    await user.click(await screen.findByRole("button", { name: "Reforço" }));
    const dialog = await screen.findByRole("dialog", { name: "Reforço" });
    await user.type(within(dialog).getByLabelText(/^Valor/), "30");
    await user.type(within(dialog).getByLabelText(/^Descrição/), "troco do banco");
    await user.click(within(dialog).getByRole("button", { name: "Registrar reforço" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/caixas/5/movimentos")[0]?.body).toEqual({ tipo: "reforco", valor: "30.00", descricao: "troco do banco" }));
  });

  it("fechamento cego: conferencia_incompleta e diferenca_sem_justificativa levam à justificativa e reenviam", async () => {
    const mock = setup();
    let fechado = false;
    mock.on("GET /api/v1/caixas/atual", () => (fechado ? NOT_FOUND.clone() : json(200, caixa())));
    let calls = 0;
    mock.on("POST /api/v1/caixas/5/fechar", () => {
      calls += 1;
      // Formato real do backend: `detalhes` é um objeto.
      if (calls === 1) return businessError(422, "conferencia_incompleta", "Informe o valor contado de: Pix.", { formas: ["Pix"] });
      if (calls === 2) return businessError(422, "diferenca_sem_justificativa", "Pix: há diferença de -10.00. Informe a justificativa.", { forma_pagamento_id: 2, diferenca: "-10.00" });
      fechado = true;
      return json(
        200,
        caixa({
          status: "fechado",
          fechado_em: "2026-10-13T20:00:00+00:00",
          conferencias: [
            { forma_pagamento_id: 1, forma: "Dinheiro", valor_esperado: "250.00", valor_contado: "250.00", diferenca: "0.00", justificativa: null },
            { forma_pagamento_id: 2, forma: "Pix", valor_esperado: "80.00", valor_contado: "70.00", diferenca: "-10.00", justificativa: "troco devolvido errado" },
          ],
        }),
      );
    });
    const { user } = renderApp("/caixa");

    await user.click(await screen.findByRole("button", { name: "Fechar caixa" }));
    const dialog = await screen.findByRole("dialog", { name: "Fechar caixa" });
    // Cego: nenhum valor em reais aparece antes do envio.
    await within(dialog).findByLabelText(/Pix — valor contado/);
    expect(dialog.textContent).not.toMatch(/\d+,\d{2}/);
    expect(dialog.textContent).not.toContain("250");
    expect(dialog.textContent).not.toContain("80");

    // 1) só o dinheiro: o backend lista as formas que faltam.
    await user.type(within(dialog).getByLabelText(/Dinheiro — valor contado/), "250");
    await user.click(within(dialog).getByRole("button", { name: "Enviar conferência" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Informe o valor contado de: Pix.");
    expect(within(dialog).getByText("Informe o valor contado desta forma.")).toBeTruthy();
    expect(within(dialog).getByLabelText(/Pix — valor contado/).getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText(/Pix — valor contado/)));

    // 2) informa o Pix: o backend aponta a diferença e a UI abre a justificativa daquela forma.
    await user.type(within(dialog).getByLabelText(/Pix — valor contado/), "70");
    expect(within(dialog).queryByLabelText(/Justificativa da diferença/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Enviar conferência" }));
    const just = await within(dialog).findByLabelText(/Justificativa da diferença em Pix/);
    expect(within(dialog).getByText(/Há uma diferença de/).textContent?.replace(/\u00a0/g, " ")).toContain("R$ 10,00");
    await waitFor(() => expect(document.activeElement).toBe(just));
    // Só a forma citada pede justificativa.
    expect(within(dialog).queryByLabelText(/Justificativa da diferença em Dinheiro/)).toBeNull();

    // 3) reenvia com a justificativa.
    await user.type(just, "troco devolvido errado");
    await user.click(within(dialog).getByRole("button", { name: "Enviar conferência" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/caixas/5/fechar")).toHaveLength(3));
    const [c1, c2, c3] = mock.callsTo("POST /api/v1/caixas/5/fechar");
    expect(c1!.body).toEqual({ conferencias: [{ forma_pagamento_id: 1, valor_contado: "250.00" }] });
    expect(c2!.body).toEqual({ conferencias: [{ forma_pagamento_id: 1, valor_contado: "250.00" }, { forma_pagamento_id: 2, valor_contado: "70.00" }] });
    expect(c3!.body).toEqual({
      conferencias: [
        { forma_pagamento_id: 1, valor_contado: "250.00" },
        { forma_pagamento_id: 2, valor_contado: "70.00", justificativa: "troco devolvido errado" },
      ],
    });

    // Resultado: esperado, contado e diferença por forma, com o caixa já fechado.
    const result = await screen.findByRole("dialog", { name: "Caixa #5 fechado" });
    const pix = within(result).getByRole("row", { name: /Pix/ });
    expect(within(pix).getByText("R$ 80,00")).toBeTruthy();
    expect(within(pix).getByText("R$ 70,00")).toBeTruthy();
    expect(within(pix).getByText(/Falta/)).toBeTruthy();
    expect(within(within(result).getByRole("row", { name: /Dinheiro/ })).getByText("Sem diferença")).toBeTruthy();
    // O resultado fica na tela mesmo com o caixa atual já inexistente; depois de concluir, oferece abrir outro.
    await user.click(within(result).getByRole("button", { name: "Concluir" }));
    expect(await screen.findByRole("heading", { name: "Abrir caixa" })).toBeTruthy();
  });

  it("valor contado inválido não é enviado", async () => {
    const mock = setup();
    mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
    const { user } = renderApp("/caixa");
    await user.click(await screen.findByRole("button", { name: "Fechar caixa" }));
    const dialog = await screen.findByRole("dialog", { name: "Fechar caixa" });
    await user.type(await within(dialog).findByLabelText(/Dinheiro — valor contado/), "12abc");
    await user.click(within(dialog).getByRole("button", { name: "Enviar conferência" }));
    expect(await within(dialog).findByText("Informe um valor válido, como 150,00.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/caixas/5/fechar")).toHaveLength(0);
  });

  it("sem caixa.operar a tela /caixa é negada", async () => {
    setup();
    signInAs("atendente");
    renderApp("/caixa");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
  });
});

describe("Histórico de caixas", () => {
  const RESUMO = { id: 9, operador: { id: 2, nome: "Bruno Lima" }, status: "fechado", valor_abertura: "80.00", aberto_em: "2026-10-12T12:00:00+00:00", fechado_em: "2026-10-12T22:00:00+00:00" };

  it("lista caixas com filtros na URL e link para o detalhe", async () => {
    const mock = setup("gerente");
    mock.on("GET /api/v1/caixas", json(200, pageOf([RESUMO, { ...RESUMO, id: 10, status: "aberto", fechado_em: null }])));
    const { user } = renderApp("/caixas");

    expect(await screen.findByRole("link", { name: "#9" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "#9" }).getAttribute("href")).toBe("/caixas/9");
    expect(screen.getAllByText("Bruno Lima").length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Situação"), "aberto");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/caixas").some((c) => c.query.get("status") === "aberto")).toBe(true));
    await user.click(screen.getByRole("checkbox", { name: "Só os meus caixas" }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/caixas").some((c) => c.query.get("operador_id") === "1")).toBe(true));
  });

  it("detalhe de caixa fechado: conferência e reabrir com justificativa (caixa.reabrir)", async () => {
    const mock = setup("gerente");
    mock.on(
      "GET /api/v1/caixas/9",
      json(200, caixa({ id: 9, operador: { id: 2, nome: "Bruno Lima" }, status: "fechado", fechado_em: "2026-10-12T22:00:00+00:00", conferencias: [{ forma_pagamento_id: 1, forma: "Dinheiro", valor_esperado: "300.00", valor_contado: "290.00", diferenca: "-10.00", justificativa: "quebra" }] })),
    );
    mock.on("GET /api/v1/caixas/9/movimentos", json(200, pageOf([])));
    let calls = 0;
    mock.on("POST /api/v1/caixas/9/reabrir", () => {
      calls += 1;
      return calls === 1 ? businessError(409, "caixa_ja_aberto", "O operador já tem outro caixa aberto.") : json(200, caixa({ id: 9, operador: { id: 2, nome: "Bruno Lima" } }));
    });
    const { user } = renderApp("/caixas/9");

    expect(await screen.findByRole("heading", { name: /Caixa #9/ })).toBeTruthy();
    expect(await screen.findByText(/Operador: Bruno Lima/)).toBeTruthy();
    expect(screen.getByText("quebra")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reabrir caixa" }));
    const dialog = await screen.findByRole("dialog", { name: "Reabrir caixa #9" });
    await user.type(within(dialog).getByLabelText(/Justificativa/), "faltou lançar uma venda");
    await user.click(within(dialog).getByRole("button", { name: "Reabrir caixa" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("O operador já tem outro caixa aberto.");
    await user.click(within(dialog).getByRole("button", { name: "Reabrir caixa" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/caixas/9/reabrir")).toHaveLength(2));
    expect(mock.callsTo("POST /api/v1/caixas/9/reabrir")[1]!.body).toEqual({ justificativa: "faltou lançar uma venda" });
  });

  it("caixa aberto de outro operador: gerenciar_todos opera; sem a permissão só consulta", async () => {
    const outro = caixa({ id: 10, operador: { id: 2, nome: "Bruno Lima" } });
    // Gerente (caixa.gerenciar_todos) vê as ações.
    const mock = setup("gerente");
    mock.on("GET /api/v1/caixas/10", json(200, outro));
    mock.on("GET /api/v1/caixas/10/movimentos", json(200, pageOf([])));
    renderApp("/caixas/10");
    expect(await screen.findByRole("button", { name: "Fechar caixa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sangria" })).toBeTruthy();
  });

  it("sem caixa.gerenciar_todos, caixa de outro operador não tem ações de operar", async () => {
    const outro = caixa({ id: 10, operador: { id: 2, nome: "Bruno Lima" } });
    const mock = mockApi();
    signInAs("frente", ["caixa.listar"]);
    mock.on("GET /api/v1/caixas/10", json(200, outro));
    mock.on("GET /api/v1/caixas/10/movimentos", json(200, pageOf([])));
    renderApp("/caixas/10");
    expect(await screen.findByRole("heading", { name: /Caixa #10/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar caixa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sangria" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reabrir caixa" })).toBeNull();
  });
});
