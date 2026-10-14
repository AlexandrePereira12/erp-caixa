import { ApiError, networkError, parseErrorBody } from "./errors";

export const API_PREFIX = "/api/v1";

export interface RawRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Caminho sem o prefixo /api/v1, já com parâmetros de rota substituídos. */
  path: string;
  query?: Record<string, unknown> | undefined;
  body?: unknown;
  token?: string | null | undefined;
  signal?: AbortSignal | undefined;
}

function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Camada mais baixa: uma chamada fetch, sem autenticação automática nem retry.
 * O cookie de refresh (httpOnly) vai via credentials same-origin; o JS nunca o lê.
 */
export async function request<T>(req: RawRequest): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.token) headers.Authorization = `Bearer ${req.token}`;

  let response: Response;
  try {
    const init: RequestInit = { method: req.method, headers, credentials: "same-origin" };
    if (req.body !== undefined) init.body = JSON.stringify(req.body);
    if (req.signal) init.signal = req.signal;
    response = await fetch(`${API_PREFIX}${req.path}${buildQuery(req.query)}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError();
  }

  if (!response.ok) {
    throw parseErrorBody(response.status, await readBody(response));
  }
  if (response.status === 204) return undefined as T;
  const data = await readBody(response);
  if (data === undefined) {
    throw new ApiError(response.status, "resposta_invalida", "Resposta inesperada do servidor.");
  }
  return data as T;
}
