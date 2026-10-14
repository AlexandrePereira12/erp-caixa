export interface ApiErrorDetail {
  campo: string;
  mensagem: string;
}

/**
 * Envelope de erro do backend: {"erro": {"codigo", "mensagem", "detalhes"?}}.
 * O OpenAPI só declara o 422 padrão do FastAPI ({detail}); por isso este tipo é escrito à mão
 * e o parser aceita os dois formatos.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  /** Erros de campo (lista de {campo, mensagem}); vazio quando `detalhes` não é uma lista. */
  readonly detalhes: ApiErrorDetail[];
  /**
   * `detalhes` exatamente como o backend mandou. Vários erros de negócio trazem um OBJETO com
   * dados estruturados (ex.: estoque_insuficiente → {produto_id, saldo, necessario},
   * pagamento_diferente_do_total → {total, informado}); a UI deve ler daqui, não da mensagem.
   */
  readonly extras: unknown;

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    detalhes: ApiErrorDetail[] = [],
    extras: unknown = undefined,
  ) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.extras = extras;
  }
}

export const MENSAGEM_REDE = "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
const MENSAGEM_SERVIDOR = "O servidor encontrou um erro. Tente novamente em instantes.";
const MENSAGEM_GENERICA = "Não foi possível concluir a operação.";
const MENSAGEM_SEM_PERMISSAO = "Você não tem permissão para realizar esta ação.";
const MENSAGEM_VALIDACAO = "Revise os dados informados.";

export function networkError(): ApiError {
  return new ApiError(0, "rede", MENSAGEM_REDE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseDetalhes(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) return [];
  const out: ApiErrorDetail[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const mensagem = asString(item.mensagem) ?? asString(item.msg);
    if (!mensagem) continue;
    let campo = asString(item.campo);
    if (!campo && Array.isArray(item.loc)) campo = item.loc.map(String).join(".");
    out.push({ campo: campo ?? "", mensagem });
  }
  return out;
}

function fallbackMessage(status: number): string {
  if (status >= 500) return MENSAGEM_SERVIDOR;
  if (status === 403) return MENSAGEM_SEM_PERMISSAO;
  if (status === 422) return MENSAGEM_VALIDACAO;
  return MENSAGEM_GENERICA;
}

export function parseErrorBody(status: number, body: unknown): ApiError {
  if (isRecord(body) && isRecord(body.erro)) {
    const erro = body.erro;
    const codigo = asString(erro.codigo) ?? (status === 403 ? "sem_permissao" : "erro_desconhecido");
    return new ApiError(
      status,
      codigo,
      asString(erro.mensagem) ?? fallbackMessage(status),
      parseDetalhes(erro.detalhes),
      erro.detalhes,
    );
  }
  // Formato padrão do FastAPI ({"detail": ...}), declarado no OpenAPI para o 422.
  if (isRecord(body) && "detail" in body) {
    const detail = body.detail;
    if (Array.isArray(detail)) {
      return new ApiError(status, status === 422 ? "validacao" : "erro_desconhecido", fallbackMessage(status), parseDetalhes(detail));
    }
    return new ApiError(status, "erro_desconhecido", asString(detail) ?? fallbackMessage(status));
  }
  return new ApiError(status, "erro_desconhecido", fallbackMessage(status));
}

/** Mensagem pronta para a UI, em PT-BR. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.codigo === "sem_permissao") return error.message || MENSAGEM_SEM_PERMISSAO;
    return error.message;
  }
  return MENSAGEM_GENERICA;
}

export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.codigo === "sem_permissao";
}

/** Códigos de 401 em chamada autenticada que justificam tentar renovar o access token. */
export function isTokenRejected(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && (error.codigo === "token_invalido" || error.codigo === "nao_autenticado");
}

/**
 * Converte `detalhes` em mapa campo -> mensagem. O backend informa "campo" possivelmente como caminho
 * ("body.email"); usa-se o último segmento.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(error instanceof ApiError)) return out;
  for (const d of error.detalhes) {
    const key = d.campo.split(".").pop() ?? "";
    if (key && !(key in out)) out[key] = d.mensagem;
  }
  return out;
}
