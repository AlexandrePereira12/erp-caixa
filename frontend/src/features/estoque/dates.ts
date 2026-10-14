import { localInputToIso } from "@/lib/format";

/** "2026-10-13" (valor de <input type="date">) -> partes numéricas, ou null se malformado. */
function parseDay(day: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return { y: parseInt(match[1]!, 10), m: parseInt(match[2]!, 10), d: parseInt(match[3]!, 10) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Início do dia no horário local, em ISO UTC (filtro `de`, inclusivo). Ex.: "2026-10-13" -> meia-noite local. */
export function dayStartIso(day: string): string | undefined {
  if (!parseDay(day)) return undefined;
  return localInputToIso(`${day}T00:00`);
}

/**
 * Fim do dia para o filtro `ate`, que o backend trata como EXCLUSIVO (ocorrido_em < ate):
 * "até 13/10" precisa ser a meia-noite local do dia 14.
 * (new Date("2026-10-13") seria meia-noite UTC; por isso a data é montada em partes, no horário local.)
 */
export function dayEndExclusiveIso(day: string): string | undefined {
  const parts = parseDay(day);
  if (!parts) return undefined;
  const next = new Date(parts.y, parts.m - 1, parts.d + 1);
  return localInputToIso(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T00:00`);
}

/** Valida o valor da URL antes de usar como filtro. */
export function validDay(value: string | null): string {
  return value && parseDay(value) ? value : "";
}
