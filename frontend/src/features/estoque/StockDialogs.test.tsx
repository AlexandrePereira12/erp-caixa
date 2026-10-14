import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { movimento, saldo, STOCK_PERMISSIONS } from "./fixtures";
import { KG, UN } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const FARINHA = saldo();
const COCA = saldo({ produto_id: 8, nome: "Coca-Cola Lata", tipo: "revenda", unidade: "UN", saldo: "24.000" });

function setup(permissoes: string[] = [...STOCK_PERMISSIONS, "catalogo.listar"]) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/estoque/saldos", (call) => {
    const q = (call.query.get("q") ?? "").toLowerCase();
    return json(200, page([FARINHA, COCA].filter((s) => s.nome.toLowerCase().includes(q))));
  });
  mock.on("GET /api/v1/estoque/movimentos", json(200, page([])));
  mock.on("GET /api/v1/categorias", json(200, []));
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  return mock;
}

async function chooseProduct(dialog: HTMLElement, user: ReturnType<typeof renderApp>["user"], name: RegExp) {
  await user.click(within(dialog).getByRole("combobox", { name: /^Produto/ }));
  await user.click(await within(dialog).findByRole("option", { name }));
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("Entrada de estoque", () => {
  async function openEntry(permissoes?: string[]) {
    const mock = setup(permissoes);
    const utils = renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });
    await utils.user.click(screen.getByRole("button", { name: "Registrar entrada" }));
    const dialog = await screen.findByRole("dialog", { name: "Registrar entrada" });
    return { mock, dialog, ...utils };
  }

  it("converte '1,5' em '1.5' e o custo '2,5' em '2.5'; mostra o saldo devolvido pela API", async () => {
    const { mock, dialog, user } = await openEntry();
    mock.on("POST /api/v1/estoque/entradas", json(201, movimento({ quantidade: "1.500", saldo_apos: "21.500" })));

    await chooseProduct(dialog, user, /Farinha de Trigo/);
    expect(within(dialog).getByText(/Saldo atual: 20 KG/)).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "1,5");
    await user.type(within(dialog).getByLabelText(/^Custo unitário/), "2,5");
    await user.type(within(dialog).getByLabelText("Documento"), "NF 999");
    await user.type(within(dialog).getByLabelText("Justificativa"), "Compra extra");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/estoque/entradas")[0]!.body).toEqual({ produto_id: 7, quantidade: "1.5", custo_unitario: "2.5", documento: "NF 999", justificativa: "Compra extra" });
    expect(await screen.findByText(/Entrada registrada: \+1,5 KG de Farinha de Trigo\. Saldo: 21,5 KG\./)).toBeTruthy();
    // a lista de saldos é recarregada
    await waitFor(() => expect(mock.callsTo("GET /api/v1/estoque/saldos").length).toBeGreaterThan(1));
  });

  it("sem custo, documento e justificativa: custo_unitario nem vai no corpo, os demais vão null", async () => {
    const { mock, dialog, user } = await openEntry();
    mock.on("POST /api/v1/estoque/entradas", json(201, movimento()));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "3");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/estoque/entradas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/estoque/entradas")[0]!.body).toEqual({ produto_id: 7, quantidade: "3", documento: null, justificativa: null });
  });

  it("respeita as casas da unidade: UN não aceita 1,5 e o aviso vem antes do envio", async () => {
    const { mock, dialog, user } = await openEntry();
    await chooseProduct(dialog, user, /Coca-Cola Lata/);
    expect(within(dialog).getByText("Esta unidade aceita só números inteiros.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "1,5");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    expect(await within(dialog).findByText("A unidade UN não aceita casas decimais: use um número inteiro.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/entradas")).toHaveLength(0);
  });

  it("KG aceita até 3 casas, não 4", async () => {
    const { mock, dialog, user } = await openEntry();
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "1,2345");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    expect(await within(dialog).findByText("A unidade KG aceita no máximo 3 casas decimais.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/entradas")).toHaveLength(0);
  });

  it("exige produto e quantidade; custo inválido é recusado", async () => {
    const { mock, dialog, user } = await openEntry();
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    expect(await within(dialog).findByText("Selecione o produto.")).toBeTruthy();
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.type(within(dialog).getByLabelText(/^Custo unitário/), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    expect(await within(dialog).findByText("Informe a quantidade.")).toBeTruthy();
    expect(within(dialog).getByText(/Valor inválido/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/entradas")).toHaveLength(0);
  });

  it("erro do backend (quantidade_fracionada) aparece no campo", async () => {
    const { mock, dialog, user } = await openEntry(["estoque.listar", "estoque.entrada"]); // sem catalogo.listar: escala desconhecida (3)
    mock.on("POST /api/v1/estoque/entradas", apiError(422, "quantidade_fracionada", "A unidade UN aceita no máximo 0 casa(s) decimal(is)."));
    await chooseProduct(dialog, user, /Coca-Cola Lata/);
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "1,5");
    await user.click(within(dialog).getByRole("button", { name: "Registrar entrada" }));
    expect(await within(dialog).findByText("A unidade UN aceita no máximo 0 casa(s) decimal(is).")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/entradas")[0]!.body).toMatchObject({ quantidade: "1.5" }); // sem catalogo.listar o cliente não sabe a escala: o servidor decide
    expect(mock.callsTo("GET /api/v1/unidades")).toHaveLength(0);
  });
});

describe("Ajuste, perda e saída", () => {
  async function openAdjust(permissoes?: string[]) {
    const mock = setup(permissoes);
    const utils = renderApp("/estoque");
    await screen.findByRole("table", { name: "Saldos de estoque" });
    await utils.user.click(screen.getByRole("button", { name: "Ajuste, perda ou saída" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajuste, perda ou saída" });
    return { mock, dialog, ...utils };
  }

  it("ajuste aceita quantidade com sinal: '-1,5' vira '-1.5'; positiva também", async () => {
    const { mock, dialog, user } = await openAdjust();
    mock.on("POST /api/v1/estoque/ajustes", json(201, movimento({ tipo: "ajuste", quantidade: "-1.500", saldo_apos: "18.500" })));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "-1,5");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Contagem na câmara");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/estoque/ajustes")[0]!.body).toEqual({ produto_id: 7, tipo: "ajuste", quantidade: "-1.5", justificativa: "Contagem na câmara" });
    expect(await screen.findByText(/Movimento registrado em Farinha de Trigo\. Saldo: 18,5 KG\./)).toBeTruthy();
  });

  it("'+2' vira '2'; zero é recusado", async () => {
    const { mock, dialog, user } = await openAdjust();
    mock.on("POST /api/v1/estoque/ajustes", json(201, movimento({ tipo: "ajuste" })));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    const quantidade = within(dialog).getByLabelText(/^Quantidade/);
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Acerto");
    await user.type(quantidade, "0");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    expect(await within(dialog).findByText("A quantidade não pode ser zero.")).toBeTruthy();
    await user.clear(quantidade);
    await user.type(quantidade, "+2");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/estoque/ajustes")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/estoque/ajustes")[0]!.body).toMatchObject({ quantidade: "2" });
  });

  it("perda e saída exigem quantidade positiva", async () => {
    const { mock, dialog, user } = await openAdjust();
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo de movimento/), "perda");
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "-1");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Vencido");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    expect(await within(dialog).findByText("Para perda e saída informe a quantidade positiva.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/ajustes")).toHaveLength(0);
  });

  it("justificativa obrigatória com ao menos 3 caracteres", async () => {
    const { mock, dialog, user } = await openAdjust();
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "1");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    expect(await within(dialog).findByText("A justificativa deve ter ao menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/estoque/ajustes")).toHaveLength(0);
  });

  it("sem estoque.permitir_negativo o checkbox de estoque negativo não existe", async () => {
    const { dialog } = await openAdjust();
    expect(within(dialog).queryByRole("checkbox", { name: /Permitir estoque negativo/ })).toBeNull();
  });

  it("com estoque.permitir_negativo o checkbox existe e só vai no corpo quando marcado", async () => {
    const { mock, dialog, user } = await openAdjust([...STOCK_PERMISSIONS, "estoque.permitir_negativo", "catalogo.listar"]);
    mock.on("POST /api/v1/estoque/ajustes", json(201, movimento({ tipo: "saida" })));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo de movimento/), "saida");
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "30");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Consumo interno");
    await user.click(within(dialog).getByRole("checkbox", { name: /Permitir estoque negativo/ }));
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/estoque/ajustes")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/estoque/ajustes")[0]!.body).toEqual({ produto_id: 7, tipo: "saida", quantidade: "30", justificativa: "Consumo interno", permitir_negativo: true });
  });

  it("estoque_insuficiente mostra o saldo e o necessário da mensagem e o diálogo continua aberto", async () => {
    const { mock, dialog, user } = await openAdjust();
    mock.on("POST /api/v1/estoque/ajustes", apiError(409, "estoque_insuficiente", "Estoque insuficiente de Farinha de Trigo: saldo 20.000, necessário 30.000."));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo de movimento/), "saida");
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "30");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Consumo");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Estoque insuficiente");
    expect(alert.textContent).toContain("saldo 20 KG, necessário 30 KG"); // números da mensagem do backend, formatados em pt-BR
    expect(alert.textContent).not.toContain("Permitir estoque negativo"); // sem a permissão, nenhuma sugestão de contornar
    expect(screen.getByRole("dialog", { name: "Ajuste, perda ou saída" })).toBeTruthy();
  });

  it("com a permissão, o alerta de estoque insuficiente sugere o estoque negativo", async () => {
    const { mock, dialog, user } = await openAdjust([...STOCK_PERMISSIONS, "estoque.permitir_negativo", "catalogo.listar"]);
    mock.on("POST /api/v1/estoque/ajustes", apiError(409, "estoque_insuficiente", "Estoque insuficiente de Farinha de Trigo: saldo 20.000, necessário 30.000."));
    await chooseProduct(dialog, user, /Farinha de Trigo/);
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo de movimento/), "saida");
    await user.type(within(dialog).getByLabelText(/^Quantidade/), "30");
    await user.type(within(dialog).getByLabelText(/^Justificativa/), "Consumo");
    await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Permitir estoque negativo");
  });
});
