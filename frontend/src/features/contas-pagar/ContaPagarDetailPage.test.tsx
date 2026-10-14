import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Permission } from "@/lib/auth/permissions";
import { session } from "@/lib/auth/session";
import { apiError, json } from "@/test/mockFetch";
import { TODAS_AS_PERMISSOES, baixa, detalhe, detalheParcial, renderContasPagar, setup } from "./testSupport";

const GET = "GET /api/v1/contas-pagar/8";
const UUID = /^[0-9a-f-]{36}$/;

beforeEach(() => {
  session.reset("anonymous");
});

/**
 * Abre a página com `conta`. Da segunda leitura em diante a API devolve `depois` (o estado da conta
 * depois de uma ação ou de uma mudança feita por outra pessoa); sem `depois`, segue a mesma conta.
 */
function abrir(conta: Record<string, unknown> = detalhe(), permissoes: Permission[] = TODAS_AS_PERMISSOES, depois?: Record<string, unknown>) {
  const mock = setup(permissoes);
  let leituras = 0;
  mock.on(GET, () => {
    leituras += 1;
    return json(200, leituras > 1 && depois ? depois : conta);
  });
  return { mock, ...renderContasPagar("/contas-pagar/8") };
}

const botao = (nome: string) => screen.queryByRole("button", { name: nome });
/** Texto sem espaço não separável (o Intl usa um entre "R$" e o número). */
const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\u00a0/g, " ");
const valorDe = (rotulo: string) => texto(screen.getByText(rotulo).nextElementSibling);

/** Estados que importam para as ações: aberta sem pagamento, parcial, paga, estornada (aberta de novo) e cancelada. */
const ESTORNADA = detalhe({ baixas: [baixa({ id: 1, estornada: true }), baixa({ id: 2, valor: "-40.00", estorno_de_id: 1, observacao: "Estorno: pagou errado" })] });
const PAGA = detalhe({ status: "pago", situacao: "pago", valor_pago: "100.00", saldo: "0.00", dias_para_vencer: null, pago_em: "2026-10-12", baixas: [baixa({ valor: "100.00" })] });
const CANCELADA = detalhe({ status: "cancelado", situacao: "cancelado", dias_para_vencer: null, cancelado_motivo: "Lançada em duplicidade" });

