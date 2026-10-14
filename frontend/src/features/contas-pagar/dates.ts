const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Valor de ?de=/?ate= ou de um campo de data ("2026-10-14") -> ele mesmo se for uma data real do calendário; senão "". */
export function validDay(value: string | null | undefined): string {
  if (!value || !DAY.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "" : value;
}

/** Erro do período de vencimento (data inicial depois da final); undefined quando vale ou quando falta uma ponta. */
export function periodoError(de: string, ate: string): string | undefined {
  return de && ate && de > ate ? "A data final não pode ser anterior à inicial." : undefined;
}
