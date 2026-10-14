import { vi } from "vitest";

export interface MockCall {
  method: string;
  /** Caminho completo sem query, ex.: /api/v1/usuarios */
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

export type MockHandler = (call: MockCall) => Response | Promise<Response>;

export function json(status: number, body?: unknown): Response {
  if (status === 204 || body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function apiError(status: number, codigo: string, mensagem: string, detalhes?: { campo: string; mensagem: string }[]): Response {
  return json(status, { erro: { codigo, mensagem, ...(detalhes ? { detalhes } : {}) } });
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Substitui fetch global por um roteador "METHOD /caminho" -> handler. Desfeito por unstubGlobals. */
export function mockApi() {
  const handlers = new Map<string, MockHandler>();
  const calls: MockCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const call: MockCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      credentials: init?.credentials,
    };
    calls.push(call);
    const handler = handlers.get(`${call.method} ${call.path}`);
    if (!handler) {
      return apiError(500, "mock_sem_handler", `Sem handler para ${call.method} ${call.path}`);
    }
    return handler(call);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    fetchMock,
    on(route: string, handler: MockHandler | Response) {
      handlers.set(route, typeof handler === "function" ? handler : () => handler.clone());
    },
    callsTo(route: string): MockCall[] {
      return calls.filter((c) => `${c.method} ${c.path}` === route);
    },
  };
}

export const ME = {
  id: 1,
  nome: "Ana Souza",
  email: "ana@exemplo.com.br",
  papeis: ["Administrador"],
  permissoes: [
    "usuarios.listar",
    "usuarios.criar",
    "usuarios.editar",
    "usuarios.suspender",
    "usuarios.excluir",
    "usuarios.redefinir_senha",
    "papeis.listar",
    "papeis.criar",
    "papeis.editar",
    "papeis.excluir",
    "permissoes.listar",
    "auditoria.listar",
    "configuracoes.ver",
    "configuracoes.editar",
  ],
  must_change_password: false,
};

export const TOKEN = { access_token: "tok-novo", token_type: "bearer", expires_in: 900, must_change_password: false };
