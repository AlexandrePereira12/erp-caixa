import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn, usuario } from "@/test/render";

const ENTRY = {
  id: 77,
  ocorrido_em: "2026-10-12T15:04:05+00:00",
  usuario_id: 1,
  usuario_nome: "Ana Souza",
  papel: "Administrador",
  ip: "10.0.0.8",
  user_agent: "Mozilla/5.0",
  request_id: "req-abc-123",
  acao: "editar",
  modulo: "usuarios",
  recurso: "usuario",
  recurso_id: "10",
  descricao: "Usuário editado",
  antes: { nome: "Bruno", email: "b@x.com", senha_hash: "abc" },
  depois: { nome: "Bruno Lima", email: "b@x.com", senha_hash: "def" },
  campos_alterados: ["nome", "senha_hash"],
};

function setup(meOverrides = {}) {
  const mock = mockApi();
  signIn(meOverrides);
  mock.on("GET /api/v1/auditoria", json(200, page([ENTRY], { limite: 25 })));
  mock.on("GET /api/v1/auditoria/77", json(200, ENTRY));
  mock.on("GET /api/v1/usuarios", json(200, page([usuario({ id: 1, nome: "Ana Souza" }), usuario({ id: 10 })], { limite: 200 })));
  return mock;
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("AuditPage", () => {
  it("lista registros recentes com link para o detalhe", async () => {
    setup();
    renderApp("/auditoria");
    const table = await screen.findByRole("table", { name: "Registros de auditoria" });
    expect(within(table).getByText("Usuário editado")).toBeTruthy();
    expect(within(table).getByText("editar")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Ver detalhes do registro 77" }).getAttribute("href")).toBe("/auditoria/77");
  });

  it("filtros enviam ação, módulo, usuário e período em ISO", async () => {
    const mock = setup();
    const { user } = renderApp("/auditoria");
    await screen.findByRole("table");

    await user.type(screen.getByLabelText("Ação"), "editar");
    await user.type(screen.getByLabelText("Módulo"), "usuarios");
    await user.selectOptions(await screen.findByLabelText("Usuário"), "1");
    await user.type(screen.getByLabelText("De"), "2026-10-01T08:00");
    await user.type(screen.getByLabelText("Até"), "2026-10-13T18:30");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    await waitFor(() => expect(mock.callsTo("GET /api/v1/auditoria").at(-1)!.query.get("acao")).toBe("editar"));
    const q = mock.callsTo("GET /api/v1/auditoria").at(-1)!.query;
    expect(q.get("modulo")).toBe("usuarios");
    expect(q.get("usuario_id")).toBe("1");
    expect(q.get("de")).toBe(new Date("2026-10-01T08:00").toISOString());
    expect(q.get("ate")).toBe(new Date("2026-10-13T18:30").toISOString());
    expect(q.get("limite")).toBe("25");
  });

  it("período invertido é barrado no cliente", async () => {
    const mock = setup();
    const { user } = renderApp("/auditoria");
    await screen.findByRole("table");
    const before = mock.callsTo("GET /api/v1/auditoria").length;

    await user.type(screen.getByLabelText("De"), "2026-10-13T10:00");
    await user.type(screen.getByLabelText("Até"), "2026-10-01T10:00");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(await screen.findByText("A data inicial deve ser anterior à data final.")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/auditoria")).toHaveLength(before);
  });

  it("sem usuarios.listar o filtro de usuário vira campo numérico", async () => {
    setup({ permissoes: ["auditoria.listar"] });
    renderApp("/auditoria");
    await screen.findByRole("table");
    const field = screen.getByLabelText("ID do usuário") as HTMLInputElement;
    expect(field.type).toBe("number");
  });

  it("erro e vazio têm estado próprio", async () => {
    const mock = setup();
    mock.on("GET /api/v1/auditoria", apiError(500, "erro_interno", "Falha na auditoria."));
    renderApp("/auditoria");
    expect((await screen.findByRole("alert")).textContent).toContain("Falha na auditoria.");
  });

  it("estado vazio com filtros ativos", async () => {
    const mock = setup();
    mock.on("GET /api/v1/auditoria", json(200, page([], { limite: 25 })));
    renderApp("/auditoria?acao=nada");
    expect(await screen.findByText("Nenhum registro encontrado")).toBeTruthy();
  });
});

describe("AuditDetailPage", () => {
  it("mostra metadados e o diff antes/depois com campos alterados", async () => {
    setup();
    renderApp("/auditoria/77");

    expect(await screen.findByRole("heading", { name: "Registro #77" })).toBeTruthy();
    expect(screen.getByText("10.0.0.8")).toBeTruthy();
    expect(screen.getByText("req-abc-123")).toBeTruthy();

    const diff = screen.getByRole("table", { name: /antes e depois/ });
    // Campo alterado aparece; campo inalterado fica oculto até pedir.
    expect(within(diff).getByRole("rowheader", { name: "nome" })).toBeTruthy();
    expect(within(diff).getByText(/Bruno Lima/)).toBeTruthy();
    expect(within(diff).queryByRole("rowheader", { name: "email" })).toBeNull();
    // Valores sensíveis nunca são exibidos, mas o campo aparece como alterado.
    expect(within(diff).getByRole("rowheader", { name: "senha_hash" })).toBeTruthy();
    expect(within(diff).queryByText("abc")).toBeNull();
    expect(within(diff).queryByText("def")).toBeNull();
    expect(within(diff).getAllByText(/valor oculto/)).toHaveLength(2);
  });

  it("'Mostrar campos sem alteração' revela os demais", async () => {
    setup();
    const { user } = renderApp("/auditoria/77");
    await screen.findByRole("heading", { name: "Registro #77" });
    await user.click(screen.getByRole("checkbox", { name: "Mostrar campos sem alteração" }));
    expect(within(screen.getByRole("table", { name: /antes e depois/ })).getByRole("rowheader", { name: "email" })).toBeTruthy();
  });

  it("copia o request_id para a área de transferência", async () => {
    setup();
    vi.stubGlobal("isSecureContext", true); // contexto seguro (HTTPS/localhost)
    // O user-event instala um clipboard de teste em navigator ao criar o `user`.
    const { user } = renderApp("/auditoria/77");

    await user.click(await screen.findByRole("button", { name: "Copiar ID da requisição" }));

    expect(await navigator.clipboard.readText()).toBe("req-abc-123");
    expect(await screen.findByText("ID da requisição copiado.")).toBeTruthy();
  });

  it("sem Clipboard API (HTTP) cai no fallback e avisa se também falhar", async () => {
    setup();
    vi.stubGlobal("isSecureContext", false); // HTTP fora de localhost
    const { user } = renderApp("/auditoria/77");

    await user.click(await screen.findByRole("button", { name: "Copiar ID da requisição" }));

    // jsdom não implementa execCommand("copy"): o fallback falha e o usuário é orientado.
    expect(await screen.findByText(/Selecione o texto e copie manualmente/)).toBeTruthy();
  });

  it("registro inexistente mostra a mensagem do backend", async () => {
    const mock = setup();
    mock.on("GET /api/v1/auditoria/99", apiError(404, "nao_encontrado", "Registro de auditoria não encontrado."));
    renderApp("/auditoria/99");
    expect((await screen.findByRole("alert")).textContent).toContain("Registro de auditoria não encontrado.");
  });
});
