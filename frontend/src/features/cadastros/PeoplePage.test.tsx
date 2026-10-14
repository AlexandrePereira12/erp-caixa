import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PEOPLE_PERMISSIONS, pessoa } from "./fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

const PEOPLE = [
  pessoa(),
  pessoa({ id: 2, tipo: "J", nome: "Padaria Central Ltda", nome_fantasia: "Padaria do Zé", documento: "11222333000181", telefone: null, email: null, papeis: ["fornecedor"], cliente: null, ativo: false }),
  pessoa({ id: 3, nome: "João Fiado", papeis: ["cliente"], cliente: { aceita_fiado: true, limite_fiado: "300.00" } }),
];

function setup(permissoes: string[] = PEOPLE_PERMISSIONS, list = json(200, page(PEOPLE, { limite: 20 }))) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/pessoas", list);
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("PeoplePage: lista", () => {
  it("renderiza nome, documento com máscara, contato, papéis, fiado e situação", async () => {
    const mock = setup();
    renderApp("/pessoas");

    const table = await screen.findByRole("table", { name: "Lista de pessoas" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText("Maria Souza")).toBeTruthy();
    expect(within(rows[1]!).getByText("529.982.247-25")).toBeTruthy();
    expect(within(rows[1]!).getByText("maria@exemplo.com.br")).toBeTruthy();
    expect(within(rows[1]!).getByText("Cliente")).toBeTruthy();
    expect(within(rows[2]!).getByText("Padaria do Zé")).toBeTruthy();
    expect(within(rows[2]!).getByText("11.222.333/0001-81")).toBeTruthy();
    expect(within(rows[2]!).getByText("Fornecedor")).toBeTruthy();
    expect(within(rows[2]!).getByText("Inativo")).toBeTruthy();
    expect(within(rows[3]!).getByText("Fiado")).toBeTruthy();

    const call = mock.callsTo("GET /api/v1/pessoas")[0]!;
    expect(call.query.get("limite")).toBe("20");
    expect(call.query.get("deslocamento")).toBe("0");
  });

  it("estado vazio e erro com nova tentativa", async () => {
    const mock = setup(PEOPLE_PERMISSIONS, apiError(500, "erro_interno", "Falha ao consultar pessoas."));
    const { user } = renderApp("/pessoas");
    expect((await screen.findByRole("alert")).textContent).toContain("Falha ao consultar pessoas.");
    mock.on("GET /api/v1/pessoas", json(200, page([])));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma pessoa cadastrada")).toBeTruthy();
  });
});

describe("PeoplePage: filtros na URL", () => {
  it("lê q, papel, situação e página da URL e manda para a API", async () => {
    const mock = setup();
    renderApp("/pessoas?q=ana&papel=fornecedor&ativo=false&pagina=3");
    await screen.findByRole("table", { name: "Lista de pessoas" });

    const query = mock.callsTo("GET /api/v1/pessoas")[0]!.query;
    expect(query.get("q")).toBe("ana");
    expect(query.get("papel")).toBe("fornecedor");
    expect(query.get("ativo")).toBe("false");
    expect(query.get("deslocamento")).toBe("40");
    expect((screen.getByLabelText("Papel") as HTMLSelectElement).value).toBe("fornecedor");
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("false");
    expect((screen.getByLabelText("Buscar") as HTMLInputElement).value).toBe("ana");
  });

  it("escolher filtros atualiza a URL e a consulta; busca tem debounce; limpar zera tudo", async () => {
    const mock = setup();
    const { user, router } = renderApp("/pessoas");
    await screen.findByRole("table", { name: "Lista de pessoas" });

    await user.selectOptions(screen.getByLabelText("Papel"), "cliente");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/pessoas").at(-1)!.query.get("papel")).toBe("cliente"));
    expect(router.state.location.search).toContain("papel=cliente");

    await user.selectOptions(screen.getByLabelText("Situação"), "true");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/pessoas").at(-1)!.query.get("ativo")).toBe("true"));
    expect(router.state.location.search).toContain("ativo=true");

    await user.type(screen.getByLabelText("Buscar"), "maria");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/pessoas").at(-1)!.query.get("q")).toBe("maria"), { timeout: 2000 });
    expect(router.state.location.search).toContain("q=maria");
    const last = mock.callsTo("GET /api/v1/pessoas").at(-1)!.query;
    expect([last.get("papel"), last.get("ativo"), last.get("deslocamento")]).toEqual(["cliente", "true", "0"]);

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    // A consulta sem filtros já está em cache (staleTime): a prova é a tela voltar ao estado inicial.
    expect((screen.getByLabelText("Papel") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Buscar") as HTMLInputElement).value).toBe("");
  });

  it("filtros sem resultado orientam a limpar", async () => {
    setup(PEOPLE_PERMISSIONS, json(200, page([])));
    renderApp("/pessoas?q=zzz");
    expect(await screen.findByText("Nenhuma pessoa encontrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeTruthy();
  });
});

describe("PeoplePage: permissões", () => {
  it("só com pessoas.listar não há criar, cadastro rápido, editar nem excluir", async () => {
    setup(["pessoas.listar"]);
    renderApp("/pessoas");
    await screen.findByText("Maria Souza");
    expect(screen.queryByRole("button", { name: "Nova pessoa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cadastro rápido" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excluir/ })).toBeNull();
  });

  it("cadastro rápido aparece para quem tem só pessoas.cadastro_rapido (além de listar)", async () => {
    setup(["pessoas.listar", "pessoas.cadastro_rapido"]);
    renderApp("/pessoas");
    await screen.findByText("Maria Souza");
    expect(screen.getByRole("button", { name: "Cadastro rápido" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nova pessoa" })).toBeNull();
  });

  it("sem pessoas.listar a rota mostra acesso negado e não consulta a API", async () => {
    const mock = setup(["catalogo.listar"]);
    renderApp("/pessoas");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/pessoas")).toHaveLength(0);
  });

  it("o menu lista Pessoas, Produtos, Estoque e Inventários só conforme as permissões", async () => {
    setup(["pessoas.listar", "estoque.listar"]);
    const { user } = renderApp("/pessoas");
    const nav = await screen.findByRole("navigation", { name: "Principal" });
    // o módulo da página atual (Cadastros) já vem aberto; o de Estoque é aberto à mão
    expect(within(nav).getByRole("link", { name: "Pessoas" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Produtos" })).toBeNull();
    await user.click(within(nav).getByRole("button", { name: "Estoque" }));
    expect(within(nav).getByRole("link", { name: "Saldos e movimentos" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Inventários" })).toBeNull();
  });
});

describe("PeoplePage: excluir", () => {
  it("pede confirmação, envia DELETE e avisa", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/pessoas/1", json(204));
    const { user } = renderApp("/pessoas");
    await screen.findByText("Maria Souza");

    await user.click(screen.getByRole("button", { name: "Excluir Maria Souza" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir pessoa" });
    expect(mock.callsTo("DELETE /api/v1/pessoas/1")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(mock.callsTo("DELETE /api/v1/pessoas/1")).toHaveLength(1));
    expect(await screen.findByText("Maria Souza foi excluído.")).toBeTruthy();
  });

  it("erro do backend aparece dentro do diálogo", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/pessoas/1", apiError(403, "sem_permissao", "Você não pode excluir esta pessoa."));
    const { user } = renderApp("/pessoas");
    await screen.findByText("Maria Souza");
    await user.click(screen.getByRole("button", { name: "Excluir Maria Souza" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir pessoa" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Você não pode excluir esta pessoa.");
  });
});
