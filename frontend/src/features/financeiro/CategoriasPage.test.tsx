import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

const categoria = (over: Record<string, unknown> = {}) => ({ id: 1, nome: "Aluguel", tipo: "despesa", ativa: true, ...over });
const DESPESAS = [categoria(), categoria({ id: 2, nome: "Energia e água" }), categoria({ id: 3, nome: "Obras", ativa: false })];
const RECEITAS = [categoria({ id: 9, nome: "Vendas fiado", tipo: "receita" })];

beforeEach(() => {
  session.reset("anonymous");
});

function setup(permissoes = ["financeiro.listar", "financeiro.categorias"]) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/categorias-financeiras", (call) => json(200, call.query.get("tipo") === "receita" ? RECEITAS : DESPESAS));
  return mock;
}

describe("CategoriasPage", () => {
  it("lista as despesas por padrão, com situação, e troca para receitas na aba", async () => {
    const mock = setup();
    const { user } = renderApp("/financeiro/categorias");

    expect(await screen.findByText("Energia e água")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/categorias-financeiras")[0]?.query.get("tipo")).toBe("despesa");
    expect(screen.getByText("Inativa")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Receitas" }));
    expect(await screen.findByText("Vendas fiado")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/categorias-financeiras").some((c) => c.query.get("tipo") === "receita")).toBe(true);
  });

  it("sem financeiro.categorias a rota mostra acesso negado e não consulta a API", async () => {
    const mock = setup(["financeiro.listar"]);
    renderApp("/financeiro/categorias");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/categorias-financeiras")).toHaveLength(0);
  });

  it("cadastrar usa o tipo da aba, valida o nome e mostra nome repetido no campo", async () => {
    const mock = setup();
    let calls = 0;
    mock.on("POST /api/v1/categorias-financeiras", () => {
      calls += 1;
      return calls === 1 ? apiError(409, "categoria_nome_em_uso", "Já existe uma categoria com este nome e tipo.") : json(201, categoria({ id: 10, nome: "Manutenção" }));
    });
    const { user } = renderApp("/financeiro/categorias");

    await user.click(await screen.findByRole("button", { name: "Nova categoria" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova categoria" });
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Informe o nome da categoria.")).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/^Nome/), "Aluguel");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Já existe uma categoria com este nome e tipo.")).toBeTruthy();

    await user.clear(within(dialog).getByLabelText(/^Nome/));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Manutenção");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/categorias-financeiras")).toHaveLength(2));
    expect(mock.callsTo("POST /api/v1/categorias-financeiras")[1]?.body).toEqual({ nome: "Manutenção", tipo: "despesa" });
    expect(await screen.findByText("Categoria cadastrada.")).toBeTruthy();
  });

  it("editar envia só o nome; ativar e desativar enviam ativa", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/categorias-financeiras/1", json(200, categoria({ nome: "Aluguel do salão" })));
    mock.on("PATCH /api/v1/categorias-financeiras/2", json(200, categoria({ id: 2, ativa: false })));
    const { user } = renderApp("/financeiro/categorias");

    await user.click(await screen.findByRole("button", { name: "Editar Aluguel" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Aluguel" });
    const tipo = within(dialog).getByLabelText(/^Tipo/) as HTMLSelectElement;
    expect(tipo.disabled).toBe(true);
    const nome = within(dialog).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Aluguel do salão");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/categorias-financeiras/1")[0]?.body).toEqual({ nome: "Aluguel do salão" }));

    await user.click(screen.getByRole("button", { name: "Desativar Energia e água" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/categorias-financeiras/2")[0]?.body).toEqual({ ativa: false }));
  });

  it("excluir pede confirmação e, se a categoria tem contas, orienta a desativar", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/categorias-financeiras/1", apiError(409, "categoria_em_uso", "Há contas nesta categoria: desative-a em vez de excluir."));
    const { user } = renderApp("/financeiro/categorias");

    await user.click(await screen.findByRole("button", { name: "Excluir Aluguel" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir categoria" });
    expect(mock.callsTo("DELETE /api/v1/categorias-financeiras/1")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect(await within(dialog).findByText(/desative-a em vez de excluir.*Desativar/)).toBeTruthy();
  });
});