describe("ContaPagarDetailPage: dados", () => {
  it("mostra fornecedor, categoria, documento, vencimento com a frase de prazo, valores e situação", async () => {
    abrir(detalheParcial({ vencimento: "2026-10-10", situacao: "vencido", dias_para_vencer: -3, observacao: "Ligar antes" }));
    expect(await screen.findByRole("heading", { name: "Conta a pagar #8" })).toBeTruthy();
    expect(screen.getByText("Compra de insumos")).toBeTruthy();
    expect(screen.getByText("Distribuidora Sol")).toBeTruthy();
    expect(screen.getByText("Insumos")).toBeTruthy();
    expect(screen.getByText("NF 1234")).toBeTruthy();
    expect(screen.getByText("10/10/2026")).toBeTruthy();
    expect(screen.getByText("venceu há 3 dias")).toBeTruthy();
    expect(screen.getByText("Vencida")).toBeTruthy();
    expect(screen.getByText("Ligar antes")).toBeTruthy();
    expect(valorDe("Valor original")).toBe("R$ 100,00");
    expect(valorDe("Valor pago")).toBe("R$ 40,00");
    expect(valorDe("Saldo a pagar")).toBe("R$ 60,00");
    expect(screen.getByRole("link", { name: "Contas a pagar" }).getAttribute("href")).toBe("/contas-pagar");
  });

  it("despesa avulsa sem categoria avisa em texto", async () => {
    abrir(detalhe({ fornecedor: null, categoria: null, documento: null }));
    expect(await screen.findByText("Despesa avulsa")).toBeTruthy();
    expect(screen.getByText("Sem categoria")).toBeTruthy();
  });

  it("pagamentos: data, forma, valor, quem registrou e observação; estorno é linha negativa e a baixa estornada é marcada em texto", async () => {
    abrir(detalhe({ valor_pago: "0.00", saldo: "100.00", baixas: ESTORNADA.baixas }));
    const tabela = await screen.findByRole("table", { name: "Pagamentos e estornos da conta" });
    const linhas = within(tabela).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);

    expect(within(linhas[0]!).getByText("12/10/2026")).toBeTruthy();
    expect(within(linhas[0]!).getByText("Pagamento")).toBeTruthy();
    expect(within(linhas[0]!).getByText("Estornado")).toBeTruthy();
    expect(within(linhas[0]!).getByText("Dinheiro")).toBeTruthy();
    expect(within(linhas[0]!).getByText("R$ 40,00")).toBeTruthy();
    expect(within(linhas[0]!).getByText("Ana Souza")).toBeTruthy();

    expect(within(linhas[1]!).getByText("Estorno")).toBeTruthy();
    expect(within(linhas[1]!).getByText(/-R\$\s40,00/)).toBeTruthy();
    expect(within(linhas[1]!).getByText("Estorno: pagou errado")).toBeTruthy();
  });

  it("sem pagamentos mostra o estado vazio", async () => {
    abrir();
    expect(await screen.findByText("Nenhum pagamento registrado")).toBeTruthy();
  });

  it("conta cancelada mostra o motivo e não tem saldo a pagar", async () => {
    abrir(CANCELADA);
    expect(await screen.findByText("Conta cancelada")).toBeTruthy();
    expect(screen.getByText("Lançada em duplicidade")).toBeTruthy();
    expect(valorDe("Saldo a pagar")).toBe("—");
  });

  it("id inválido e conta inexistente mostram erro e não quebram", async () => {
    setup();
    const invalido = renderContasPagar("/contas-pagar/abc");
    expect(await screen.findByText("Conta não encontrada")).toBeTruthy();
    invalido.unmount();

    const mock = setup();
    mock.on(GET, apiError(404, "nao_encontrado", "Conta a pagar não encontrado(a)."));
    renderContasPagar("/contas-pagar/8");
    expect(await screen.findByText("Conta a pagar não encontrado(a).")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("sem contas_pagar.listar a rota mostra acesso negado e não chama a API", async () => {
    const { mock } = abrir(detalhe(), ["contas_pagar.baixar"]);
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});

describe("ContaPagarDetailPage: ações por estado e permissão", () => {
  it("aberta sem pagamento: Pagar, Editar e Cancelar conta; nenhum Estornar", async () => {
    abrir();
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    expect(botao("Pagar")).toBeTruthy();
    expect(botao("Editar")).toBeTruthy();
    expect(botao("Cancelar conta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Estornar/ })).toBeNull();
  });

  it("com pagamento vigente não cancela (estorne antes) e só a baixa vigente tem Estornar", async () => {
    abrir(detalheParcial({ baixas: [baixa({ id: 1 }), baixa({ id: 2, valor: "15.00", estornada: true }), baixa({ id: 3, valor: "-15.00", estorno_de_id: 2 })] }));
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    expect(botao("Pagar")).toBeTruthy();
    expect(botao("Cancelar conta")).toBeNull();
    const estornar = screen.getAllByRole("button", { name: /^Estornar pagamento de/ });
    expect(estornar).toHaveLength(1);
    expect(estornar[0]!.getAttribute("aria-label")).toMatch(/R\$\s40,00/);
  });

  it("aberta de novo depois de estornar tudo: pode cancelar, e o valor segue travado para edição", async () => {
    abrir(ESTORNADA);
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    expect(botao("Cancelar conta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Estornar/ })).toBeNull();
  });

  it("paga: sem Pagar nem Cancelar conta, mas edita e estorna", async () => {
    abrir(PAGA);
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    expect(botao("Pagar")).toBeNull();
    expect(botao("Cancelar conta")).toBeNull();
    expect(botao("Editar")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Estornar pagamento de/ })).toHaveLength(1);
    expect(valorDe("Paga em")).toBe("12/10/2026");
  });

  it("cancelada: nenhuma ação", async () => {
    abrir(CANCELADA);
    await screen.findByText("Conta cancelada");
    for (const nome of ["Pagar", "Editar", "Cancelar conta"]) expect(botao(nome)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Estornar/ })).toBeNull();
  });

  it.each([
    ["só listar", ["contas_pagar.listar"], []],
    ["só baixar", ["contas_pagar.listar", "contas_pagar.baixar"], ["Pagar"]],
    ["só editar", ["contas_pagar.listar", "contas_pagar.editar"], ["Editar"]],
    ["só cancelar (cancela e estorna)", ["contas_pagar.listar", "contas_pagar.cancelar"], ["Cancelar conta", "Estornar pagamento de R$ 40,00 em 12/10/2026"]],
  ] as [string, Permission[], string[]][])("sem as permissões certas os botões somem: %s", async (_nome, permissoes, visiveis) => {
    abrir(detalhe({ valor_pago: "0.00", saldo: "100.00", baixas: [] }), permissoes);
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    const todos = ["Pagar", "Editar", "Cancelar conta"];
    for (const nome of todos) expect(Boolean(botao(nome))).toBe(visiveis.includes(nome));
  });

  it("só cancelar: a baixa vigente tem Estornar", async () => {
    abrir(detalheParcial(), ["contas_pagar.listar", "contas_pagar.cancelar"]);
    await screen.findByRole("heading", { name: "Conta a pagar #8" });
    expect(screen.getAllByRole("button", { name: /^Estornar pagamento de/ })).toHaveLength(1);
    expect(botao("Pagar")).toBeNull();
    expect(botao("Editar")).toBeNull();
  });
});

describe("ContaPagarDetailPage: pagar", () => {
  it("pagamento parcial: corpo com valor string, forma e chave; a tela mostra a conta devolvida", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, detalheParcial());
    mock.on("POST /api/v1/contas-pagar/8/baixas", json(201, detalheParcial()));
    await user.click(await screen.findByRole("button", { name: "Pagar" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar pagamento" });
    const valor = within(dialog).getByLabelText(/^Valor pago/);
    await user.clear(valor);
    await user.type(valor, "40");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/contas-pagar/8/baixas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/contas-pagar/8/baixas")[0]!.body).toEqual({ valor: "40.00", forma_pagamento_id: 1, chave: expect.stringMatching(UUID) });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registrar pagamento" })).toBeNull());
    expect(await screen.findByText("Pagamento registrado.")).toBeTruthy();
  });

  it("pagamento total: o valor já vem com o saldo", async () => {
    const { mock, user } = abrir(detalheParcial(), TODAS_AS_PERMISSOES, PAGA);
    mock.on("POST /api/v1/contas-pagar/8/baixas", json(201, PAGA));
    await user.click(await screen.findByRole("button", { name: "Pagar" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar pagamento" });
    expect((within(dialog).getByLabelText(/^Valor pago/) as HTMLInputElement).value).toBe("60,00");
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/contas-pagar/8/baixas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/contas-pagar/8/baixas")[0]!.body).toEqual({ valor: "60.00", forma_pagamento_id: 2, chave: expect.stringMatching(UUID) });
  });

  it("valor_acima_do_saldo: mostra a mensagem, recarrega a conta e o diálogo passa a mostrar o saldo novo", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, detalheParcial());
    mock.on("POST /api/v1/contas-pagar/8/baixas", apiError(409, "valor_acima_do_saldo", "O valor passa do saldo da conta (60.00)."));
    await user.click(await screen.findByRole("button", { name: "Pagar" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar pagamento" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    expect(await within(dialog).findByText("O valor passa do saldo da conta (60.00).")).toBeTruthy();
    await waitFor(() => expect(mock.callsTo(GET).length).toBeGreaterThanOrEqual(2));
    // O saldo exibido no diálogo e na página é o recarregado.
    await waitFor(() => expect(texto(dialog)).toContain("saldo R$ 60,00"));
    expect(valorDe("Saldo a pagar")).toBe("R$ 60,00");
  });

  it("titulo_nao_aberto: mostra a mensagem, recarrega e bloqueia novo envio", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, PAGA);
    mock.on("POST /api/v1/contas-pagar/8/baixas", apiError(409, "titulo_nao_aberto", "A conta a pagar está pago."));
    await user.click(await screen.findByRole("button", { name: "Pagar" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar pagamento" });
    await user.selectOptions(await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    expect(await within(dialog).findByText("A conta a pagar está pago.")).toBeTruthy();
    expect(await within(dialog).findByText("A conta não está mais em aberto")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Confirmar pagamento" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.callsTo(GET).length).toBeGreaterThanOrEqual(2);
  });
});

describe("ContaPagarDetailPage: cancelar", () => {
  it("pede o motivo (mínimo de 3 caracteres) e envia só { motivo }", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, CANCELADA);
    mock.on("POST /api/v1/contas-pagar/8/cancelar", json(200, CANCELADA));
    await user.click(await screen.findByRole("button", { name: "Cancelar conta" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar conta" });

    await user.type(within(dialog).getByLabelText(/^Motivo do cancelamento/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/contas-pagar/8/cancelar")).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/^Motivo do cancelamento/));
    await user.type(within(dialog).getByLabelText(/^Motivo do cancelamento/), "  Lançada em duplicidade ");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/contas-pagar/8/cancelar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/contas-pagar/8/cancelar")[0]!.body).toEqual({ motivo: "Lançada em duplicidade" });
    expect(await screen.findByText("Conta cancelada.")).toBeTruthy();
    // A página passa a mostrar a conta cancelada devolvida pela API.
    expect(await screen.findByText("Conta cancelada")).toBeTruthy();
    expect(botao("Pagar")).toBeNull();
  });

  it("titulo_com_baixas (alguém pagou antes): mostra a mensagem e recarrega a conta", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, detalheParcial());
    mock.on("POST /api/v1/contas-pagar/8/cancelar", apiError(409, "titulo_com_baixas", "Há pagamentos lançados nesta conta: estorne-os antes de cancelar."));
    await user.click(await screen.findByRole("button", { name: "Cancelar conta" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar conta" });
    await user.type(within(dialog).getByLabelText(/^Motivo do cancelamento/), "Não vou pagar");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));

    expect(await within(dialog).findByText("Há pagamentos lançados nesta conta: estorne-os antes de cancelar.")).toBeTruthy();
    await waitFor(() => expect(mock.callsTo(GET).length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(valorDe("Valor pago")).toBe("R$ 40,00"));
  });
});

describe("ContaPagarDetailPage: estornar", () => {
  const ROTA = "POST /api/v1/contas-pagar/8/baixas/1/estornar";

  it("pede o motivo e estorna a baixa escolhida", async () => {
    const { mock, user } = abrir(detalheParcial(), TODAS_AS_PERMISSOES, ESTORNADA);
    mock.on(ROTA, json(200, ESTORNADA));
    await user.click(await screen.findByRole("button", { name: /^Estornar pagamento de R\$\s40,00/ }));
    const dialog = await screen.findByRole("dialog", { name: "Estornar pagamento" });
    expect(dialog.textContent).toContain("Dinheiro");

    await user.click(within(dialog).getByRole("button", { name: "Estornar pagamento" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo(ROTA)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Motivo do estorno/), "Pagou em duplicidade");
    await user.click(within(dialog).getByRole("button", { name: "Estornar pagamento" }));
    await waitFor(() => expect(mock.callsTo(ROTA)).toHaveLength(1));
    expect(mock.callsTo(ROTA)[0]!.body).toEqual({ motivo: "Pagou em duplicidade" });
    expect(await screen.findByText("Pagamento estornado.")).toBeTruthy();
    // A conta devolvida mostra a baixa estornada e o estorno em linha negativa.
    expect(await screen.findByText("Estornado")).toBeTruthy();
    expect(valorDe("Valor pago")).toBe("R$ 0,00");
  });

  it("baixa_ja_estornada: mostra a mensagem do backend e recarrega", async () => {
    const { mock, user } = abrir(detalheParcial(), TODAS_AS_PERMISSOES, ESTORNADA);
    mock.on(ROTA, apiError(409, "baixa_ja_estornada", "O pagamento #1 já foi estornado."));
    await user.click(await screen.findByRole("button", { name: /^Estornar pagamento de/ }));
    const dialog = await screen.findByRole("dialog", { name: "Estornar pagamento" });
    await user.type(within(dialog).getByLabelText(/^Motivo do estorno/), "Engano");
    await user.click(within(dialog).getByRole("button", { name: "Estornar pagamento" }));

    expect(await within(dialog).findByText("O pagamento #1 já foi estornado.")).toBeTruthy();
    await waitFor(() => expect(mock.callsTo(GET).length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Estornar pagamento de/ })).toBeNull());
  });
});

describe("ContaPagarDetailPage: editar", () => {
  it("edita pelo diálogo e a página mostra o que a API devolveu", async () => {
    const { mock, user } = abrir(detalhe(), TODAS_AS_PERMISSOES, detalhe({ descricao: "Compra de verduras" }));
    mock.on("PATCH /api/v1/contas-pagar/8", json(200, detalhe({ descricao: "Compra de verduras" })));
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar conta #8" });
    const descricao = within(dialog).getByLabelText(/^Descrição/);
    await user.clear(descricao);
    await user.type(descricao, "Compra de verduras");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/contas-pagar/8")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/contas-pagar/8")[0]!.body).toEqual({ descricao: "Compra de verduras" });
    expect(await screen.findByRole("heading", { name: "Conta a pagar #8" })).toBeTruthy();
    expect(await screen.findByText("Conta atualizada.")).toBeTruthy();
  });
});
