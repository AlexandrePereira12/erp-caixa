import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BEBIDAS, CATALOG_PERMISSIONS, hamburguer, KG, LANCHES, produto, UN } from "./fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const PRODUCTS = [
  produto(),
  produto({ id: 101, nome: "Suco de Laranja", saldo: "2.000", estoque_minimo: "5.000", abaixo_minimo: true, ativo: false, vendavel: false }),
  hamburguer(),
];

function setup(permissoes: string[] = CATALOG_PERMISSIONS, products = PRODUCTS) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/produtos", json(200, page(products, { limite: 20 })));
  mock.on("GET /api/v1/categorias", json(200, [BEBIDAS, LANCHES]));
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("ProductsPage: lista", () => {
  it("mostra preço, custo médio (4 casas), saldo, badge de estoque baixo e ficha técnica", async () => {
    const mock = setup();
    renderApp("/produtos");
    const table = await screen.findByRole("table", { name: "Lista de produtos" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);

    expect(within(rows[1]!).getByText("Coca-Cola Lata")).toBeTruthy();
    expect(within(rows[1]!).getByText("R$ 7,50")).toBeTruthy();
    expect(within(rows[1]!).getByText(/R\$\s3,25/)).toBeTruthy();
    expect(within(rows[1]!).getByText("24 UN")).toBeTruthy();

    expect(within(rows[2]!).getByText(/Estoque baixo/)).toBeTruthy();
    expect(within(rows[2]!).getByText("Inativo")).toBeTruthy();
    expect(within(rows[2]!).getByText("Não vendável")).toBeTruthy();

    expect(within(rows[3]!).getByText("Não controla")).toBeTruthy();
    expect(within(rows[3]!).getByText(/Ficha: R\$\s1,20/)).toBeTruthy();
    expect(within(rows[3]!).getByRole("button", { name: "Ficha técnica de X-Burger" })).toBeTruthy();
    expect(within(rows[1]!).queryByRole("button", { name: /Ficha técnica/ })).toBeNull();

    expect(mock.callsTo("GET /api/v1/produtos")[0]!.query.get("limite")).toBe("20");
  });

  it("filtros (tipo, categoria, situação, vendável, abaixo do mínimo, busca) vão para a URL e para a API", async () => {
    const mock = setup();
    const { user, router } = renderApp("/produtos");
    await screen.findByRole("table", { name: "Lista de produtos" });

    await user.selectOptions(screen.getByLabelText("Tipo"), "preparado");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/produtos").at(-1)!.query.get("tipo")).toBe("preparado"));
    await user.selectOptions(await screen.findByRole("option", { name: "Lanches" }).then((o) => o.parentElement as HTMLSelectElement), "2");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/produtos").at(-1)!.query.get("categoria_id")).toBe("2"));
    await user.selectOptions(screen.getByLabelText("Situação"), "true");
    await user.selectOptions(screen.getByLabelText("Vendável"), "false");
    await user.click(screen.getByRole("checkbox", { name: "Abaixo do mínimo" }));
    await user.type(screen.getByLabelText("Buscar"), "burger");

    await waitFor(
      () => {
        const query = mock.callsTo("GET /api/v1/produtos").at(-1)!.query;
        expect(query.get("q")).toBe("burger");
        expect(query.get("tipo")).toBe("preparado");
        expect(query.get("categoria_id")).toBe("2");
        expect(query.get("ativo")).toBe("true");
        expect(query.get("vendavel")).toBe("false");
        expect(query.get("abaixo_minimo")).toBe("true");
        expect(query.get("deslocamento")).toBe("0");
      },
      { timeout: 2000 },
    );
    const search = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(search)).toEqual({ tipo: "preparado", categoria: "2", ativo: "true", vendavel: "false", abaixo_minimo: "1", q: "burger" });
  });

  it("lê os filtros da URL", async () => {
    const mock = setup();
    renderApp("/produtos?tipo=insumo&abaixo_minimo=1&pagina=2");
    await screen.findByRole("table", { name: "Lista de produtos" });
    const query = mock.callsTo("GET /api/v1/produtos")[0]!.query;
    expect([query.get("tipo"), query.get("abaixo_minimo"), query.get("deslocamento")]).toEqual(["insumo", "true", "20"]);
    expect((screen.getByRole("checkbox", { name: "Abaixo do mínimo" }) as HTMLInputElement).checked).toBe(true);
  });

  it("só com catalogo.listar não há criar/editar/excluir, mas a ficha técnica abre somente leitura", async () => {
    setup(["catalogo.listar"]);
    const { user } = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    expect(screen.queryByRole("button", { name: "Novo produto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excluir/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ficha técnica de X-Burger" }));
    const dialog = await screen.findByRole("dialog", { name: /Ficha técnica/ });
    expect(within(dialog).getByText(/não tem permissão para alterá-la/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Salvar ficha técnica" })).toBeNull();
  });

  it("links para categorias e unidades dentro da página", async () => {
    setup();
    renderApp("/produtos");
    const nav = await screen.findByRole("navigation", { name: "Catálogo" });
    expect(within(nav).getByRole("link", { name: "Categorias" }).getAttribute("href")).toBe("/categorias");
    expect(within(nav).getByRole("link", { name: "Unidades" }).getAttribute("href")).toBe("/unidades");
    expect(within(nav).getByRole("link", { name: "Produtos" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("ProductsPage: formulário e defaults por tipo", () => {
  async function openCreate() {
    const mock = setup();
    const utils = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    await utils.user.click(screen.getByRole("button", { name: "Novo produto" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo produto" });
    await within(dialog).findByRole("option", { name: "UN — Unidade" });
    return { mock, dialog, ...utils };
  }
  const checked = (dialog: HTMLElement, name: string) => (within(dialog).getByRole("checkbox", { name: new RegExp(`^${name}`) }) as HTMLInputElement).checked;

  it("defaults por tipo: preparado não controla estoque; insumo e embalagem não são vendáveis", async () => {
    const { dialog, user } = await openCreate();
    expect([checked(dialog, "Controla estoque"), checked(dialog, "Vendável")]).toEqual([true, true]); // revenda

    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "preparado");
    expect([checked(dialog, "Controla estoque"), checked(dialog, "Vendável")]).toEqual([false, true]);
    expect((within(dialog).getByLabelText(/^Estoque mínimo/) as HTMLInputElement).disabled).toBe(true);

    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "insumo");
    expect([checked(dialog, "Controla estoque"), checked(dialog, "Vendável")]).toEqual([true, false]);

    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "embalagem");
    expect([checked(dialog, "Controla estoque"), checked(dialog, "Vendável")]).toEqual([true, false]);
  });

  it("depois que o usuário mexe num campo, trocar o tipo não o sobrescreve", async () => {
    const { dialog, user } = await openCreate();
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "insumo");
    await user.click(within(dialog).getByRole("checkbox", { name: /^Vendável/ })); // insumo vendável por escolha
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "preparado");
    expect(checked(dialog, "Vendável")).toBe(true);
    expect(checked(dialog, "Controla estoque")).toBe(false); // este ainda segue o default
  });

  it("cria produto enviando strings decimais (vírgula vira ponto) e custo inicial só na criação", async () => {
    const { mock, dialog, user } = await openCreate();
    mock.on("POST /api/v1/produtos", json(201, produto({ id: 300, nome: "Farinha 5kg" })));

    await user.type(within(dialog).getByLabelText(/^Nome/), "Farinha 5kg");
    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "insumo");
    await user.selectOptions(within(dialog).getByLabelText(/^Categoria/), "1");
    await user.selectOptions(within(dialog).getByLabelText(/^Unidade/), "2");
    const preco = within(dialog).getByLabelText(/^Preço de venda/);
    await user.clear(preco);
    await user.type(preco, "12,50");
    await user.type(within(dialog).getByLabelText(/^Custo inicial/), "3,3333");
    const minimo = within(dialog).getByLabelText(/^Estoque mínimo/);
    await user.clear(minimo);
    await user.type(minimo, "0,5");
    await user.click(within(dialog).getByRole("button", { name: "Criar produto" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/produtos")[0]!.body).toEqual({
      nome: "Farinha 5kg",
      tipo: "insumo",
      categoria_id: 1,
      unidade_id: 2,
      codigo: null,
      codigo_barras: null,
      preco_venda: "12.50",
      custo_inicial: "3.3333",
      estoque_minimo: "0.5",
      controla_estoque: true,
      vendavel: false,
      ativo: true,
    });
    expect(await screen.findByText("Produto criado.")).toBeTruthy();
  });

  it("estoque mínimo fracionado em unidade inteira é recusado antes de enviar; custo com casas demais também", async () => {
    const { mock, dialog, user } = await openCreate();
    await user.type(within(dialog).getByLabelText(/^Nome/), "Pão");
    await user.selectOptions(within(dialog).getByLabelText(/^Unidade/), "1"); // UN, 0 casas
    const minimo = within(dialog).getByLabelText(/^Estoque mínimo/);
    await user.clear(minimo);
    await user.type(minimo, "1,5");
    await user.type(within(dialog).getByLabelText(/^Custo inicial/), "1,23456");
    await user.click(within(dialog).getByRole("button", { name: "Criar produto" }));

    expect(await within(dialog).findByText("A unidade UN não aceita casas decimais: use um número inteiro.")).toBeTruthy();
    expect(within(dialog).getByText("Use no máximo 4 casas decimais.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/produtos")).toHaveLength(0);
  });

  it("valida nome e unidade; erros de código em uso vão para o campo", async () => {
    const { mock, dialog, user } = await openCreate();
    await user.click(within(dialog).getByRole("button", { name: "Criar produto" }));
    expect(await within(dialog).findByText("Informe o nome.")).toBeTruthy();
    expect(within(dialog).getByText("Selecione a unidade.")).toBeTruthy();

    mock.on("POST /api/v1/produtos", apiError(409, "codigo_em_uso", "Já existe um produto com este código."));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Pão");
    await user.selectOptions(within(dialog).getByLabelText(/^Unidade/), "1");
    await user.type(within(dialog).getByLabelText("Código"), "PAO");
    await user.click(within(dialog).getByRole("button", { name: "Criar produto" }));
    expect(await within(dialog).findByText("Já existe um produto com este código.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Código").getAttribute("aria-invalid")).toBe("true");
  });

  it("edição envia só os campos alterados e NÃO aplica defaults ao trocar o tipo", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/produtos/100", json(200, produto({ tipo: "insumo", preco_venda: "8.00" })));
    const { user } = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    await user.click(screen.getByRole("button", { name: "Editar Coca-Cola Lata" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar produto" });
    await within(dialog).findByRole("option", { name: "KG — Quilograma" });

    expect(within(dialog).queryByLabelText(/^Custo inicial/)).toBeNull(); // custo inicial só na criação
    expect(within(dialog).getByText(/R\$\s3,25/)).toBeTruthy(); // custo médio atual, somente leitura

    await user.selectOptions(within(dialog).getByLabelText(/^Tipo/), "insumo");
    expect(checked(dialog, "Vendável")).toBe(true); // tipo insumo na edição não mexe em vendável/controla
    const preco = within(dialog).getByLabelText(/^Preço de venda/);
    await user.clear(preco);
    await user.type(preco, "8,00");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("PATCH /api/v1/produtos/100")[0]!.body).toEqual({ tipo: "insumo", preco_venda: "8.00" });
  });

  it("produto_com_saldo ao desligar o controle aparece como alerta com a mensagem do backend", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/produtos/100", apiError(409, "produto_com_saldo", "Zere o saldo (ajuste ou inventário) antes de deixar de controlar o estoque."));
    const { user } = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    await user.click(screen.getByRole("button", { name: "Editar Coca-Cola Lata" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar produto" });
    await within(dialog).findByRole("option", { name: "KG — Quilograma" });
    await user.click(within(dialog).getByRole("checkbox", { name: /^Controla estoque/ }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Zere o saldo");
  });
});

describe("ProductsPage: excluir", () => {
  async function tryDelete(code: string, message: string) {
    const mock = setup();
    mock.on("DELETE /api/v1/produtos/100", apiError(409, code, message));
    const { user } = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    await user.click(screen.getByRole("button", { name: "Excluir Coca-Cola Lata" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir produto" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    return (await within(dialog).findByRole("alert")).textContent ?? "";
  }

  it("produto_em_uso: mensagem clara sobre a ficha técnica de outro produto", async () => {
    expect(await tryDelete("produto_em_uso", "Este produto é insumo na ficha técnica de outro produto.")).toContain("insumo na ficha técnica de outro produto");
  });

  it("produto_com_saldo: mensagem clara sobre zerar o saldo", async () => {
    expect(await tryDelete("produto_com_saldo", "Zere o saldo (ajuste ou inventário) antes de excluir o produto.")).toContain("ainda tem saldo em estoque");
  });

  it("exclui com confirmação", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/produtos/100", json(204));
    const { user } = renderApp("/produtos");
    await screen.findByText("Coca-Cola Lata");
    await user.click(screen.getByRole("button", { name: "Excluir Coca-Cola Lata" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir produto" });
    expect(mock.callsTo("DELETE /api/v1/produtos/100")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(mock.callsTo("DELETE /api/v1/produtos/100")).toHaveLength(1));
    expect(await screen.findByText("Coca-Cola Lata foi excluído.")).toBeTruthy();
  });
});
