import { useCallback, useState } from "react";
import { NAV_MODULES, moduleOfPath } from "./navigation";
import { readPreference, writePreference } from "@/lib/preferences";

const KEY = "pdv-nav-open";

function initialOpen(): Set<string> {
  try {
    const saved = JSON.parse(readPreference(KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === "string"));
  } catch {
    /* valor inválido: usa o padrão */
  }
  return new Set(NAV_MODULES.filter((module) => module.defaultOpen).map((module) => module.id));
}

/**
 * Módulos abertos do menu. A escolha da pessoa é lembrada neste navegador, e ao chegar a uma
 * página o módulo dela se abre (quem navega por um atalho vê onde está). Depois disso a pessoa
 * pode fechá-lo: só uma nova mudança de módulo o reabre.
 */
export function useNavOpen(pathname: string) {
  const activeId = moduleOfPath(pathname)?.id;
  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = initialOpen();
    if (activeId) initial.add(activeId);
    return initial;
  });
  const [seenActive, setSeenActive] = useState(activeId);

  // Ajuste de estado durante a renderização (padrão do React para estado derivado de uma prop).
  if (activeId !== seenActive) {
    setSeenActive(activeId);
    if (activeId && !open.has(activeId)) setOpen(new Set(open).add(activeId));
  }

  const toggle = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writePreference(KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { open, toggle, activeId };
}
