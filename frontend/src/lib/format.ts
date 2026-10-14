/** Formatação de datas para pt-BR. Datas da API são ISO 8601 com offset. */

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso: string | null | undefined, fallback = "—"): string {
  const date = parse(iso);
  return date ? dateTime.format(date) : fallback;
}

export function formatDate(iso: string | null | undefined, fallback = "—"): string {
  const date = parse(iso);
  return date ? dateOnly.format(date) : fallback;
}

/** Valor de <input type="datetime-local"> ("2026-10-13T08:30", horário local) -> ISO UTC; vazio -> undefined. */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO -> valor de <input type="datetime-local"> no horário local. */
export function isoToLocalInput(iso: string | undefined): string {
  const date = parse(iso);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Iniciais para avatar (até 2 letras). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
