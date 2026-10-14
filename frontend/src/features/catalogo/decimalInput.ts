import { compareDecimal, parseDecimalInput } from "@/lib/decimal";
import { formatDecimal } from "@/lib/money";

/**
 * Entrada de números digitados ("12,50", "1,5") -> string decimal da API. Nunca usa
 * parseFloat/Number: o texto vai direto para `parseDecimalInput` (lib/decimal).
 */

export type ParseResult = { value: string; error?: undefined } | { value?: undefined; error: string };

/** Plural simples para "casa(s) decimal(is)". */
function casas(scale: number): string {
  return scale === 1 ? "1 casa decimal" : `${scale} casas decimais`;
}

export interface QuantityOptions {
  /** Casas decimais da unidade (UN = 0, KG/L = 3). */
  scale: number;
  /** Sigla da unidade, só para a mensagem de erro. */
  unit?: string | undefined;
  allowNegative?: boolean;
  allowZero?: boolean;
}

/** Quantidade respeitando as casas da unidade; avisa antes de enviar (o backend também valida). */
export function parseQuantityInput(text: string, options: QuantityOptions): ParseResult {
  const raw = text.trim().replace(/^\+/, "").replace(/^[\u2212\u2013]/, "-");
  if (!raw) return { error: "Informe a quantidade." };
  const value = parseDecimalInput(raw, options.scale);
  if (value === null) {
    // Número válido, mas com casas demais para a unidade: mensagem específica.
    if (parseDecimalInput(raw, 12) !== null) {
      const who = options.unit ? `A unidade ${options.unit}` : "Esta unidade";
      return { error: options.scale === 0 ? `${who} não aceita casas decimais: use um número inteiro.` : `${who} aceita no máximo ${casas(options.scale)}.` };
    }
    return { error: "Quantidade inválida. Use apenas números, por exemplo 1,5." };
  }
  const sign = compareDecimal(value, "0");
  if (sign < 0 && !options.allowNegative) return { error: "A quantidade não pode ser negativa." };
  if (sign === 0 && !options.allowZero) return { error: "A quantidade deve ser maior que zero." };
  return { value };
}

export interface MoneyOptions {
  /** Casas decimais aceitas: 2 para preço/limite, 4 para custo. */
  scale?: number;
}

/** Valor monetário não negativo. Campo vazio é erro (para campo opcional use `parseOptionalMoney`). */
export function parseMoneyInput(text: string, options: MoneyOptions = {}): ParseResult {
  const scale = options.scale ?? 2;
  const raw = text.trim();
  if (!raw) return { error: "Informe o valor." };
  const value = parseDecimalInput(raw, scale);
  if (value === null) {
    if (parseDecimalInput(raw, 12) !== null) return { error: `Use no máximo ${casas(scale)}.` };
    return { error: "Valor inválido. Use apenas números, por exemplo 12,50." };
  }
  if (compareDecimal(value, "0") < 0) return { error: "O valor não pode ser negativo." };
  return { value };
}

export type OptionalParseResult = { value: string | null; error?: undefined } | { value?: undefined; error: string };

/** Como `parseMoneyInput`, mas campo vazio é válido e devolve `null`. */
export function parseOptionalMoney(text: string, options: MoneyOptions = {}): OptionalParseResult {
  if (!text.trim()) return { value: null };
  return parseMoneyInput(text, options);
}

/**
 * Valor da API ("12.50", "7.500") -> texto de campo ("12,50", "7,5").
 * `trim` remove zeros à direita (quantidades); sem ele mantém as casas que vieram (dinheiro).
 */
export function decimalToInput(value: string | null | undefined, options: { trim?: boolean } = {}): string {
  if (!value) return "";
  let text = value.trim();
  if (options.trim && text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text.replace(".", ",");
}

const COST = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Custo (médio, da ficha): a API guarda 4 casas e `formatMoney` arredondaria para 2, escondendo
 * centavos de fração. Aqui mostramos de 2 a 4 casas ("R$ 0,0333"). Só formatação, sem conta.
 */
export function formatCost(value: string | null | undefined): string {
  if (typeof value !== "string" || !/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return "—";
  return COST.format(value.trim() as `${number}`);
}

/** Quantidade com sinal explícito ("+2", "-1,5"), sem conta: o sinal já vem na string da API. */
export function formatSigned(value: string | null | undefined): string {
  const text = formatDecimal(value);
  if (text === "—" || !value) return text;
  return value.trim().startsWith("-") ? text : `+${text}`;
}
