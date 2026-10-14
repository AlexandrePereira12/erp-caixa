import { refreshSession } from "@/lib/auth/refresh";
import { session } from "@/lib/auth/session";
import { ApiError, isTokenRejected } from "./errors";
import { request, type RawRequest } from "./http";
import type { paths } from "./schema";

/* ---------- Tipos derivados do schema gerado ---------- */

type Method = "get" | "post" | "put" | "patch" | "delete";
type Prefix = "/api/v1";

type StripPrefix<P> = P extends `${Prefix}${infer R}` ? R : never;
type PathsFor<M extends Method> = {
  [P in keyof paths]: paths[P] extends { [K in M]: object } ? StripPrefix<P> : never;
}[keyof paths];

type OperationOf<R extends string, M extends Method> = `${Prefix}${R}` extends keyof paths
  ? paths[`${Prefix}${R}`] extends { [K in M]: infer O }
    ? O
    : never
  : never;

type IfNever<T, Then, Else> = [T] extends [never] ? Then : Else;
type QueryOf<O> = O extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;
type PathParamsOf<O> = O extends { parameters: { path: infer P } } ? P : never;
type BodyOf<O> = O extends { requestBody: { content: { "application/json": infer B } } } ? B : never;
type ResponseOf<O> = O extends { responses: { 200: { content: { "application/json": infer R } } } }
  ? R
  : O extends { responses: { 201: { content: { "application/json": infer R } } } }
    ? R
    : void;

type CallOptions<O> = IfNever<PathParamsOf<O>, unknown, { path: PathParamsOf<O> }> &
  IfNever<QueryOf<O>, unknown, { query?: QueryOf<O> }> &
  IfNever<BodyOf<O>, unknown, { body: BodyOf<O> }> & { signal?: AbortSignal };

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ArgsFor<O> = {} extends CallOptions<O> ? [options?: CallOptions<O>] : [options: CallOptions<O>];

/* ---------- Autenticação, refresh e erros globais ---------- */

/** Erros que valem para a sessão inteira, independentemente de quem fez a chamada. */
function handleGlobalError(error: unknown): unknown {
  if (error instanceof ApiError && error.status === 403) {
    if (error.codigo === "conta_suspensa") session.suspend();
    else if (error.codigo === "senha_expirada") session.setMustChangePassword(true);
  }
  return error;
}

/**
 * Obtém um token novo depois de um 401. Gate determinístico: se outra requisição já renovou
 * o token enquanto esta estava em voo (token atual diferente do usado), só repete com o atual;
 * caso contrário usa o refresh single-flight. Assim um 401 tardio não dispara um 2º refresh.
 */
async function freshTokenAfter401(tokenUsed: string | null): Promise<string> {
  const current = session.getAccessToken();
  if (current && current !== tokenUsed) return current;
  const token = await refreshSession();
  return token.access_token;
}

async function authedRequest<T>(req: RawRequest): Promise<T> {
  const tokenUsed = session.getAccessToken();
  try {
    return await request<T>({ ...req, token: tokenUsed });
  } catch (error) {
    if (!isTokenRejected(error)) throw handleGlobalError(error);

    let fresh: string;
    try {
      fresh = await freshTokenAfter401(tokenUsed);
    } catch (refreshError) {
      // refreshSession já limpou/suspendeu a sessão quando o motivo foi 4xx. Falha de rede é
      // repassada como tal; nos demais casos o erro original (401) descreve melhor a situação.
      if (refreshError instanceof ApiError && refreshError.codigo === "rede") throw refreshError;
      throw handleGlobalError(refreshError instanceof ApiError && refreshError.codigo === "conta_suspensa" ? refreshError : error);
    }

    try {
      return await request<T>({ ...req, token: fresh });
    } catch (retryError) {
      // Token recém-emitido rejeitado: não há o que renovar. Encerra a sessão em vez de entrar em loop.
      if (isTokenRejected(retryError)) session.expire();
      throw handleGlobalError(retryError);
    }
  }
}

/* ---------- Cliente tipado ---------- */

interface LooseOptions {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

function fillPath(template: string, params: LooseOptions["path"]): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Parâmetro de rota ausente: ${name}`);
    return encodeURIComponent(String(value));
  });
}

function call<T>(method: RawRequest["method"], template: string, options: LooseOptions | undefined): Promise<T> {
  return authedRequest<T>({
    method,
    path: fillPath(template, options?.path),
    query: options?.query,
    body: options?.body,
    signal: options?.signal,
  });
}

export const api = {
  get: <R extends PathsFor<"get">>(path: R, ...args: ArgsFor<OperationOf<R, "get">>) =>
    call<ResponseOf<OperationOf<R, "get">>>("GET", path, args[0] as LooseOptions | undefined),
  post: <R extends PathsFor<"post">>(path: R, ...args: ArgsFor<OperationOf<R, "post">>) =>
    call<ResponseOf<OperationOf<R, "post">>>("POST", path, args[0] as LooseOptions | undefined),
  put: <R extends PathsFor<"put">>(path: R, ...args: ArgsFor<OperationOf<R, "put">>) =>
    call<ResponseOf<OperationOf<R, "put">>>("PUT", path, args[0] as LooseOptions | undefined),
  patch: <R extends PathsFor<"patch">>(path: R, ...args: ArgsFor<OperationOf<R, "patch">>) =>
    call<ResponseOf<OperationOf<R, "patch">>>("PATCH", path, args[0] as LooseOptions | undefined),
  delete: <R extends PathsFor<"delete">>(path: R, ...args: ArgsFor<OperationOf<R, "delete">>) =>
    call<ResponseOf<OperationOf<R, "delete">>>("DELETE", path, args[0] as LooseOptions | undefined),
};
