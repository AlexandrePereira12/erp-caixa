import { formatDecimal } from "@/lib/money";

/** "62.50" -> "62,50%". Os percentuais já vêm da API com 2 casas: aqui só se formata, nunca se calcula. Ausente -> "—". */
export function formatPercent(value: string | null | undefined): string {
  const text = formatDecimal(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return text === "—" ? text : `${text}%`;
}
