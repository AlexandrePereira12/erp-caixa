import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { ApiError, parseErrorBody } from "@/lib/api/errors";
import { bootstrapSession, login } from "@/lib/auth/auth";
import { session } from "@/lib/auth/session";
import { apiError, deferred, json, mockApi, ME, TOKEN } from "@/test/mockFetch";

const PAGE = { itens: [], total: 0, limite: 50, deslocamento: 0 };
const bearer = (call: { headers: Headers }) => call.headers.get("authorization");

beforeEach(() => {
  session.reset("authenticated");
});

describe("api client: autenticação", () => {
  it("injeta o Bearer do token em memória e usa credentials same-origin", async () => {
    const mock = mockApi();
    mock.on("GET /api/v1/usuarios", json(200, PAGE));
    session.setAccessToken("tok-1");

    await api.get("/usuarios", { query: { q: "ana", suspenso: false, papel_id: undefined } });

    const [call] = mock.calls;
    expect(bearer(call!)).toBe("Bearer tok-1");
    expect(call!.credentials).toBe("same-origin");
    // query: ignora undefined, serializa boolean
    expect(call!.query.get("q")).toBe("ana");
    expect(call!.query.get("suspenso")).toBe("false");
    expect(call!.query.has("papel_id")).toBe(false);
  });

  it("substitui parâmetros de rota e envia o corpo JSON", async () => {
    const mock = mockApi();
    mock.on("PATCH /api/v1/usuarios/7", json(200, { id: 7 }));
    session.setAccessToken("tok-1");

    await api.patch("/usuarios/{usuario_id}", { path: { usuario_id: 7 }, body: { nome: "Novo" } });

    expect(mock.calls[0]!.body).toEqual({ nome: "Novo" });
    expect(mock.calls[0]!.headers.get("content-type")).toBe("application/json");
  });

  it("204 resolve sem corpo", async () => {
    const mock = mockApi();
    mock.on("DELETE /api/v1/usuarios/3", json(204));
    session.setAccessToken("tok-1");
    await expect(api.delete("/usuarios/{usuario_id}", { path: { usuario_id: 3 } })).resolves.toBeUndefined();
  });
});

