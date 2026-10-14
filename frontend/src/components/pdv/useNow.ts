import { useEffect, useState } from "react";

/** Relógio que atualiza a cada `everyMs` (para "aberta há 35 min" sem recarregar dados). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
