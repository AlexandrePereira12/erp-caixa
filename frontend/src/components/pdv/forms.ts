import { z } from "zod";
import { compareDecimal, parseDecimalInput } from "@/lib/decimal";

/**
 * Único ponto onde texto vira number: identificadores, páginas, contagens e parcelas (inteiros
 * pequenos). Dinheiro, quantidades e percentuais NUNCA passam por aqui: seguem como string decimal
 * (parseDecimalInput) do campo até a API.
 */
export function toInt(text: string | null | undefined): number | undefined {
  const raw = (text ?? "").trim();
  return /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
}

/** Inteiro positivo de um parâmetro de URL; ausente ou inválido -> undefined. */
export function positiveIntParam(text: string | null | undefined): number | undefined {
  const n = toInt(text);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Valor monetário digitado ("12,5") -> string decimal com 2 casas ("12.50") ou null se inválido. */
export function parseMoney(text: string): string | null {
  const parsed = parseDecimalInput(text, 2);
  if (parsed === null) return null;
  const [int = "0", frac = ""] = parsed.split(".");
  return `${int}.${frac.padEnd(2, "0")}`;
}

export const MSG_MONEY = "Informe um valor válido, como 12,50.";

/** Campo de texto com valor em reais (maior que zero, no máximo 2 casas). */
export const zMoneyPositive = z
  .string()
  .trim()
  .refine((v) => parseMoney(v) !== null, MSG_MONEY)
  .refine((v) => {
    const parsed = parseMoney(v);
    return parsed === null || compareDecimal(parsed, "0") > 0;
  }, "O valor deve ser maior que zero.");

/** Campo de texto com valor em reais (zero ou mais). */
export const zMoneyNonNegative = z
  .string()
  .trim()
  .refine((v) => parseMoney(v) !== null, MSG_MONEY)
  .refine((v) => {
    const parsed = parseMoney(v);
    return parsed === null || compareDecimal(parsed, "0") >= 0;
  }, "O valor não pode ser negativo.");

/** Texto obrigatório com mínimo de 3 caracteres (motivos e justificativas do backend). */
export const zReason = (max = 300, what = "o motivo") =>
  z
    .string()
    .trim()
    .min(3, `Informe ${what} (mínimo de 3 caracteres).`)
    .max(max, `Use no máximo ${max} caracteres.`);

export function moneyInputProps() {
  return { inputMode: "decimal" as const, autoComplete: "off", placeholder: "0,00" };
}

/** "1.500" -> "1,5" e "2.000" -> "2": texto para preencher campos de quantidade (só exibição/edição). */
export function trimDecimalText(value: string): string {
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return trimmed.replace(".", ",");
}
