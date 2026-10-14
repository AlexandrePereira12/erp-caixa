import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";
import { businessError, comanda, item, kg, mesaMapa, produto, signInAs, totais } from "./fixtures";

const CATEGORIAS = [{ id: 1, nome: "Bebidas", descricao: null, ativo: true }];

/** Mock da API com a comanda como estado: as mutações trocam `state.current`, como o backend faria. */
function setup(initial = comanda(), perfil: Parameters<typeof signInAs>[0] = "frente") {
  const mock = mockApi();
  signInAs(perfil);
  const state = { current: initial as ReturnType<typeof comanda> };
  mock.on("GET /api/v1/comandas/12", () => json(200, state.current));
  mock.on("GET /api/v1/categorias", json(200, CATEGORIAS));
  mock.on("GET /api/v1/produtos", json(200, { itens: [produto(), kg], total: 2, limite: 100, deslocamento: 0 }));
  mock.on("GET /api/v1/produtos/7", json(200, produto()));
  mock.on("GET /api/v1/produtos/9", json(200, kg));
  mock.on("GET /api/v1/mesas/mapa", json(200, [mesaMapa({ id: 1, nome: "Mesa 1" }), mesaMapa({ id: 2, nome: "Mesa 2", status: "ocupada" }), mesaMapa({ id: 6, nome: "Mesa 6" })]));
  return { mock, state };
}

const totalsBox = () => screen.getByRole("region", { name: "Totais da comanda" });

beforeEach(() => {
  session.reset("anonymous");
});

