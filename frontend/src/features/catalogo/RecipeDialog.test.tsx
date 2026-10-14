import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BEBIDAS, CATALOG_PERMISSIONS, hamburguer, insumo, KG, LANCHES, produto, UN } from "./fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const EMBALAGEM = produto({ id: 8, nome: "Caixa de Papel", tipo: "embalagem", unidade: UN, vendavel: false, codigo: "CX" });
const COM_FICHA = hamburguer({ id: 201, nome: "Outro Preparado" }); // tipo preparado: não pode ser insumo
const SEM_CONTROLE = insumo({ id: 9, nome: "Água da Torneira", controla_estoque: false, saldo: null });
const BY_TYPE: Record<string, unknown[]> = {
  insumo: [insumo(), SEM_CONTROLE],
  embalagem: [EMBALAGEM],
  revenda: [produto({ id: 100, nome: "Pão de Hambúrguer", unidade: UN }), produto({ id: 101, nome: "Revenda com Ficha", composicao: [{ insumo_id: 7, insumo_nome: "x", unidade: "KG", quantidade: "1.000", custo_item: "1.00" }] })],
};

function setup(permissoes: string[] = CATALOG_PERMISSIONS) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/produtos", (call) => {
    const tipo = call.query.get("tipo");
    if (tipo) return json(200, page(BY_TYPE[tipo] ?? []));
    return json(200, page([hamburguer(), COM_FICHA]));
  });
  mock.on("GET /api/v1/categorias", json(200, [BEBIDAS, LANCHES]));
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  return mock;
}

