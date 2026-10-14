import type { ApiError } from "@/lib/api/errors";

/*
 * O backend manda `erro.detalhes` como OBJETO em vários erros de negócio ({formas}, {total, informado},
 * {produto_id, saldo, necessario}...), mas ApiError (lib/api/errors.ts) só guarda `detalhes` quando
 * é uma lista, e o descarta nesses casos. Enquanto isso não for corrigido na lib, as mesmas
 * informações são lidas da MENSAGEM, que o backend monta sempre com o mesmo texto em PT-BR.
 * Todos os leitores devolvem null quando a mensagem não tem o formato esperado: a UI então
 * mostra a mensagem como veio e usa o comportamento geral.
 */

const DECIMAL = "-?\\d+(?:\\.\\d+)?";

export interface PagamentoDiferente {
  informado: string;
  total: string;
}

/** "Os pagamentos somam 10.00 e o total da comanda é 12.50." */
export function parsePagamentoDiferente(message: string): PagamentoDiferente | null {
  const m = new RegExp(`^Os pagamentos somam (${DECIMAL}) e o total da comanda é (${DECIMAL})\\.$`).exec(message);
  return m ? { informado: m[1]!, total: m[2]! } : null;
}

export interface EstoqueInsuficiente {
  produto: string;
  saldo: string;
  necessario: string;
}

/** "Estoque insuficiente de Chopp: saldo 2.000, necessário 3.000." */
export function parseEstoqueInsuficiente(message: string): EstoqueInsuficiente | null {
  const m = new RegExp(`^Estoque insuficiente de (.+): saldo (${DECIMAL}), necessário (${DECIMAL})\\.$`).exec(message);
  return m ? { produto: m[1]!, saldo: m[2]!, necessario: m[3]! } : null;
}

interface Named {
  id: number;
  nome: string;
}

/**
 * "Informe o valor contado de: Pix, Cartão de débito." -> ids das formas citadas.
 * Casa os nomes conhecidos em vez de dividir por vírgula (nome de forma pode ter vírgula).
 */
export function parseConferenciaIncompleta(message: string, formas: Named[]): number[] | null {
  const m = /^Informe o valor contado de: (.+)\.$/.exec(message);
  if (!m) return null;
  let rest = m[1]!;
  const byLength = [...formas].sort((a, b) => b.nome.length - a.nome.length);
  const ids: number[] = [];
  while (rest.length > 0) {
    const found = byLength.find((f) => rest === f.nome || rest.startsWith(`${f.nome}, `));
    if (!found) return ids.length > 0 ? ids : null;
    ids.push(found.id);
    rest = rest.slice(found.nome.length).replace(/^, /, "");
  }
  return ids;
}

export interface DiferencaSemJustificativa {
  /** null quando o nome da mensagem não corresponde a nenhuma forma conhecida. */
  formaId: number | null;
  forma: string;
  diferenca: string;
}

/** "Dinheiro: há diferença de -5.00. Informe a justificativa." */
export function parseDiferencaSemJustificativa(message: string, formas: Named[]): DiferencaSemJustificativa | null {
  const m = new RegExp(`^(.+): há diferença de ([+-]?\\d+(?:\\.\\d+)?)\\. Informe a justificativa\\.$`).exec(message);
  if (!m) return null;
  const nome = m[1]!;
  return { formaId: formas.find((f) => f.nome === nome)?.id ?? null, forma: nome, diferenca: m[2]!.replace(/^\+/, "") };
}

/*
 * Leitores estruturados: preferem `ApiError.extras` (o `detalhes` cru do backend) e só caem no
 * texto da mensagem quando o backend não mandou o objeto esperado.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** extras: {total, informado} */
export function pagamentoDiferenteDe(error: ApiError): PagamentoDiferente | null {
  const x = error.extras;
  if (isRecord(x) && typeof x.total === "string" && typeof x.informado === "string") {
    return { total: x.total, informado: x.informado };
  }
  return parsePagamentoDiferente(error.message);
}

/** extras: {produto_id, saldo, necessario}; o nome do produto só vem na mensagem. */
export function estoqueInsuficienteDe(error: ApiError): EstoqueInsuficiente | null {
  const doTexto = parseEstoqueInsuficiente(error.message);
  const x = error.extras;
  if (isRecord(x) && typeof x.saldo === "string" && typeof x.necessario === "string") {
    return {
      produto: doTexto?.produto ?? (x.produto_id !== undefined ? `Produto #${String(x.produto_id)}` : "Produto"),
      saldo: x.saldo,
      necessario: x.necessario,
    };
  }
  return doTexto;
}

/** extras: {formas: [nome, ...]} -> ids das formas citadas. */
export function conferenciaIncompletaDe(error: ApiError, formas: Named[]): number[] | null {
  const x = error.extras;
  if (isRecord(x) && Array.isArray(x.formas)) {
    const ids = x.formas
      .map((nome) => formas.find((f) => f.nome === nome)?.id)
      .filter((id): id is number => id !== undefined);
    if (ids.length > 0) return ids;
  }
  return parseConferenciaIncompleta(error.message, formas);
}

/** extras: {forma_pagamento_id, diferenca} */
export function diferencaSemJustificativaDe(error: ApiError, formas: Named[]): DiferencaSemJustificativa | null {
  const x = error.extras;
  if (isRecord(x) && typeof x.diferenca === "string" && typeof x.forma_pagamento_id === "number") {
    const forma = formas.find((f) => f.id === x.forma_pagamento_id);
    return { formaId: x.forma_pagamento_id, forma: forma?.nome ?? "", diferenca: x.diferenca.replace(/^\+/, "") };
  }
  return parseDiferencaSemJustificativa(error.message, formas);
}
