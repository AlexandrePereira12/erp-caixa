import { localInputToIso } from "@/lib/format";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-13" (campo date) -> início desse dia no horário local, em ISO UTC. */
export function dayStartIso(day: string | null | undefined): string | undefined {
  return day && DAY.test(day) ? localInputToIso(`${day}T00:00`) : undefined;
}

/** Limite superior EXCLUSIVO de um filtro "até": início do dia seguinte (o backend usa `< ate`). */
export function nextDayStartIso(day: string | null | undefined): string | undefined {
  if (!day || !DAY.test(day)) return undefined;
  const date = new Date(`${day}T00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** Há quanto tempo, de forma curta: "agora", "35 min", "1 h 20 min", "2 d". */
export function elapsedLabel(iso: string, now: number): string {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "—";
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** "2026-10-20" (data sem hora) -> "20/10/2026", sem deslocar o dia pelo fuso. */
export function formatDay(day: string | null | undefined, fallback = "—"): string {
  if (!day || !DAY.test(day)) return fallback;
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
