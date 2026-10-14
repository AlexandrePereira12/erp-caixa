/**
 * Dinheiro e quantidades chegam da API como STRING decimal ("1234.50").
 * Este módulo só formata para exibição: nunca converte para number nem faz aritmética
 * (somas, totais e arredondamento de negócio são do backend).
 * Intl.NumberFormat.format aceita string numérica e a trata como decimal exato.
 */
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;
const PLACEHOLDER = "—";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function isDecimal(value: string | null | undefined): value is `${number}` {
  return typeof value === "string" && DECIMAL.test(value.trim());
}

/** "1234.5" -> "R$ 1.234,50". Valor ausente ou malformado vira "—" (nunca "R$ NaN"). */
export function formatMoney(value: string | null | undefined): string {
  if (!isDecimal(value)) return PLACEHOLDER;
  return brl.format(value.trim() as `${number}`);
}

export interface DecimalFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/** Quantidades: "1.500" -> "1,5" (ajuste as casas conforme o campo). */
export function formatDecimal(value: string | null | undefined, options: DecimalFormatOptions = {}): string {
  if (!isDecimal(value)) return PLACEHOLDER;
  const formatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3, ...options });
  return formatter.format(value.trim() as `${number}`);
}
