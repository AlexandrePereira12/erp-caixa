import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

const P = (codigo: string, descricao: string) => ({ codigo, modulo: codigo.split(".")[0]!, descricao });
const CATALOG = [P("usuarios.listar", "Listar usuários"), P("usuarios.criar", "Criar usuários"), P("auditoria.listar", "Ver auditoria")];

const ROLES = [
  { id: 1, nome: "Administrador", descricao: "Acesso total", sistema: true, limite_desconto_pct: "100.00", permissoes: CATALOG },
  { id: 5, nome: "Caixa", descricao: "Operação de caixa", sistema: false, limite_desconto_pct: "5.00", permissoes: [CATALOG[0]!] },
];

function setup(meOverrides = {}) {
  const mock = mockApi();
  signIn(meOverrides);
  mock.on("GET /api/v1/papeis", json(200, ROLES));
  mock.on("GET /api/v1/permissoes", json(200, CATALOG));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("RolesPage", () => {
  it("lista papéis e marca os de sistema", async () => {
    setup();
    renderApp("/papeis");
    const nav = await screen.findByRole("navigation", { name: "Papéis" });
    expect(within(nav).getByText("Administrador")).toBeTruthy();
    expect(within(nav).getByText("Sistema")).toBeTruthy();
    expect(within(nav).getByText("Caixa")).toBeTruthy();
  });

  it("papel de sistema: nome travado, sem exclusão, mas o limite de desconto é editável", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/papeis/1", json(200, { ...ROLES[0], limite_desconto_pct: "90.00" }));
    const { user } = renderApp("/papeis?papel=1");
    expect(await screen.findByText("Papel de sistema")).toBeTruthy();
    expect((screen.getByLabelText(/^Nome/) as HTMLInputElement).disabled).toBe(true);
    const limite = screen.getByLabelText(/Limite de desconto/) as HTMLInputElement;
    expect(limite.disabled).toBe(false);
    expect(limite.value).toBe("100,00");
    await user.clear(limite);
    await user.type(limite, "90");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/papeis/1")).toHaveLength(1));
    // Só o limite vai no PATCH, como string decimal.
    expect(mock.callsTo("PATCH /api/v1/papeis/1")[0]!.body).toEqual({ limite_desconto_pct: "90.00" });
    expect(screen.queryByRole("button", { name: "Salvar permissões" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir papel" })).toBeNull();
    // As permissões do papel ainda são listadas, agrupadas por módulo.
    expect(screen.getByRole("heading", { name: "Usuários", level: 3 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Auditoria", level: 3 })).toBeTruthy();
  });

  it("papel personalizado: matriz agrupada por módulo e salvar permissões envia PUT", async () => {
    const mock = setup();
    mock.on("PUT /api/v1/papeis/5/permissoes", json(200, { ...ROLES[1], permissoes: [CATALOG[0], CATALOG[1]] }));
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });

    const usuarios = screen.getByRole("group", { name: "Usuários" });
    expect(within(usuarios).getByRole("checkbox", { name: /Listar usuários/ })).toHaveProperty("checked", true);
    expect(within(usuarios).getByRole("checkbox", { name: /Criar usuários/ })).toHaveProperty("checked", false);
    expect(screen.getByRole("group", { name: "Auditoria" })).toBeTruthy();

    expect((screen.getByRole("button", { name: "Salvar permissões" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(usuarios).getByRole("checkbox", { name: /Criar usuários/ }));
    await user.click(screen.getByRole("button", { name: "Salvar permissões" }));

    await waitFor(() => expect(mock.callsTo("PUT /api/v1/papeis/5/permissoes")).toHaveLength(1));
    expect([...(mock.callsTo("PUT /api/v1/papeis/5/permissoes")[0]!.body as { permissoes: string[] }).permissoes].sort()).toEqual(["usuarios.criar", "usuarios.listar"]);
    expect(await screen.findByText("Permissões do papel salvas.")).toBeTruthy();
  });

  it("'Selecionar todas' do módulo marca todas as permissões dele", async () => {
    setup();
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });
    const usuarios = screen.getByRole("group", { name: "Usuários" });
    await user.click(within(usuarios).getByRole("checkbox", { name: "Selecionar todas as permissões de Usuários" }));
    expect(within(usuarios).getByRole("checkbox", { name: /Criar usuários/ })).toHaveProperty("checked", true);
  });

  it("editar dados envia só o que mudou", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/papeis/5", json(200, { ...ROLES[1], nome: "Caixa Sênior" }));
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });

    const nome = screen.getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Caixa Sênior");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/papeis/5")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/papeis/5")[0]!.body).toEqual({ nome: "Caixa Sênior" });
  });

  it("excluir papel em uso mostra o erro do backend no diálogo", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/papeis/5", apiError(409, "papel_em_uso", "O papel está atribuído a usuários e não pode ser excluído."));
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });

    await user.click(screen.getByRole("button", { name: "Excluir papel" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir papel" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain("O papel está atribuído a usuários");
  });

  it("criar papel: valida o nome e envia nome, descrição e permissões", async () => {
    const mock = setup();
    mock.on("POST /api/v1/papeis", json(201, { id: 9, nome: "Auditor", descricao: "Só leitura", sistema: false, limite_desconto_pct: "12.50", permissoes: [CATALOG[2]] }));
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });

    await user.click(screen.getByRole("button", { name: "Novo papel" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo papel" });
    await user.click(within(dialog).getByRole("button", { name: "Criar papel" }));
    expect(await within(dialog).findByText("Informe o nome do papel.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/papeis")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Nome/), "Auditor");
    await user.type(within(dialog).getByLabelText("Descrição"), "Só leitura");
    const limite = within(dialog).getByLabelText(/Limite de desconto/);
    await user.clear(limite);
    await user.type(limite, "12,5");
    await user.click(within(dialog).getByRole("checkbox", { name: /Ver auditoria/ }));
    await user.click(within(dialog).getByRole("button", { name: "Criar papel" }));

    await waitFor(() => expect(mock.callsTo("POST /api/v1/papeis")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/papeis")[0]!.body).toEqual({ nome: "Auditor", descricao: "Só leitura", limite_desconto_pct: "12.50", permissoes: ["auditoria.listar"] });
  });

  it("limite de desconto fora de 0-100 é recusado antes de enviar", async () => {
    const mock = setup();
    const { user } = renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });
    const limite = screen.getByLabelText(/Limite de desconto/);
    await user.clear(limite);
    await user.type(limite, "150");
    await user.click(screen.getByRole("button", { name: "Salvar dados" }));
    expect(await screen.findByText("O limite deve ficar entre 0 e 100.")).toBeTruthy();
    expect(mock.callsTo("PATCH /api/v1/papeis/5")).toHaveLength(0);
  });

  it("sem papeis.editar/excluir/criar a tela é só consulta", async () => {
    setup({ permissoes: ["papeis.listar", "permissoes.listar"] });
    renderApp("/papeis?papel=5");
    await screen.findByRole("heading", { name: "Caixa" });
    expect(screen.queryByRole("button", { name: "Novo papel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar dados" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir papel" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Usuários" })).getByRole("checkbox", { name: /Listar usuários/ })).toHaveProperty("disabled", true);
  });

  it("erro ao listar papéis oferece nova tentativa", async () => {
    const mock = setup();
    mock.on("GET /api/v1/papeis", apiError(403, "sem_permissao", "Sem permissão para listar papéis."));
    renderApp("/papeis");
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão para listar papéis.");
  });
});