async function openRecipe() {
  const mock = setup();
  const utils = renderApp("/produtos");
  await screen.findByText("X-Burger");
  await utils.user.click(screen.getAllByRole("button", { name: "Ficha técnica de X-Burger" })[0]!);
  const dialog = await screen.findByRole("dialog", { name: /Ficha técnica — X-Burger/ });
  return { mock, dialog, ...utils };
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("RecipeDialog (ficha técnica)", () => {
  it("mostra os insumos com quantidade, custo do item e custo da ficha vindos da API", async () => {
    const { dialog } = await openRecipe();
    const list = within(dialog).getByRole("list", { name: "Insumos da ficha técnica" });
    expect(within(list).getByText("Farinha de Trigo")).toBeTruthy();
    expect((within(list).getByLabelText("Quantidade de Farinha de Trigo (KG)") as HTMLInputElement).value).toBe("0,3");
    expect(within(list).getByText("R$ 1,20")).toBeTruthy(); // custo_item da API
    expect(within(dialog).getByText("Custo da ficha")).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s1,20/).length).toBeGreaterThanOrEqual(2);
  });

  it("busca insumo (só tipos elegíveis, controlados e sem ficha própria), adiciona e salva a quantidade como string decimal", async () => {
    const { mock, dialog, user } = await openRecipe();
    mock.on("PUT /api/v1/produtos/200/composicao", json(200, hamburguer({
      custo_ficha: "1.7000",
      composicao: [
        { insumo_id: 7, insumo_nome: "Farinha de Trigo", unidade: "KG", quantidade: "0.300", custo_item: "1.20" },
        { insumo_id: 100, insumo_nome: "Pão de Hambúrguer", unidade: "UN", quantidade: "2.000", custo_item: "0.50" },
      ],
    })));

    const busca = within(dialog).getByRole("combobox", { name: "Adicionar insumo" });
    await user.click(busca);
    const listbox = await within(dialog).findByRole("listbox", { name: "Adicionar insumo" });
    const names = within(listbox).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(names.some((n) => n.includes("Caixa de Papel"))).toBe(true);
    expect(names.some((n) => n.includes("Pão de Hambúrguer"))).toBe(true);
    expect(names.some((n) => n.includes("Farinha de Trigo"))).toBe(false); // já está na ficha
    expect(names.some((n) => n.includes("Água da Torneira"))).toBe(false); // não controla estoque
    expect(names.some((n) => n.includes("Revenda com Ficha"))).toBe(false); // tem ficha própria
    // busca por cada tipo elegível (a API aceita um tipo por vez)
    expect(mock.callsTo("GET /api/v1/produtos").map((c) => c.query.get("tipo")).sort()).toEqual(expect.arrayContaining(["embalagem", "insumo", "revenda"]));

    await user.click(within(listbox).getByRole("option", { name: /Pão de Hambúrguer/ }));
    const quantidade = within(dialog).getByLabelText("Quantidade de Pão de Hambúrguer (UN)");
    expect(document.activeElement).toBe(quantidade);
    await user.type(quantidade, "2");
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));

    await waitFor(() => expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")[0]!.body).toEqual({
      itens: [
        { insumo_id: 7, quantidade: "0.3" },
        { insumo_id: 100, quantidade: "2" },
      ],
    });
    // depois de salvar mostra o custo da ficha e o custo do item calculados pela API
    expect(await within(dialog).findByText("R$ 0,50")).toBeTruthy();
    expect(within(dialog).getByText(/R\$\s1,70/)).toBeTruthy();
    expect(await screen.findByText("Ficha técnica salva.")).toBeTruthy();
  });

  it("converte '0,15' em '0.15' e respeita as casas do insumo (UN não aceita 1,5)", async () => {
    const { mock, dialog, user } = await openRecipe();
    mock.on("PUT /api/v1/produtos/200/composicao", json(200, hamburguer()));

    const farinha = within(dialog).getByLabelText("Quantidade de Farinha de Trigo (KG)");
    await user.clear(farinha);
    await user.type(farinha, "0,15");

    await user.click(within(dialog).getByRole("combobox", { name: "Adicionar insumo" }));
    await user.click(await within(dialog).findByRole("option", { name: /Pão de Hambúrguer/ }));
    const pao = within(dialog).getByLabelText("Quantidade de Pão de Hambúrguer (UN)");
    await user.type(pao, "1,5");
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));

    expect(await within(dialog).findByText("A unidade UN não aceita casas decimais: use um número inteiro.")).toBeTruthy();
    expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")).toHaveLength(0);

    await user.clear(pao);
    await user.type(pao, "2");
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));
    await waitFor(() => expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")[0]!.body).toEqual({
      itens: [
        { insumo_id: 7, quantidade: "0.15" },
        { insumo_id: 100, quantidade: "2" },
      ],
    });
  });

  it("quantidade vazia ou zero é recusada; remover insumo tira da lista; lista vazia pode ser salva", async () => {
    const { mock, dialog, user } = await openRecipe();
    mock.on("PUT /api/v1/produtos/200/composicao", json(200, hamburguer({ composicao: [], custo_ficha: null })));

    const farinha = within(dialog).getByLabelText("Quantidade de Farinha de Trigo (KG)");
    await user.clear(farinha);
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));
    expect(await within(dialog).findByText("Informe a quantidade.")).toBeTruthy();
    await user.type(farinha, "0");
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));
    expect(await within(dialog).findByText("A quantidade deve ser maior que zero.")).toBeTruthy();
    expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Remover Farinha de Trigo da ficha" }));
    expect(within(dialog).getByText("Nenhum insumo na ficha técnica.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));
    await waitFor(() => expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/produtos/200/composicao")[0]!.body).toEqual({ itens: [] });
  });

  it("erro do backend (insumo_invalido) aparece no diálogo e o que foi digitado fica", async () => {
    const { mock, dialog, user } = await openRecipe();
    mock.on("PUT /api/v1/produtos/200/composicao", apiError(422, "insumo_invalido", "Farinha de Trigo não pode ser insumo: use produto com controle de estoque."));
    await user.click(within(dialog).getByRole("button", { name: "Salvar ficha técnica" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("não pode ser insumo");
    expect((within(dialog).getByLabelText("Quantidade de Farinha de Trigo (KG)") as HTMLInputElement).value).toBe("0,3");
  });
});
