import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn, usuario } from "@/test/render";

const ROLES = [
  { id: 1, nome: "Administrador", descricao: "Acesso total", sistema: true, permissoes: [] },
  { id: 2, nome: "Gerente", descricao: null, sistema: false, permissoes: [] },
];

function setup(listHandler = json(200, page([usuario(), usuario({ id: 11, nome: "Carla Dias", email: "carla@exemplo.com.br", suspenso: true, papeis: [{ id: 1, nome: "Administrador" }], ultimo_login_em: null })])), meOverrides = {}) {
  const mock = mockApi();
  signIn(meOverrides);
  mock.on("GET /api/v1/usuarios", listHandler);
  mock.on("GET /api/v1/papeis", json(200, ROLES));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("UsersPage: listagem", () => {
  it("renderiza os itens com papéis, situação e último acesso", async () => {
    const mock = setup();
    renderApp("/usuarios");

    const table = await screen.findByRole("table", { name: "Lista de usuários" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // cabeçalho + 2
    expect(within(rows[1]!).getByText("Bruno Lima")).toBeTruthy();
    expect(within(rows[1]!).getByText("Gerente")).toBeTruthy();
    expect(within(rows[1]!).getByText("Ativo")).toBeTruthy();
    expect(within(rows[2]!).getByText("Suspenso")).toBeTruthy();
    expect(within(rows[2]!).getByText("Nunca")).toBeTruthy();

    const call = mock.callsTo("GET /api/v1/usuarios")[0]!;
    expect(call.query.get("limite")).toBe("20");
    expect(call.query.get("deslocamento")).toBe("0");
    expect(call.headers.get("authorization")).toBe("Bearer tok-teste");
  });

  it("mostra carregando, depois a lista", async () => {
    setup();
    renderApp("/usuarios");
    expect(screen.getByText("Carregando…")).toBeTruthy();
    expect(await screen.findByText("Bruno Lima")).toBeTruthy();
  });

  it("estado vazio", async () => {
    setup(json(200, page([])));
    renderApp("/usuarios");
    expect(await screen.findByText("Nenhum usuário cadastrado")).toBeTruthy();
  });

  it("paginação: Próxima/Anterior pedem o deslocamento certo", async () => {
    const mock = setup();
    mock.on("GET /api/v1/usuarios", (call) => {
      const offset = Number(call.query.get("deslocamento"));
      return json(200, page([usuario({ id: 100 + offset, nome: `Usuário offset ${offset}` })], { total: 45, deslocamento: offset }));
    });
    const { user } = renderApp("/usuarios");

    expect(await screen.findByText("Usuário offset 0")).toBeTruthy();
    expect(screen.getByText("Mostrando 1–20 de 45")).toBeTruthy();
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Usuário offset 20")).toBeTruthy();
    expect(screen.getByText("Mostrando 21–40 de 45")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Usuário offset 40")).toBeTruthy();
    expect(screen.getByText("Mostrando 41–45 de 45")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement).disabled).toBe(true);

    // Voltar reaproveita o cache da página 2 (sem nova requisição) e mantém a navegação coerente.
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Usuário offset 20")).toBeTruthy();
    expect(screen.getByText("Mostrando 21–40 de 45")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/usuarios").map((c) => c.query.get("deslocamento"))).toEqual(["0", "20", "40"]);
  });

  it("erro do backend aparece com a mensagem e permite tentar de novo", async () => {
    const mock = setup(apiError(500, "erro_interno", "Falha ao consultar usuários."));
    const { user } = renderApp("/usuarios");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Falha ao consultar usuários.");

    mock.on("GET /api/v1/usuarios", json(200, page([usuario()])));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Bruno Lima")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("403 sem_permissao do backend mostra a mensagem clara", async () => {
    setup(apiError(403, "sem_permissao", "Você não tem permissão para listar usuários."));
    renderApp("/usuarios");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Você não tem permissão para listar usuários.");
  });

  it("busca com debounce, filtro de situação e papel vão como query", async () => {
    const mock = setup();
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.type(screen.getByLabelText("Buscar"), "carla");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/usuarios").at(-1)!.query.get("q")).toBe("carla"), { timeout: 2000 });
    // Não dispara uma requisição por tecla.
    expect(mock.callsTo("GET /api/v1/usuarios").length).toBeLessThanOrEqual(3);

    await user.selectOptions(screen.getByLabelText("Situação"), "suspensos");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/usuarios").at(-1)!.query.get("suspenso")).toBe("true"));

    await user.selectOptions(await screen.findByLabelText("Papel"), "2");
    await waitFor(() => expect(mock.callsTo("GET /api/v1/usuarios").at(-1)!.query.get("papel_id")).toBe("2"));

    expect(mock.callsTo("GET /api/v1/usuarios").at(-1)!.query.get("deslocamento")).toBe("0");
  });

  it("trocar outro filtro durante o debounce não apaga o filtro novo nem a busca", async () => {
    const mock = setup();
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.type(screen.getByLabelText("Buscar"), "carla");
    await user.selectOptions(screen.getByLabelText("Situação"), "suspensos"); // antes dos 300 ms do debounce

    await waitFor(
      () => {
        const last = mock.callsTo("GET /api/v1/usuarios").at(-1)!.query;
        expect(last.get("q")).toBe("carla");
        expect(last.get("suspenso")).toBe("true");
      },
      { timeout: 2000 },
    );
    // E continua assim depois que tudo assenta.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const last = mock.callsTo("GET /api/v1/usuarios").at(-1)!.query;
    expect([last.get("q"), last.get("suspenso")]).toEqual(["carla", "true"]);
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("suspensos");
  });

  it("filtros sem resultado orientam a limpar", async () => {
    setup(json(200, page([])));
    renderApp("/usuarios?q=zzz");
    expect(await screen.findByText("Nenhum usuário encontrado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeTruthy();
  });
});

describe("UsersPage: permissões de interface", () => {
  it("só com usuarios.listar não há criar nem ações por linha", async () => {
    setup(undefined, { permissoes: ["usuarios.listar"] });
    renderApp("/usuarios");
    await screen.findByText("Bruno Lima");
    expect(screen.queryByRole("button", { name: "Novo usuário" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir/ })).toBeNull();
    // Sem papeis.listar o filtro de papel nem aparece.
    expect(screen.queryByLabelText("Papel")).toBeNull();
  });

  it("não oferece suspender/excluir o próprio usuário", async () => {
    setup(json(200, page([usuario({ id: 1, nome: "Ana Souza", email: "ana@exemplo.com.br" })])));
    renderApp("/usuarios");
    await screen.findByRole("table", { name: "Lista de usuários" });
    expect(screen.getByRole("button", { name: "Editar Ana Souza" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspender Ana Souza" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir Ana Souza" })).toBeNull();
  });
});

describe("UsersPage: ações", () => {
  it("criar usuário: erro email_em_uso aparece no campo e o modal continua aberto", async () => {
    const mock = setup();
    mock.on("POST /api/v1/usuarios", apiError(409, "email_em_uso", "Já existe um usuário com este e-mail."));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Novo usuário" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo usuário" });
    await user.type(within(dialog).getByLabelText(/^Nome/), "Diego Alves");
    await user.type(within(dialog).getByLabelText(/^E-mail/), "bruno@exemplo.com.br");
    await user.type(within(dialog).getByLabelText(/^Senha temporária/), "temporaria-123");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Gerente/ }));
    await user.click(within(dialog).getByRole("button", { name: "Criar usuário" }));

    expect(await within(dialog).findByText("Já existe um usuário com este e-mail.")).toBeTruthy();
    expect(within(dialog).getByLabelText(/^E-mail/).getAttribute("aria-invalid")).toBe("true");
    expect(mock.callsTo("POST /api/v1/usuarios")[0]!.body).toEqual({ nome: "Diego Alves", email: "bruno@exemplo.com.br", senha_temporaria: "temporaria-123", papeis: [2] });
    expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBeTruthy();
  });

  it("sem papeis.listar não dá para criar usuário (papel é obrigatório) e o aviso explica", async () => {
    setup(undefined, { permissoes: ["usuarios.listar", "usuarios.criar"] });
    const { user } = renderApp("/usuarios");
    await screen.findByRole("table", { name: "Lista de usuários" });

    await user.click(screen.getByRole("button", { name: "Novo usuário" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo usuário" });
    expect(within(dialog).getByText(/não tem permissão para listar os papéis/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Criar usuário" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("criar usuário: valida nome, e-mail, senha e papel antes de enviar", async () => {
    const mock = setup();
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Novo usuário" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo usuário" });
    await user.type(within(dialog).getByLabelText(/^E-mail/), "nao-e-email");
    await user.type(within(dialog).getByLabelText(/^Senha temporária/), "curta");
    await user.click(within(dialog).getByRole("button", { name: "Criar usuário" }));

    expect(await within(dialog).findByText("Informe o nome.")).toBeTruthy();
    expect(within(dialog).getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(within(dialog).getByText(/no mínimo 10 caracteres/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/usuarios")).toHaveLength(0);
  });

  it("criar usuário com sucesso fecha o modal e atualiza a lista", async () => {
    const mock = setup();
    mock.on("POST /api/v1/usuarios", json(201, usuario({ id: 50, nome: "Diego Alves" })));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Novo usuário" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo usuário" });
    await user.type(within(dialog).getByLabelText(/^Nome/), "Diego Alves");
    await user.type(within(dialog).getByLabelText(/^E-mail/), "diego@exemplo.com.br");
    await user.type(within(dialog).getByLabelText(/^Senha temporária/), "temporaria-123");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Gerente/ }));
    await user.click(within(dialog).getByRole("button", { name: "Criar usuário" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Usuário criado.")).toBeTruthy();
    await waitFor(() => expect(mock.callsTo("GET /api/v1/usuarios").length).toBeGreaterThanOrEqual(2));
  });

  it("editar envia só os campos alterados", async () => {
    const mock = setup();
    mock.on("PATCH /api/v1/usuarios/10", json(200, usuario({ nome: "Bruno L. Lima" })));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Editar Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar usuário" });
    const nome = within(dialog).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Bruno L. Lima");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("PATCH /api/v1/usuarios/10")[0]!.body).toEqual({ nome: "Bruno L. Lima" });
  });

  it("suspender pede confirmação e mostra erro do backend dentro do diálogo", async () => {
    const mock = setup();
    mock.on("POST /api/v1/usuarios/10/suspender", apiError(409, "ultimo_administrador", "Não é possível suspender o último administrador."));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Suspender Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: "Suspender usuário" });
    expect(mock.callsTo("POST /api/v1/usuarios/10/suspender")).toHaveLength(0); // ainda não confirmou
    await user.click(within(dialog).getByRole("button", { name: "Suspender" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain("Não é possível suspender o último administrador.");
  });

  it("reativar usuário suspenso dispara a ação e avisa", async () => {
    const mock = setup();
    mock.on("POST /api/v1/usuarios/11/reativar", json(200, usuario({ id: 11, nome: "Carla Dias" })));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Carla Dias");

    await user.click(screen.getByRole("button", { name: "Reativar Carla Dias" }));
    expect(await screen.findByText("Carla Dias foi reativado.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/usuarios/11/reativar")).toHaveLength(1);
  });

  it("redefinir senha envia a senha temporária", async () => {
    const mock = setup();
    mock.on("POST /api/v1/usuarios/10/redefinir-senha", json(204));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Redefinir senha de Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: "Redefinir senha" });
    await user.type(within(dialog).getByLabelText(/^Senha temporária/), "outra-temporaria-9");
    await user.click(within(dialog).getByRole("button", { name: "Redefinir senha" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/usuarios/10/redefinir-senha")[0]!.body).toEqual({ senha_temporaria: "outra-temporaria-9" });
  });

  it("excluir exige confirmação e envia DELETE", async () => {
    const mock = setup();
    mock.on("DELETE /api/v1/usuarios/10", json(204));
    const { user } = renderApp("/usuarios");
    await screen.findByText("Bruno Lima");

    await user.click(screen.getByRole("button", { name: "Excluir Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir usuário" });
    expect(mock.callsTo("DELETE /api/v1/usuarios/10")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(mock.callsTo("DELETE /api/v1/usuarios/10")).toHaveLength(1));
    expect(await screen.findByText("Bruno Lima foi excluído.")).toBeTruthy();
  });
});
