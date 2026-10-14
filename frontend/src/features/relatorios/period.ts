import { useListParams } from "@/components/useListParams";

/** Mesmo limite do backend (relatórios por período aceitam menos de 366 dias). */
export const MAX_PERIOD_DAYS = 366;
const DAY_MS = 86_400_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function utcMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime();
}

/** Valor de ?de=/?ate= ("2026-10-14") -> ele mesmo se for uma data real do calendário; senão "". */
export function validDay(value: string | null | undefined): string {
  if (!value || !DAY.test(value)) return "";
  const time = utcMs(value);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? "" : value;
}

/** Mensagem de erro do período (de depois de ate, ou mais de 366 dias); undefined quando vale. */
export function periodError(de: string, ate: string): string | undefined {
  if (!de || !ate) return undefined;
  if (de > ate) return "A data final não pode ser anterior à inicial.";
  if ((utcMs(ate) - utcMs(de)) / DAY_MS >= MAX_PERIOD_DAYS) return `O período máximo é de ${MAX_PERIOD_DAYS} dias.`;
  return undefined;
}

/** Todos os dias de `de` a `ate` (inclusive), como "YYYY-MM-DD". Intervalo inválido -> lista vazia. */
export function eachDay(de: string, ate: string): string[] {
  const days: string[] = [];
  const end = utcMs(ate);
  const cursor = new Date(utcMs(de));
  while (!Number.isNaN(cursor.getTime()) && cursor.getTime() <= end && days.length <= MAX_PERIOD_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Período de ?de=&ate= na URL. `valid` é falso quando o par não fecha (de depois de ate, mais de
 * 366 dias): a tela mostra `error` no campo e não consulta o backend. Datas vazias valem: o
 * backend escolhe o padrão e devolve a janela efetiva.
 */
export function useReportPeriod() {
  const { params, update, reset } = useListParams();
  const de = validDay(params.get("de"));
  const ate = validDay(params.get("ate"));
  const error = periodError(de, ate);
  return { params, update, reset, de, ate, error, valid: error === undefined };
}
