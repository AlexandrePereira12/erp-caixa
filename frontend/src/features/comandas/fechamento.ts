import { toInt, parseMoney } from "@/components/pdv/forms";
import type { FecharComandaIn, FormaPagamento, PagamentoIn } from "@/components/pdv/types";
import { compareDecimal, subDecimal, sumDecimals } from "@/lib/decimal";

/*
 * Prévia do fechamento da conta. É só ARITMÉTICA DE EXIBIÇÃO (quanto falta cobrir, troco previsto):
 * o backend valida tudo de novo e é quem decide o total, o troco e o resultado. Strings decimais
 * exatas (lib/decimal), nunca number.
 */

export interface Linha {
  key: number;
  /** id da forma como texto do <select>; vazio = não escolhida. */
  formaId: string;
  valor: string;
  recebido: string;
  parcelas: string;
  observacao: string;
}

export type LinhaCampo = "forma" | "valor" | "recebido" | "parcelas";

export interface LinhaCheck {
  forma: FormaPagamento | undefined;
  /** Valor da linha já normalizado ("12.50"), ou null se inválido/vazio. */
  valor: string | null;
  recebido: string | null;
  parcelas: number | null;
  /** Troco previsto da linha (só dinheiro com valor recebido válido). */
  troco: string | null;
  erros: Partial<Record<LinhaCampo, string>>;
}

export function novaLinha(key: number, init: Partial<Linha> = {}): Linha {
  return { key, formaId: "", valor: "", recebido: "", parcelas: "", observacao: "", ...init };
}

/** "12.50" -> "12,50": só para preencher o campo de texto; a API recebe sempre o ponto. */
export const toInputText = (decimal: string): string => decimal.replace(".", ",");

export function checkLinhas(linhas: Linha[], formas: FormaPagamento[]): LinhaCheck[] {
  let fiadoVisto = false;
  return linhas.map((linha) => {
    const erros: LinhaCheck["erros"] = {};
    const forma = formas.find((f) => String(f.id) === linha.formaId);
    if (!forma) erros.forma = "Escolha a forma de pagamento.";

    const valor = parseMoney(linha.valor);
    if (linha.valor.trim() === "") erros.valor = "Informe o valor.";
    else if (valor === null) erros.valor = "Valor inválido (ex.: 12,50).";
    else if (compareDecimal(valor, "0") <= 0) erros.valor = "O valor deve ser maior que zero.";

    let recebido: string | null = null;
    let troco: string | null = null;
    if (forma?.tipo === "dinheiro" && linha.recebido.trim() !== "") {
      recebido = parseMoney(linha.recebido);
      if (recebido === null) erros.recebido = "Valor recebido inválido (ex.: 50,00).";
      else if (compareDecimal(recebido, "0") <= 0) erros.recebido = "O valor recebido deve ser maior que zero.";
      else if (valor !== null && compareDecimal(recebido, valor) < 0) erros.recebido = "O valor recebido é menor que o valor pago.";
      else if (valor !== null) troco = subDecimal(recebido, valor);
    }

    let parcelas: number | null = null;
    if (forma?.tipo === "credito" && linha.parcelas.trim() !== "") {
      const n = toInt(linha.parcelas);
      if (n === undefined || n < 1 || n > 24) erros.parcelas = "Parcelas de 1 a 24.";
      else parcelas = n;
    }

    if (forma?.tipo === "fiado") {
      if (fiadoVisto) erros.forma = "Use uma única linha de pagamento em fiado.";
      fiadoVisto = true;
    }
    return { forma, valor: erros.valor ? null : valor, recebido: erros.recebido ? null : recebido, parcelas, troco: erros.recebido ? null : troco, erros };
  });
}

export interface Previa {
  /** Soma dos valores das linhas válidas. */
  soma: string;
  /** > 0 quando ainda falta cobrir; "0" quando bate ou excede. */
  falta: string;
  /** > 0 quando os pagamentos passam do total. */
  excesso: string;
  /** Troco previsto total (só dinheiro com valor recebido). */
  troco: string;
  bate: boolean;
}

export function calcularPrevia(total: string, checks: LinhaCheck[]): Previa {
  const soma = sumDecimals(checks.flatMap((c) => (c.valor ? [c.valor] : [])));
  const cmp = compareDecimal(total, soma);
  return {
    soma,
    falta: cmp > 0 ? subDecimal(total, soma) : "0",
    excesso: cmp < 0 ? subDecimal(soma, total) : "0",
    troco: sumDecimals(checks.flatMap((c) => (c.troco ? [c.troco] : []))),
    bate: cmp === 0,
  };
}

/** Pode confirmar: todas as linhas válidas e a soma bate com o total (ou total zero sem linhas). */
export function podeConfirmar(total: string, linhas: Linha[], checks: LinhaCheck[], previa: Previa): boolean {
  const totalZero = compareDecimal(total, "0") === 0;
  if (totalZero) return linhas.length === 0;
  return linhas.length > 0 && checks.every((c) => Object.keys(c.erros).length === 0) && previa.bate;
}

export interface CorpoOpcoes {
  clienteId?: number | undefined;
  permitirEstoqueNegativo?: boolean;
  justificativaEstoque?: string;
}

/** Corpo do POST /comandas/{id}/fechar: dinheiro e quantidades como string decimal. */
export function montarCorpo(linhas: Linha[], checks: LinhaCheck[], opcoes: CorpoOpcoes = {}): FecharComandaIn {
  const pagamentos: PagamentoIn[] = linhas.map((linha, i) => {
    const check = checks[i]!;
    return {
      forma_pagamento_id: check.forma!.id,
      valor: check.valor!,
      ...(check.recebido ? { valor_recebido: check.recebido } : {}),
      ...(check.parcelas !== null ? { parcelas: check.parcelas } : {}),
      ...(linha.observacao.trim() ? { observacao: linha.observacao.trim() } : {}),
    };
  });
  return {
    pagamentos,
    ...(opcoes.clienteId !== undefined ? { cliente_id: opcoes.clienteId } : {}),
    ...(opcoes.permitirEstoqueNegativo ? { permitir_estoque_negativo: true, justificativa_estoque: opcoes.justificativaEstoque ?? "" } : {}),
  };
}
