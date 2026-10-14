import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";
import { businessError, caixa, comanda, FORMAS, item, pageOf, pessoa, produto, signInAs, totais, venda } from "./fixtures";

const SALDO = { pessoa_id: 20, saldo_aberto: "50.00", titulos_abertos: 1, aceita_fiado: true, limite_fiado: "200.00", limite_disponivel: "150.00" };

function setup(perfil: Parameters<typeof signInAs>[0] = "frente", c = comanda(), extra: Parameters<typeof signInAs>[1] = []) {
  const mock = mockApi();
  signInAs(perfil, extra);
  mock.on("GET /api/v1/comandas/12", () => json(200, c));
  mock.on("GET /api/v1/categorias", json(200, []));
  mock.on("GET /api/v1/produtos", json(200, pageOf([produto()], { limite: 100 })));
  mock.on("GET /api/v1/formas-pagamento", json(200, FORMAS));
  mock.on("GET /api/v1/caixas/atual", json(200, caixa()));
  mock.on("GET /api/v1/pessoas", json(200, pageOf([pessoa()])));
  mock.on("GET /api/v1/pessoas/20/saldo-aberto", json(200, SALDO));
  return mock;
}

async function openDialog(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Fechar conta" }));
  return screen.findByRole("dialog", { name: "Fechar conta" });
}

const confirm = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /Confirmar fechamento|Confirmar com estoque negativo|Fechar sem pagamento/ }) as HTMLButtonElement;
const linha = (dialog: HTMLElement, n: number) => within(dialog).getByRole("group", { name: `Pagamento ${n}` });

beforeEach(() => {
  session.reset("anonymous");
});

