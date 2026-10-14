import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BEBIDAS, CATALOG_PERMISSIONS, KG, LANCHES, UN } from "./fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

beforeEach(() => {
  session.reset("anonymous");
});

describe("UnitsPage", () => {
  function setup(permissoes: string[] = CATALOG_PERMISSIONS) {
    const mock = mockApi();
    signIn({ permissoes });
    mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
    return mock;
  }

  it("lista as unidades com as casas decimais", async () => {
    setup();
    renderApp("/unidades");
    const table = await screen.findByRole("table", { name: "Lista de unidades de medida" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("UN")).toBeTruthy();
    expect(within(rows[1]!).getByText("0 (somente inteiros)")).toBeTruthy();
    expect(within(rows[2]!).getByText("KG")).toBeTruthy();
    expect(within(rows[2]!).getByText("3")).toBeTruthy();
  });

  it("cria unidade com casas decimais numéricas e valida sigla/nome", async () => {
    const mock = setup();
    mock.on("POST /api/v1/unidades", json(201, { id: 3, sigla: "L", nome: "Litro", casas_decimais: 3 }));
    const { user } = renderApp("/unidades");
    await screen.findByRole("table", { name: "Lista de unidades de medida" });

    await user.click(screen.getByRole("button", { name: "Nova unidade" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova unidade" });
    await user.click(within(dialog).getByRole("button", { name: "Criar unidade" }));
    expect(await within(dialog).findByText("Informe a sigla.")).toBeTruthy();
    expect(within(dialog).getByText("Informe o nome.")).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/^Sigla/), "l");
    await user.type(within(dialog).getByLabelText(/^Nome/), "Litro");
    await user.selectOptions(within(dialog).getByLabelText(/^Casas decimais/), "3");
    await user.click(within(dialog).getByRole("button", { name: "Criar unidade" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/unidades")[0]!.body).toEqual({ sigla: "l", nome: "Litro", casas_decimais: 3 });
  });

  it("sigla_em_uso aparece no campo", async () => {
    const mock = setup();
    mock.on("POST /api/v1/unidades", apiError(409, "sigla_em_uso", "Já existe uma unidade com esta sigla."));
    const { user } = renderApp("/unidades");
    await screen.findByRole("table", { name: "Lista de unidades de medida" });
    await user.click(screen.getByRole("button", { name: "Nova unidade" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova unidade" });
    await user.type(within(dialog).getByLabelText(/^Sigla/), "UN");
    await user.type(within(dialog).getByLabelText(/^Nome/), "Outra");
    await user.click(within(dialog).getByRole("button", { name: "Criar unidade" }));
    expect(await within(dialog).findByText("Já existe uma unidade com esta sigla.")).toBeTruthy();
  });

  it("edita só o que mudou; reduzir casas com produtos mostra unidade_em_uso no campo", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/unidades/2", apiError(409, "unidade_em_uso", "Há produtos nesta unidade: não é possível reduzir as casas decimais."));
    const { user } = renderApp("/unidades");
    await screen.findByRole("table", { name: "Lista de unidades de medida" });
    await user.click(screen.getByRole("button", { name: "Editar KG" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar unidade" });
    await user.selectOptions(within(dialog).getByLabelText(/^Casas decimais/), "1");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("Há produtos nesta unidade: não é possível reduzir as casas decimais.")).toBeTruthy();
    expect(mock.callsTo("PATCH /api/v1/unidades/2")[0]!.body).toEqual({ casas_decimais: 1 });
  });

  it("excluir em uso mostra a mensagem do backend no diálogo", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/unidades/1", apiError(409, "unidade_em_uso", "Há produtos usando esta unidade."));
    const { user } = renderApp("/unidades");
    await screen.findByRole("table", { name: "Lista de unidades de medida" });
    await user.click(screen.getByRole("button", { name: "Excluir UN" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir unidade" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Há produtos usando esta unidade.");
  });

  it("sem permissões de escrita só lista", async () => {
    setup(["catalogo.listar"]);
    renderApp("/unidades");
    await screen.findByRole("table", { name: "Lista de unidades de medida" });
    expect(screen.queryByRole("button", { name: "Nova unidade" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excluir/ })).toBeNull();
  });
});

describe("CategoriesPage", () => {
  function setup(permissoes: string[] = CATALOG_PERMISSIONS) {
    const mock = mockApi();
    signIn({ permissoes });
    mock.on("GET /api/v1/categorias", json(200, [BEBIDAS, { ...LANCHES, ativo: false }]));
    return mock;
  }

  it("lista categorias com situação", async () => {
    setup();
    renderApp("/categorias");
    const table = await screen.findByRole("table", { name: "Lista de categorias" });
    expect(within(table).getByText("Ativa")).toBeTruthy();
    expect(within(table).getByText("Inativa")).toBeTruthy();
    expect(within(table).getByText("Salgados e sanduíches")).toBeTruthy();
  });

  it("cria categoria; nome em uso aparece no campo", async () => {
    const mock = setup();
    mock.on("POST /api/v1/categorias", apiError(409, "categoria_nome_em_uso", "Já existe uma categoria com este nome."));
    const { user } = renderApp("/categorias");
    await screen.findByRole("table", { name: "Lista de categorias" });
    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova categoria" });
    await user.type(within(dialog).getByLabelText(/^Nome/), "Bebidas");
    await user.click(within(dialog).getByRole("button", { name: "Criar categoria" }));
    expect(await within(dialog).findByText("Já existe uma categoria com este nome.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/categorias")[0]!.body).toEqual({ nome: "Bebidas", descricao: null, ativo: true });
  });

  it("edita (só o que mudou) e exclui; categoria_em_uso aparece no diálogo", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/categorias/1", json(200, { ...BEBIDAS, descricao: "Líquidos" }));
    mock.on("DELETE /api/v1/categorias/1", apiError(409, "categoria_em_uso", "Há produtos nesta categoria."));
    const { user } = renderApp("/categorias");
    await screen.findByRole("table", { name: "Lista de categorias" });

    await user.click(screen.getByRole("button", { name: "Editar Bebidas" }));
    const edit = await screen.findByRole("dialog", { name: "Editar categoria" });
    await user.type(within(edit).getByLabelText("Descrição"), "Líquidos");
    await user.click(within(edit).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("PATCH /api/v1/categorias/1")[0]!.body).toEqual({ descricao: "Líquidos" });

    await user.click(screen.getByRole("button", { name: "Excluir Bebidas" }));
    const confirm = await screen.findByRole("dialog", { name: "Excluir categoria" });
    await user.click(within(confirm).getByRole("button", { name: "Excluir" }));
    expect((await within(confirm).findByRole("alert")).textContent).toContain("Há produtos nesta categoria.");
  });
});
