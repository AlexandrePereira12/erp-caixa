import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { INVENTORY_PERMISSIONS, inventario, resumo } from "./fixtures";
import { BEBIDAS, insumo, KG, UN } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const LIST = [resumo(), resumo({ id: 2, descricao: "Câmara fria", status: "fechado", fechado_em: "2026-10-10T18:00:00+00:00", itens_contados: 3 }), resumo({ id: 3, descricao: "Teste", status: "cancelado", itens_contados: 0 })];

function setup(permissoes: string[] = [...INVENTORY_PERMISSIONS, "catalogo.listar"]) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/inventarios", json(200, page(LIST, { limite: 20 })));
  mock.on("GET /api/v1/categorias", json(200, [BEBIDAS]));
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  mock.on("GET /api/v1/produtos", json(200, page([insumo(), insumo({ id: 8, nome: "Coca-Cola Lata" }), insumo({ id: 9, nome: "Água Sem Controle", controla_estoque: false })])));
  mock.on("GET /api/v1/inventarios/55", json(200, inventario({ id: 55 })));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("InventoriesPage: lista", () => {
  it("mostra status, datas e o progresso que a API informa (itens_contados / total_itens)", async () => {
    const mock = setup();
    renderApp("/inventarios");
    const table = await screen.findByRole("table", { name: "Lista de inventários" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("Aberto")).toBeTruthy();
    expect(within(rows[1]!).getByText("1 de 3 contados")).toBeTruthy();
    expect(within(rows[1]!).getByRole("link", { name: "Contar inventário Contagem de outubro" }).getAttribute("href")).toBe("/inventarios/1");
    expect(within(rows[2]!).getByText("Fechado")).toBeTruthy();
    expect(within(rows[2]!).getByText("3 de 3 contados")).toBeTruthy();
    expect(within(rows[2]!).getByRole("link", { name: "Ver inventário Câmara fria" })).toBeTruthy();
    expect(within(rows[3]!).getByText("Cancelado")).toBeTruthy();
    const progress = within(rows[1]!).getByRole("progressbar", { name: /Progresso do inventário/ }) as HTMLProgressElement;
    expect([progress.value, progress.max]).toEqual([1, 3]);
    expect(mock.callsTo("GET /api/v1/inventarios")[0]!.query.get("limite")).toBe("20");
  });

  it("filtro de status fica na URL e vai para a API", async () => {
    const mock = setup();
    const { user, router } = renderApp("/inventarios");
    await screen.findByRole("table", { name: "Lista de inventários" });
    await user.selectOptions(screen.getByLabelText("Status"), "fechado");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/inventarios").at(-1)!.query.get("status")).toBe("fechado"));
    expect(router.state.location.search).toBe("?status=fechado");
  });

  it("'Novo inventário' só com inventarios.criar", async () => {
    setup(["inventarios.listar"]);
    renderApp("/inventarios");
    await screen.findByRole("table", { name: "Lista de inventários" });
    expect(screen.queryByRole("button", { name: "Novo inventário" })).toBeNull();
  });
});

describe("InventoryOpenDialog", () => {
  async function openDialog(permissoes?: string[]) {
    const mock = setup(permissoes);
    const utils = renderApp("/inventarios");
    await screen.findByRole("table", { name: "Lista de inventários" });
    await utils.user.click(screen.getByRole("button", { name: "Novo inventário" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo inventário" });
    return { mock, dialog, ...utils };
  }

  it("escopo 'todos': só a descrição vai no corpo e a tela abre o inventário criado", async () => {
    const { mock, dialog, user, router } = await openDialog();
    mock.on("POST /api/v1/inventarios", json(201, inventario({ id: 55 })));
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Contagem geral");
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/inventarios/55"));
    expect(mock.callsTo("POST /api/v1/inventarios")[0]!.body).toEqual({ descricao: "Contagem geral" });
    expect(await screen.findByText("Inventário aberto com 3 produto(s).")).toBeTruthy();
  });

  it("escopo 'uma categoria' envia categoria_id e exige a escolha", async () => {
    const { mock, dialog, user } = await openDialog();
    mock.on("POST /api/v1/inventarios", json(201, inventario({ id: 55 })));
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Bebidas");
    await user.click(within(dialog).getByRole("radio", { name: "Uma categoria" }));
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    expect(await within(dialog).findByText("Escolha a categoria.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/inventarios")).toHaveLength(0);

    await user.selectOptions(within(dialog).getByLabelText(/^Categoria/), "1");
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/inventarios")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/inventarios")[0]!.body).toEqual({ descricao: "Bebidas", categoria_id: 1 });
  });

  it("escopo 'seleção de produtos' envia produto_ids (só ativos que controlam estoque aparecem)", async () => {
    const { mock, dialog, user } = await openDialog();
    mock.on("POST /api/v1/inventarios", json(201, inventario({ id: 55 })));
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Seleção");
    await user.click(within(dialog).getByRole("radio", { name: "Seleção de produtos" }));
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    expect(await within(dialog).findByText("Escolha ao menos um produto.")).toBeTruthy();

    await user.click(within(dialog).getByRole("combobox", { name: "Adicionar produto" }));
    const listbox = await within(dialog).findByRole("listbox", { name: "Adicionar produto" });
    expect(within(listbox).queryByRole("option", { name: /Água Sem Controle/ })).toBeNull();
    await user.click(within(listbox).getByRole("option", { name: /Coca-Cola Lata/ }));
    await user.click(within(dialog).getByRole("combobox", { name: "Adicionar produto" }));
    await user.click(await within(dialog).findByRole("option", { name: /Farinha de Trigo/ }));
    expect(within(dialog).getByRole("list", { name: "Produtos selecionados" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/inventarios")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/inventarios")[0]!.body).toEqual({ descricao: "Seleção", produto_ids: [8, 7] });
    expect(mock.callsTo("GET /api/v1/produtos").at(-1)!.query.get("ativo")).toBe("true");
  });

  it("sem catalogo.listar só o escopo 'todos' está disponível", async () => {
    const { dialog } = await openDialog(INVENTORY_PERMISSIONS);
    expect((within(dialog).getByRole("radio", { name: "Uma categoria" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole("radio", { name: "Seleção de produtos" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByRole("radio", { name: "Todos os produtos controlados" }) as HTMLInputElement).disabled).toBe(false);
  });

  it("inventario_vazio do backend aparece no formulário", async () => {
    const { mock, dialog, user } = await openDialog();
    mock.on("POST /api/v1/inventarios", apiError(422, "inventario_vazio", "Nenhum produto com controle de estoque para inventariar."));
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Vazio");
    await user.click(within(dialog).getByRole("button", { name: "Abrir inventário" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Nenhum produto com controle de estoque para inventariar.");
    expect(screen.getByRole("dialog", { name: "Novo inventário" })).toBeTruthy();
  });
});