describe("Fechar conta", () => {
  it("mostra o total da API e botões de pagamento rápido; fiado só para quem tem vendas.fiado", async () => {
    setup("frente");
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);

    expect(within(dialog).getAllByText("R$ 19,80").length).toBeGreaterThan(0);
    expect(await within(dialog).findByRole("button", { name: "Pagar tudo em Dinheiro" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Pagar tudo em Pix" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Pagar tudo em Fiado" })).toBeNull();
    expect(confirm(dialog).disabled).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: "Adicionar pagamento" }));
    const formaOptions = within(within(linha(dialog, 1)).getByRole("combobox", { name: /Forma/ })).getAllByRole("option").map((o) => o.textContent);
    expect(formaOptions).toEqual(["Selecione…", "Dinheiro", "Pix", "Cartão de crédito"]);
  });

  it("gerente (vendas.fiado) vê a forma Fiado", async () => {
    setup("gerente");
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    expect(await within(dialog).findByRole("button", { name: "Pagar tudo em Fiado" })).toBeTruthy();
  });

  it("dinheiro com valor recebido: troco previsto na tela e strings decimais corretas no envio", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda({ troco_total: "30.20", pagamentos: [{ id: 1, forma_pagamento_id: 1, forma: "Dinheiro", tipo: "dinheiro", valor: "19.80", valor_recebido: "50.00", troco: "30.20", parcelas: null, observacao: null }] })));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Dinheiro" }));
    expect((within(linha(dialog, 1)).getByLabelText(/^Valor \(R\$\)/) as HTMLInputElement).value).toBe("19,80");
    expect(within(dialog).getByText("Total coberto")).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(false);

    await user.type(within(linha(dialog, 1)).getByLabelText(/Valor recebido/), "50");
    expect(within(linha(dialog, 1)).getByText("R$ 30,20")).toBeTruthy();
    expect(within(dialog).getAllByText(/prévia/i).length).toBeGreaterThan(0);

    await user.click(confirm(dialog));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")[0]!.body).toEqual({ pagamentos: [{ forma_pagamento_id: 1, valor: "19.80", valor_recebido: "50.00" }] });

    // Sucesso: venda, total e TROCO vindos da API.
    const done = await screen.findByRole("dialog", { name: "Venda #31 concluída" });
    expect(within(done).getByText("Total da venda")).toBeTruthy();
    expect(within(done).getByText("R$ 30,20")).toBeTruthy();
    expect(within(done).getByText("Troco")).toBeTruthy();
    expect(within(done).getByRole("link", { name: "Ver venda" }).getAttribute("href")).toBe("/vendas/31");
  });

  it("recibo da venda concluída: imprimir usa window.print", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda()));
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    await user.click(confirm(dialog));

    const done = await screen.findByRole("dialog", { name: "Venda #31 concluída" });
    await user.click(within(done).getByRole("button", { name: "Imprimir recibo" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(within(screen.getByTestId("print-root")).getByText("Recibo de venda #31")).toBeTruthy();
  });

  it("dividir por valor: a prévia mostra quanto falta e só habilita confirmar quando a soma bate", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda()));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Adicionar pagamento" }));
    await user.selectOptions(within(linha(dialog, 1)).getByRole("combobox", { name: /Forma/ }), "2");
    await user.type(within(linha(dialog, 1)).getByLabelText(/^Valor \(R\$\)/), "10");
    expect(within(dialog).getByText("Falta cobrir (prévia)")).toBeTruthy();
    expect(within(dialog).getAllByText("R$ 9,80").length).toBeGreaterThan(0);
    expect(confirm(dialog).disabled).toBe(true);

    // A segunda linha já nasce com o que falta.
    await user.click(within(dialog).getByRole("button", { name: "Dividir por valor (outra forma)" }));
    expect((within(linha(dialog, 2)).getByLabelText(/^Valor \(R\$\)/) as HTMLInputElement).value).toBe("9,80");
    await user.selectOptions(within(linha(dialog, 2)).getByRole("combobox", { name: /Forma/ }), "1");
    expect(within(dialog).getByText("Total coberto")).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(false);

    await user.click(confirm(dialog));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")[0]!.body).toEqual({
      pagamentos: [
        { forma_pagamento_id: 2, valor: "10.00" },
        { forma_pagamento_id: 1, valor: "9.80" },
      ],
    });
  });

  it("pagamento acima do total mostra o excesso e bloqueia a confirmação", async () => {
    setup("frente");
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Adicionar pagamento" }));
    await user.selectOptions(within(linha(dialog, 1)).getByRole("combobox", { name: /Forma/ }), "2");
    await user.type(within(linha(dialog, 1)).getByLabelText(/^Valor \(R\$\)/), "25");
    expect(within(dialog).getByText("Excede o total em")).toBeTruthy();
    expect(within(dialog).getAllByText("R$ 5,20").length).toBeGreaterThan(0);
    expect(confirm(dialog).disabled).toBe(true);
  });

  it("valor recebido menor que o valor pago é recusado; só dinheiro tem valor recebido; só crédito tem parcelas", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda()));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Dinheiro" }));
    await user.type(within(linha(dialog, 1)).getByLabelText(/Valor recebido/), "10");
    expect(within(linha(dialog, 1)).getByText("O valor recebido é menor que o valor pago.")).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(true);

    await user.selectOptions(within(linha(dialog, 1)).getByRole("combobox", { name: /Forma/ }), "2");
    expect(within(linha(dialog, 1)).queryByLabelText(/Valor recebido/)).toBeNull();
    expect(within(linha(dialog, 1)).queryByLabelText(/Parcelas/)).toBeNull();

    await user.selectOptions(within(linha(dialog, 1)).getByRole("combobox", { name: /Forma/ }), "3");
    await user.type(within(linha(dialog, 1)).getByLabelText(/Parcelas/), "3");
    expect(confirm(dialog).disabled).toBe(false);
    await user.click(confirm(dialog));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")[0]!.body).toEqual({ pagamentos: [{ forma_pagamento_id: 3, valor: "19.80", parcelas: 3 }] });
  });

  it("fiado: exige cliente (busca), mostra limite da API e envia cliente_id", async () => {
    const mock = setup("gerente");
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda({ cliente: { id: 20, nome: "Carlos Lima" }, troco_total: "0.00", pagamentos: [{ id: 2, forma_pagamento_id: 4, forma: "Fiado", tipo: "fiado", valor: "19.80", valor_recebido: null, troco: null, parcelas: null, observacao: null }] })));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);

    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Fiado" }));
    expect(within(dialog).getByText("Informe o cliente para vender em fiado.")).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(true);

    await user.type(within(dialog).getByRole("searchbox", { name: /buscar por nome/ }), "Carl");
    await user.click(await within(dialog).findByRole("button", { name: /Carlos Lima/ }));
    expect(await within(dialog).findByText(/limite disponível/)).toBeTruthy();
    expect(within(dialog).getByText("R$ 150,00")).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(false);

    await user.click(confirm(dialog));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")[0]!.body).toEqual({ pagamentos: [{ forma_pagamento_id: 4, valor: "19.80" }], cliente_id: 20 });
    const search = mock.callsTo("GET /api/v1/pessoas")[0]!.query;
    expect(search.get("q")).toBe("Carl");
    expect(search.get("papel")).toBe("cliente");
  });

  it("limite_fiado_excedido: mostra a mensagem do backend e orienta usar outra forma", async () => {
    const mock = setup("gerente");
    mock.on("POST /api/v1/comandas/12/fechar", businessError(409, "limite_fiado_excedido", "Carlos Lima tem 190.00 em aberto; mais 19.80 passa do limite de 200.00."));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Fiado" }));
    await user.type(within(dialog).getByRole("searchbox", { name: /buscar por nome/ }), "Carl");
    await user.click(await within(dialog).findByRole("button", { name: /Carlos Lima/ }));
    await user.click(confirm(dialog));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("passa do limite de 200.00");
    expect(alert.textContent).toContain("outra forma de pagamento");
  });

  it("cadastro rápido de cliente só aparece com pessoas.cadastro_rapido e avisa que não habilita fiado", async () => {
    const mock = setup("gerente");
    mock.on("POST /api/v1/pessoas/rapido", json(201, pessoa({ id: 21, nome: "Maria", cliente: { aceita_fiado: false, limite_fiado: "0.00" } })));
    mock.on("GET /api/v1/pessoas/21/saldo-aberto", json(200, { ...SALDO, pessoa_id: 21, aceita_fiado: false, limite_fiado: "0.00", limite_disponivel: null }));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Fiado" }));

    await user.click(within(dialog).getByRole("button", { name: "Cadastro rápido de cliente" }));
    expect(within(dialog).getByText(/não habilita o cliente para fiado/)).toBeTruthy();
    await user.type(within(dialog).getByLabelText("Nome do novo cliente"), "Maria");
    await user.type(within(dialog).getByLabelText("Telefone do novo cliente"), "11988887777");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/pessoas/rapido")[0]?.body).toEqual({ nome: "Maria", telefone: "11988887777" }));
    expect(await within(dialog).findByText(/Maria não está habilitado para fiado/)).toBeTruthy();
  });

  it("sem pessoas.cadastro_rapido não há cadastro rápido", async () => {
    setup("atendente", comanda(), ["comandas.fechar", "formas_pagamento.listar"]);
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await within(dialog).findByRole("button", { name: "Pagar tudo em Dinheiro" });
    expect(within(dialog).queryByRole("button", { name: "Cadastro rápido de cliente" })).toBeNull();
  });

  it("pagamento_diferente_do_total: mostra total e informado formatados e recarrega a comanda", async () => {
    const mock = setup("frente");
    // Formato real do backend: `detalhes` é objeto (não a lista de campos da validação).
    mock.on("POST /api/v1/comandas/12/fechar", businessError(422, "pagamento_diferente_do_total", "Os pagamentos somam 19.00 e o total da comanda é 19.80.", { total: "19.80", informado: "19.00" }));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    const before = mock.callsTo("GET /api/v1/comandas/12").length;
    await user.click(confirm(dialog));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent?.replace(/\u00a0/g, " ")).toContain("Os pagamentos somam R$ 19,00 e o total da comanda é R$ 19,80.");
    expect(alert.textContent).toContain("O total pode ter mudado");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/comandas/12").length).toBeGreaterThan(before));
  });

  it("estoque_insuficiente sem estoque.permitir_negativo: mostra o produto e não oferece autorização", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", businessError(409, "estoque_insuficiente", "Estoque insuficiente de Chopp 300ml: saldo 1.000, necessário 2.000.", { produto_id: 7, saldo: "1.000", necessario: "2.000" }));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    await user.click(confirm(dialog));

    expect(await within(dialog).findByText("Estoque insuficiente")).toBeTruthy();
    expect(within(dialog).getByText("Chopp 300ml")).toBeTruthy();
    expect(within(dialog).getByText(/não tem permissão para autorizar estoque negativo/)).toBeTruthy();
    expect(within(dialog).queryByRole("checkbox", { name: /Autorizar estoque negativo/ })).toBeNull();
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1);
  });

  it("estoque_insuficiente com a permissão: autoriza com justificativa e reenvia as mesmas linhas", async () => {
    const mock = setup("gerente");
    let calls = 0;
    mock.on("POST /api/v1/comandas/12/fechar", () => {
      calls += 1;
      return calls === 1 ? businessError(409, "estoque_insuficiente", "Estoque insuficiente de Chopp 300ml: saldo 1.000, necessário 2.000.", { produto_id: 7, saldo: "1.000", necessario: "2.000" }) : json(201, venda());
    });
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);

    // Antes do erro não há opção de estoque negativo.
    expect(within(dialog).queryByRole("checkbox", { name: /Autorizar estoque negativo/ })).toBeNull();
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    await user.click(confirm(dialog));
    await user.click(await within(dialog).findByRole("checkbox", { name: /Autorizar estoque negativo/ }));
    // Sem justificativa não confirma.
    expect(confirm(dialog).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/Justificativa do estoque negativo/), "contagem atrasada");
    expect(confirm(dialog).textContent).toContain("Confirmar com estoque negativo");
    await user.click(confirm(dialog));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(2));
    const [first, second] = mock.callsTo("POST /api/v1/comandas/12/fechar");
    expect(first!.body).toEqual({ pagamentos: [{ forma_pagamento_id: 2, valor: "19.80" }] });
    expect(second!.body).toEqual({ pagamentos: [{ forma_pagamento_id: 2, valor: "19.80" }], permitir_estoque_negativo: true, justificativa_estoque: "contagem atrasada" });
    expect(await screen.findByRole("dialog", { name: "Venda #31 concluída" })).toBeTruthy();
  });

  it("sem caixa aberto: avisa, aponta para /caixa e bloqueia a confirmação", async () => {
    const mock = setup("frente");
    mock.on("GET /api/v1/caixas/atual", json(404, { erro: { codigo: "nao_encontrado", mensagem: "Caixa aberto não encontrado(a)." } }));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));

    expect(await within(dialog).findByText("Você não tem caixa aberto")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Ir para o Caixa" }).getAttribute("href")).toBe("/caixa");
    expect(confirm(dialog).disabled).toBe(true);
  });

  it("caixa_fechado devolvido pelo backend também orienta abrir o caixa", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", businessError(409, "caixa_fechado", "Abra o seu caixa antes de receber valores."));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    await user.click(confirm(dialog));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Abra o seu caixa antes de receber valores.");
    expect(within(alert).getByRole("link", { name: "Abrir o caixa" }).getAttribute("href")).toBe("/caixa");
  });

  it("comanda de valor zero fecha sem pagamentos", async () => {
    const mock = setup("frente", comanda({ itens: [item({ preco_unitario: "0.00", total: "0.00" })], totais: totais() }));
    mock.on("POST /api/v1/comandas/12/fechar", json(201, venda({ total: "0.00", troco_total: "0.00", pagamentos: [] })));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    expect(within(dialog).getByText(/sem valor a pagar/)).toBeTruthy();
    await user.click(await within(dialog).findByRole("button", { name: "Fechar sem pagamento" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/fechar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/fechar")[0]!.body).toEqual({ pagamentos: [] });
  });

  it("sem formas_pagamento.listar não dá para registrar pagamentos e o usuário é avisado", async () => {
    setup("atendente", comanda(), ["comandas.fechar"]);
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    expect(within(dialog).getByText(/não tem permissão para listar as formas de pagamento/)).toBeTruthy();
    expect(confirm(dialog).disabled).toBe(true);
  });

  it("fechar a mesma comanda de novo (comanda_nao_aberta) mostra a mensagem e recarrega", async () => {
    const mock = setup("frente");
    mock.on("POST /api/v1/comandas/12/fechar", businessError(409, "comanda_nao_aberta", "A comanda #12 está fechada."));
    const { user } = renderApp("/comandas/12");
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "Pagar tudo em Pix" }));
    const before = mock.callsTo("GET /api/v1/comandas/12").length;
    await user.click(confirm(dialog));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("A comanda #12 está fechada.");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/comandas/12").length).toBeGreaterThan(before));
  });
});