describe("ComandaPage", () => {
  it("mostra cabeçalho, itens e os totais exatamente como a API devolveu", async () => {
    setup(comanda({ totais: totais({ subtotal: "18.00", desconto: "1.00", acrescimo: "2.00", taxa_servico: "1.90", total: "20.90" }) }));
    renderApp("/comandas/12");

    expect(await screen.findByRole("heading", { name: /Comanda #12/ })).toBeTruthy();
    expect(screen.getByText("Aberta")).toBeTruthy();
    expect(screen.getByText(/Chopp 300ml/)).toBeTruthy();
    const box = totalsBox();
    // O frontend só exibe: nenhuma conta é feita aqui.
    expect(within(box).getByText("R$ 18,00")).toBeTruthy();
    expect(within(box).getByText("− R$ 1,00")).toBeTruthy();
    expect(within(box).getByText("R$ 2,00")).toBeTruthy();
    expect(within(box).getByText("R$ 1,90")).toBeTruthy();
    expect(within(box).getByText("R$ 20,90")).toBeTruthy();
    expect(within(box).getByText(/Taxa de serviço \(10%\)/)).toBeTruthy();
  });

  it("toque no produto lança quantidade 1 e o total passa a ser o da resposta da API", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/itens", () => {
      state.current = comanda({
        itens: [item(), item({ id: 101, quantidade: "1.000", total: "9.00" })],
        totais: totais({ subtotal: "27.00", taxa_servico: "2.70", total: "29.70" }),
      });
      return json(201, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: /Adicionar Chopp 300ml/ }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")[0]!.body).toEqual({ produto_id: 7, quantidade: "1" });
    expect(await within(totalsBox()).findByText("R$ 29,70")).toBeTruthy();
    expect(screen.getAllByText(/Chopp 300ml/).length).toBeGreaterThan(1);
  });

  it("toques repetidos viram lançamentos separados, enviados em fila e na ordem", async () => {
    const { mock, state } = setup();
    let n = 0;
    mock.on("POST /api/v1/comandas/12/itens", () => {
      n += 1;
      state.current = comanda({ itens: [item(), ...Array.from({ length: n }, (_, i) => item({ id: 200 + i, quantidade: "1.000", total: "9.00" }))], totais: totais({ total: `${18 + 9 * n}.00` }) });
      return json(201, state.current);
    });
    const { user } = renderApp("/comandas/12");

    const tile = await screen.findByRole("button", { name: /Adicionar Chopp 300ml/ });
    await user.click(tile);
    await user.click(tile);

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(2));
    expect(await within(totalsBox()).findByText("R$ 36,00")).toBeTruthy();
  });

  it("produto fracionado (KG): quantidade e observação com a escala da unidade", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/itens", () => {
      state.current = comanda({ itens: [item(), item({ id: 102, produto_id: 9, descricao: "Picanha por kg", quantidade: "0.350", preco_unitario: "89.90", total: "31.47", observacao: "ao ponto" })] });
      return json(201, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: /Quantidade e observação de Picanha por kg/ }));
    const dialog = await screen.findByRole("dialog", { name: "Picanha por kg" });
    const qtd = within(dialog).getByRole("textbox", { name: "Quantidade" });
    await user.clear(qtd);
    await user.type(qtd, "0,3501");
    await user.type(within(dialog).getByLabelText("Observação"), "ao ponto");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    // 4 casas: a unidade KG aceita 3.
    expect(await within(dialog).findByText(/até 3 casa/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(0);

    await user.clear(qtd);
    await user.type(qtd, "0,35");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")[0]!.body).toEqual({ produto_id: 9, quantidade: "0.35", observacao: "ao ponto" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Picanha por kg" })).toBeNull());
  });

  it("cancelar item exige motivo de 3+ caracteres e mostra o item riscado com o motivo", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/itens/100/cancelar", () => {
      state.current = comanda({ itens: [item({ status: "cancelado", cancelado_motivo: "cliente desistiu" })], totais: totais() });
      return json(200, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Cancelar Chopp 300ml" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar item" });
    await user.type(within(dialog).getByLabelText(/Motivo do cancelamento/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar item" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/comandas/12/itens/100/cancelar")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Motivo do cancelamento/), "c");
    await user.clear(within(dialog).getByLabelText(/Motivo do cancelamento/));
    await user.type(within(dialog).getByLabelText(/Motivo do cancelamento/), "cliente desistiu");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar item" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens/100/cancelar")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/itens/100/cancelar")[0]!.body).toEqual({ motivo: "cliente desistiu" });
    expect(await screen.findByText("Cancelado")).toBeTruthy();
    expect(screen.getByText("cliente desistiu")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar Chopp 300ml" })).toBeNull();
  });

  it("cancelamento_exige_gerente: mostra a mensagem do backend e orienta chamar um gerente", async () => {
    const { mock } = setup();
    mock.on("POST /api/v1/comandas/12/itens/100/cancelar", businessError(403, "cancelamento_exige_gerente", "Este item só pode ser cancelado por um gerente (prazo esgotado)."));
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Cancelar Chopp 300ml" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar item" });
    await user.type(within(dialog).getByLabelText(/Motivo do cancelamento/), "erro de lançamento");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar item" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Este item só pode ser cancelado por um gerente");
    expect(alert.textContent).toContain("Peça a um gerente");
    // O diálogo continua aberto e o item segue ativo.
    expect(screen.getByRole("dialog", { name: "Cancelar item" })).toBeTruthy();
  });

  it("desconto: envia strings decimais e atualiza os totais com a resposta da API", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/ajustes", () => {
      state.current = comanda({
        ajustes: [{ id: 1, tipo: "desconto", modo: "valor", valor: "5.00", valor_calculado: "5.00", justificativa: "cliente fiel", criado_por: 1, removido: false }],
        totais: totais({ subtotal: "18.00", desconto: "5.00", taxa_servico: "1.30", total: "14.30" }),
      });
      return json(201, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Desconto / acréscimo" }));
    const dialog = await screen.findByRole("dialog", { name: "Desconto ou acréscimo" });
    await user.click(within(dialog).getByRole("radio", { name: "Valor (R$)" }));
    await user.type(within(dialog).getByRole("textbox", { name: /Valor \(R\$\)/ }), "5");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "cliente fiel");
    await user.click(within(dialog).getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/ajustes")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/ajustes")[0]!.body).toEqual({ tipo: "desconto", modo: "valor", valor: "5.00", justificativa: "cliente fiel" });
    expect(await within(totalsBox()).findByText("R$ 14,30")).toBeTruthy();
    expect(screen.getByText("cliente fiel")).toBeTruthy();
  });

  it("desconto_acima_do_limite: mostra o erro de limite e orienta pedir a um gerente", async () => {
    const { mock } = setup();
    mock.on("POST /api/v1/comandas/12/ajustes", businessError(403, "desconto_acima_do_limite", "Desconto total de 50.00% passa do seu limite de 5.00%. Peça a um gerente."));
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Desconto / acréscimo" }));
    const dialog = await screen.findByRole("dialog", { name: "Desconto ou acréscimo" });
    await user.type(within(dialog).getByRole("textbox", { name: /Percentual/ }), "50");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "amigo da casa");
    await user.click(within(dialog).getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/ajustes")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/ajustes")[0]!.body).toEqual({ tipo: "desconto", modo: "percentual", valor: "50.00", justificativa: "amigo da casa" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("passa do seu limite de 5.00%");
    expect(alert.textContent).toContain("Peça a um gerente");
  });

  it("percentual acima de 100 é barrado no formulário", async () => {
    const { mock } = setup();
    const { user } = renderApp("/comandas/12");
    await user.click(await screen.findByRole("button", { name: "Desconto / acréscimo" }));
    const dialog = await screen.findByRole("dialog", { name: "Desconto ou acréscimo" });
    await user.type(within(dialog).getByRole("textbox", { name: /Percentual/ }), "120");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "teste");
    await user.click(within(dialog).getByRole("button", { name: "Aplicar" }));
    expect(await within(dialog).findByText("O percentual não pode passar de 100.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/comandas/12/ajustes")).toHaveLength(0);
  });

  it("pedir conta trava a edição dos itens e reabrir libera de novo", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/pedir-conta", () => {
      state.current = comanda({ status: "aguardando_pagamento" });
      return json(200, state.current);
    });
    mock.on("POST /api/v1/comandas/12/reabrir", () => {
      state.current = comanda();
      return json(200, state.current);
    });
    const { user } = renderApp("/comandas/12");

    expect(await screen.findByRole("button", { name: "Editar Chopp 300ml" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pedir conta" }));

    expect(await screen.findByText("Conta pedida: itens travados")).toBeTruthy();
    expect(screen.getByText("Aguardando pagamento")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar Chopp 300ml" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar Chopp 300ml" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Lista de produtos" })).toBeNull();
    // Desconto e fechamento continuam disponíveis com a conta pedida.
    expect(screen.getByRole("button", { name: "Desconto / acréscimo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar conta" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reabrir comanda" }));
    expect(await screen.findByRole("button", { name: "Editar Chopp 300ml" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pedir conta" })).toBeTruthy();
  });

  it("comanda fechada é somente leitura e aponta para a venda", async () => {
    setup(comanda({ status: "fechada", fechada_em: "2026-10-13T15:00:00+00:00", venda_id: 31 }));
    renderApp("/comandas/12");

    expect(await screen.findByText(/somente leitura/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver venda #31" }).getAttribute("href")).toBe("/vendas/31");
    expect(screen.queryByRole("button", { name: "Editar Chopp 300ml" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar conta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pedir conta" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Lista de produtos" })).toBeNull();
  });

  it("comanda cancelada mostra o motivo", async () => {
    setup(comanda({ status: "cancelada", cancelada_motivo: "cliente foi embora", fechada_em: "2026-10-13T15:00:00+00:00" }));
    renderApp("/comandas/12");
    expect(await screen.findByText(/Motivo: cliente foi embora/)).toBeTruthy();
  });

  it("editar item só deixa aumentar a quantidade e envia string decimal", async () => {
    const { mock, state } = setup();
    mock.on("PATCH /api/v1/comandas/12/itens/100", () => {
      state.current = comanda({ itens: [item({ quantidade: "3.000", total: "27.00" })], totais: totais({ total: "29.70" }) });
      return json(200, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Editar Chopp 300ml" }));
    const dialog = await screen.findByRole("dialog", { name: /Editar Chopp 300ml/ });
    const qtd = await within(dialog).findByRole("textbox", { name: "Quantidade" });
    expect((qtd as HTMLInputElement).value).toBe("2");
    // Não dá para diminuir abaixo da quantidade atual.
    expect((within(dialog).getByRole("button", { name: "Diminuir quantidade" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(qtd);
    await user.type(qtd, "1");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText(/Só é possível aumentar/, { selector: "[role=alert] *, [role=alert]" })).toBeTruthy();
    expect(mock.callsTo("PATCH /api/v1/comandas/12/itens/100")).toHaveLength(0);

    // De 1 para 3 (dois toques no +): o item tinha 2, então a quantidade nova é 3.
    await user.click(within(dialog).getByRole("button", { name: "Aumentar quantidade" }));
    await user.click(within(dialog).getByRole("button", { name: "Aumentar quantidade" }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/comandas/12/itens/100")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/comandas/12/itens/100")[0]!.body).toEqual({ quantidade: "3" });
  });

  it("transferir lista só mesas livres e envia a mesa escolhida", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/transferir", () => {
      state.current = comanda({ mesa: { id: 6, nome: "Mesa 6" } });
      return json(200, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Transferir de mesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Transferir de mesa" });
    const select = await within(dialog).findByRole("combobox", { name: /Nova mesa/ });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options.some((t) => t?.startsWith("Mesa 1"))).toBe(true);
    expect(options.some((t) => t?.startsWith("Mesa 6"))).toBe(true);
    expect(options.some((t) => t?.startsWith("Mesa 2"))).toBe(false); // ocupada
    await user.selectOptions(select, "6");
    await user.click(within(dialog).getByRole("button", { name: "Transferir" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/transferir")[0]?.body).toEqual({ mesa_id: 6 }));
    expect(await screen.findByText(/· Mesa 6/)).toBeTruthy();
  });

  it("dividir a conta mostra as partes da API (orientação)", async () => {
    const { mock } = setup();
    mock.on("GET /api/v1/comandas/12/divisao", (call) =>
      call.query.get("pessoas") === "3"
        ? json(200, { total: "19.80", pessoas: 3, partes: ["6.60", "6.60", "6.60"] })
        : json(200, { total: "19.80", pessoas: 2, partes: ["9.90", "9.90"] }),
    );
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Dividir conta" }));
    const dialog = await screen.findByRole("dialog", { name: "Dividir a conta" });
    const campo = within(dialog).getByLabelText(/Dividir entre quantas pessoas/);
    await user.clear(campo);
    await user.type(campo, "3");
    expect(await within(dialog).findByText(/3 × R\$\s6,60/)).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/comandas/12/divisao").map((c) => c.query.get("pessoas"))).toContain("3");
  });

  it("imprimir resumo monta a visão de conferência e chama window.print", async () => {
    setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Imprimir resumo" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = screen.getByTestId("print-root");
    expect(root.parentElement).toBe(document.body);
    expect(within(root).getByText("Conferência da comanda #12")).toBeTruthy();
    expect(within(root).getByText("R$ 19,80")).toBeTruthy();
    // Folha de estilo de impressão: o resto da página some e o recibo sai preto no branco.
    expect(root.querySelector("style")!.textContent).toContain("@media print");
  });

  it("cancelar comanda exige motivo e confirma no diálogo", async () => {
    const { mock, state } = setup(comanda(), "gerente");
    mock.on("POST /api/v1/comandas/12/cancelar", () => {
      state.current = comanda({ status: "cancelada", cancelada_motivo: "mesa desistiu", fechada_em: "2026-10-13T15:00:00+00:00" });
      return json(200, state.current);
    });
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Cancelar comanda" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar comanda" });
    await user.type(within(dialog).getByLabelText(/Motivo/), "mesa desistiu");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar comanda" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/cancelar")[0]?.body).toEqual({ motivo: "mesa desistiu" }));
    expect(await screen.findByText(/somente leitura/)).toBeTruthy();
  });

  it("atendente (sem desconto, fechar e cancelar) não vê essas ações", async () => {
    setup(comanda(), "atendente");
    renderApp("/comandas/12");

    await screen.findByRole("heading", { name: /Comanda #12/ });
    expect(screen.queryByRole("button", { name: "Desconto / acréscimo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar conta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar comanda" })).toBeNull();
    // Mas pode lançar e pedir a conta.
    expect(screen.getByRole("button", { name: "Pedir conta" })).toBeTruthy();
    expect(await screen.findByRole("list", { name: "Lista de produtos" })).toBeTruthy();
  });

  it("sem comandas.lancar a comanda é só consulta", async () => {
    const mock = mockApi();
    signInAs("atendente", [], { permissoes: ["comandas.listar", "catalogo.listar"] });
    mock.on("GET /api/v1/comandas/12", json(200, comanda()));
    renderApp("/comandas/12");
    await screen.findByRole("heading", { name: /Comanda #12/ });
    expect(screen.getByText(/pode consultar esta comanda, mas não lançar itens/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Lista de produtos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar Chopp 300ml" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pedir conta" })).toBeNull();
  });

  it("comanda inexistente mostra o erro da API com nova tentativa", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/comandas/99", json(404, { erro: { codigo: "nao_encontrado", mensagem: "Comanda não encontrado(a)." } }));
    renderApp("/comandas/99");
    expect((await screen.findByRole("alert")).textContent).toContain("Comanda não encontrado(a).");
  });

  it("busca de produto: Enter com leitor de código de barras lança direto", async () => {
    const { mock, state } = setup();
    mock.on("POST /api/v1/comandas/12/itens", () => json(201, (state.current = comanda({ itens: [item(), item({ id: 301, quantidade: "1.000", total: "9.00" })] }))));
    const { user } = renderApp("/comandas/12");

    const busca = await screen.findByRole("searchbox", { name: /Buscar produto/ });
    await user.type(busca, "7891234567890{Enter}");
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")[0]!.body).toEqual({ produto_id: 7, quantidade: "1" });
  });

  it("leitor de código de barras: o Enter consulta o código na hora, mesmo fora da lista da tela", async () => {
    const { mock, state } = setup();
    const cerveja = produto({ id: 15, nome: "Cerveja Lata", codigo: "CER1", codigo_barras: "7899999999999", preco_venda: "7.00" });
    // A lista inicial não tem o produto lido; ele só vem quando a busca tem o código.
    mock.on("GET /api/v1/produtos", (call) => json(200, { itens: call.query.get("q") === "7899999999999" ? [cerveja] : [produto(), kg], total: 2, limite: 100, deslocamento: 0 }));
    mock.on("POST /api/v1/comandas/12/itens", () => json(201, (state.current = comanda({ itens: [item(), item({ id: 302, produto_id: 15, descricao: "Cerveja Lata", quantidade: "1.000", total: "7.00" })] }))));
    const { user } = renderApp("/comandas/12");

    const busca = await screen.findByRole("searchbox", { name: /Buscar produto/ });
    await user.type(busca, "7899999999999{Enter}");
    await waitFor(() => expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")[0]!.body).toEqual({ produto_id: 15, quantidade: "1" });
    expect((busca as HTMLInputElement).value).toBe("");
  });

  it("código lido que não existe avisa e não lança nada", async () => {
    const { mock } = setup();
    mock.on("GET /api/v1/produtos", (call) => json(200, { itens: call.query.get("q") === "000" ? [] : [produto()], total: 1, limite: 100, deslocamento: 0 }));
    const { user } = renderApp("/comandas/12");
    const busca = await screen.findByRole("searchbox", { name: /Buscar produto/ });
    await user.type(busca, "000{Enter}");
    expect(await screen.findByText(/Nenhum produto encontrado para “000”/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/comandas/12/itens")).toHaveLength(0);
  });

  it("filtra por categoria e pede só produtos vendáveis e ativos", async () => {
    const { mock } = setup();
    const { user } = renderApp("/comandas/12");

    await user.click(await screen.findByRole("button", { name: "Bebidas" }));
    await waitFor(() => expect(mock.callsTo("GET /api/v1/produtos").some((c) => c.query.get("categoria_id") === "1")).toBe(true));
    const last = mock.callsTo("GET /api/v1/produtos").at(-1)!;
    expect(last.query.get("vendavel")).toBe("true");
    expect(last.query.get("ativo")).toBe("true");
  });
});