describe("api client: refresh single-flight", () => {
  it("3 requisições simultâneas com 401 geram 1 só POST /auth/refresh e todas são repetidas", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    const refresh = deferred<Response>();
    mock.on("POST /api/v1/auth/refresh", () => refresh.promise);
    for (const id of [1, 2, 3]) {
      mock.on(`GET /api/v1/usuarios/${id}`, (call) =>
        bearer(call) === "Bearer old" ? apiError(401, "token_invalido", "Token inválido") : json(200, { id }),
      );
    }

    const results = Promise.all([1, 2, 3].map((id) => api.get("/usuarios/{usuario_id}", { path: { usuario_id: id } })));

    // As 3 chegaram ao servidor com o token velho e o refresh está pendente (ainda não resolvido).
    await vi.waitFor(() => expect(mock.calls.filter((c) => bearer(c) === "Bearer old")).toHaveLength(3));
    await vi.waitFor(() => expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);

    refresh.resolve(json(200, TOKEN));
    const resolved = await results;

    expect(resolved).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);
    const retried = mock.calls.filter((c) => bearer(c) === "Bearer tok-novo");
    expect(retried.map((c) => c.path).sort()).toEqual(["/api/v1/usuarios/1", "/api/v1/usuarios/2", "/api/v1/usuarios/3"]);
    expect(session.getAccessToken()).toBe("tok-novo");
  });

  it("401 tardio de um token já renovado só repete a requisição, sem novo refresh", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    const lateResponse = deferred<Response>();
    mock.on("POST /api/v1/auth/refresh", json(200, TOKEN));
    mock.on("GET /api/v1/usuarios/1", (call) =>
      bearer(call) === "Bearer old" ? apiError(401, "token_invalido", "Token inválido") : json(200, { id: 1 }),
    );
    mock.on("GET /api/v1/usuarios/2", (call) => (bearer(call) === "Bearer old" ? lateResponse.promise : json(200, { id: 2 })));

    const second = api.get("/usuarios/{usuario_id}", { path: { usuario_id: 2 } });
    await vi.waitFor(() => expect(mock.callsTo("GET /api/v1/usuarios/2")).toHaveLength(1));
    // A primeira requisição renova o token por completo enquanto a segunda ainda não tem resposta.
    await expect(api.get("/usuarios/{usuario_id}", { path: { usuario_id: 1 } })).resolves.toEqual({ id: 1 });
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);

    lateResponse.resolve(apiError(401, "token_invalido", "Token inválido"));
    await expect(second).resolves.toEqual({ id: 2 });

    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);
    expect(mock.callsTo("GET /api/v1/usuarios/2").map(bearer)).toEqual(["Bearer old", "Bearer tok-novo"]);
  });

  it("falha de refresh limpa a sessão e rejeita sem repetir a requisição", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    session.setAuthenticated(ME, false);
    mock.on("GET /api/v1/usuarios", apiError(401, "token_invalido", "Token inválido"));
    mock.on("POST /api/v1/auth/refresh", apiError(401, "token_invalido", "Sessão expirada"));

    await expect(api.get("/usuarios")).rejects.toMatchObject({ status: 401, codigo: "token_invalido" });

    expect(mock.callsTo("GET /api/v1/usuarios")).toHaveLength(1);
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);
    expect(session.getAccessToken()).toBeNull();
    expect(session.getSnapshot()).toMatchObject({ status: "anonymous", me: null });
  });

  it("repetição que volta 401 encerra a sessão e não dispara um segundo refresh", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    mock.on("GET /api/v1/usuarios", apiError(401, "nao_autenticado", "Não autenticado"));
    mock.on("POST /api/v1/auth/refresh", json(200, TOKEN));

    await expect(api.get("/usuarios")).rejects.toBeInstanceOf(ApiError);

    expect(mock.callsTo("GET /api/v1/usuarios")).toHaveLength(2);
    expect(mock.callsTo("POST /api/v1/auth/refresh")).toHaveLength(1);
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("falha de rede no refresh não derruba a sessão", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    session.setAuthenticated(ME, false);
    mock.on("GET /api/v1/usuarios", apiError(401, "token_invalido", "Token inválido"));
    mock.on("POST /api/v1/auth/refresh", () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(api.get("/usuarios")).rejects.toMatchObject({ codigo: "rede" });
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("conta suspensa no refresh leva a sessão para suspensa", async () => {
    const mock = mockApi();
    session.setAccessToken("old");
    mock.on("GET /api/v1/usuarios", apiError(401, "token_invalido", "Token inválido"));
    mock.on("POST /api/v1/auth/refresh", apiError(403, "conta_suspensa", "Conta suspensa"));

    await expect(api.get("/usuarios")).rejects.toMatchObject({ codigo: "conta_suspensa" });
    expect(session.getSnapshot().status).toBe("suspended");
    expect(session.getAccessToken()).toBeNull();
  });
});

describe("api client: erros globais", () => {
  it("conta_suspensa em qualquer chamada leva a sessão para suspensa", async () => {
    const mock = mockApi();
    session.setAccessToken("tok");
    mock.on("GET /api/v1/usuarios", apiError(403, "conta_suspensa", "Conta suspensa."));
    await expect(api.get("/usuarios")).rejects.toMatchObject({ codigo: "conta_suspensa" });
    expect(session.getSnapshot().status).toBe("suspended");
  });

  it("senha_expirada marca a troca de senha como obrigatória sem derrubar a sessão", async () => {
    const mock = mockApi();
    session.setAccessToken("tok");
    mock.on("GET /api/v1/usuarios", apiError(403, "senha_expirada", "Troque a senha."));
    await expect(api.get("/usuarios")).rejects.toMatchObject({ codigo: "senha_expirada" });
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", mustChangePassword: true });
  });

  it("sem_permissao mantém a sessão e expõe a mensagem do backend", async () => {
    const mock = mockApi();
    session.setAccessToken("tok");
    mock.on("GET /api/v1/usuarios", apiError(403, "sem_permissao", "Sem permissão para listar usuários."));
    await expect(api.get("/usuarios")).rejects.toMatchObject({ status: 403, message: "Sem permissão para listar usuários." });
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("erro de rede vira ApiError 'rede'", async () => {
    const mock = mockApi();
    session.setAccessToken("tok");
    mock.on("GET /api/v1/usuarios", () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(api.get("/usuarios")).rejects.toMatchObject({ codigo: "rede", status: 0 });
  });
});

describe("parseErrorBody", () => {
  it("lê o envelope {erro} com detalhes", () => {
    const error = parseErrorBody(422, { erro: { codigo: "validacao", mensagem: "Dados inválidos.", detalhes: [{ campo: "email", mensagem: "E-mail inválido." }] } });
    expect(error).toMatchObject({ status: 422, codigo: "validacao", message: "Dados inválidos.", detalhes: [{ campo: "email", mensagem: "E-mail inválido." }] });
  });

  it("aceita o formato padrão do FastAPI ({detail}) declarado no OpenAPI", () => {
    const error = parseErrorBody(422, { detail: [{ loc: ["body", "email"], msg: "value is not a valid email", type: "value_error" }] });
    expect(error.codigo).toBe("validacao");
    expect(error.detalhes).toEqual([{ campo: "body.email", mensagem: "value is not a valid email" }]);
  });

  it("corpo ausente ou desconhecido gera mensagem genérica em PT-BR", () => {
    expect(parseErrorBody(500, undefined).message).toMatch(/servidor/);
    expect(parseErrorBody(403, {}).message).toMatch(/permissão/);
  });
});

const PREFERENCES_FILE = "/src/lib/preferences.ts";

describe("sessão: token nunca vai para o armazenamento do navegador", () => {
  it("login, refresh e chamadas autenticadas não gravam em localStorage/sessionStorage/cookie", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const mock = mockApi();
    mock.on("POST /api/v1/auth/login", json(200, { ...TOKEN, access_token: "segredo-login" }));
    mock.on("GET /api/v1/auth/me", json(200, ME));
    mock.on("GET /api/v1/usuarios", (call) => (bearer(call) === "Bearer segredo-login" ? apiError(401, "token_invalido", "x") : json(200, PAGE)));
    mock.on("POST /api/v1/auth/refresh", json(200, { ...TOKEN, access_token: "segredo-refresh" }));

    session.reset("anonymous");
    await login("ana@exemplo.com.br", "senha-longa-123");
    await api.get("/usuarios"); // 401 -> refresh -> repete

    expect(session.getAccessToken()).toBe("segredo-refresh");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.cookie).not.toContain("segredo");
  });

  it("bootstrap restaura a sessão só em memória", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", json(200, { ...TOKEN, access_token: "segredo-boot" }));
    mock.on("GET /api/v1/auth/me", json(200, ME));

    session.reset("loading");
    await bootstrapSession();

    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", me: { nome: "Ana Souza" } });
    expect(session.getAccessToken()).toBe("segredo-boot");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("o código-fonte não usa localStorage/sessionStorage (guarda estática)", () => {
    const sources = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file) && !file.includes("/src/test/") && file !== PREFERENCES_FILE)
      .filter(([, content]) => /\b(localStorage|sessionStorage)\b/.test(content))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it("o único arquivo com acesso ao armazenamento (preferências de tela) não lida com token nem senha", () => {
    const sources = import.meta.glob("/src/lib/preferences.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const content = sources[PREFERENCES_FILE] ?? "";
    expect(content).toContain("localStorage");
    // o comentário do arquivo cita "token" e "senha" para explicar a regra; o código em si não os usa
    const code = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/token|senha|password|authorization/i);
  });
});

describe("bootstrap da sessão", () => {
  it("sem cookie de refresh (401) a sessão fica anônima", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", apiError(401, "token_invalido", "Sem sessão"));
    session.reset("loading");
    await bootstrapSession();
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("conta suspensa no refresh vai para suspensa, não para anônima", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", apiError(403, "conta_suspensa", "Conta suspensa"));
    session.reset("loading");
    await bootstrapSession();
    expect(session.getSnapshot().status).toBe("suspended");
  });

  it("erro de rede no bootstrap vira estado 'error' (tentar de novo), não anônimo", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", () => {
      throw new TypeError("Failed to fetch");
    });
    session.reset("loading");
    await bootstrapSession();
    expect(session.getSnapshot()).toMatchObject({ status: "error", error: { codigo: "rede" } });
  });

  it("troca de senha obrigatória: usa o flag do TokenOut e não consulta /auth/me", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", json(200, { ...TOKEN, must_change_password: true }));
    session.reset("loading");
    await bootstrapSession();
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", me: null, mustChangePassword: true });
    expect(mock.callsTo("GET /api/v1/auth/me")).toHaveLength(0);
  });

  it("senha_expirada vinda de /auth/me leva à troca de senha em vez de falhar a sessão", async () => {
    const mock = mockApi();
    mock.on("POST /api/v1/auth/refresh", json(200, TOKEN));
    mock.on("GET /api/v1/auth/me", apiError(403, "senha_expirada", "Troque a senha"));
    session.reset("loading");
    await bootstrapSession();
    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", me: null, mustChangePassword: true });
  });
});
