import { useCallback, useEffect, useState } from "react";
import { NAV_MODULES, moduleOfPath } from "./navigation";

const KEY = "pdv-nav-open";

function initialOpen(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) return new Set(saved.filter((id): id is string => typeof id === "string"));
  } catch {
    /* valor inválido ou sem armazenamento: usa o padrão */
  }
  return new Set(NAV_MODULES.filter((module) => module.defaultOpen).map((module) => module.id));
}

/**
 * Módulos abertos do menu. A escolha da pessoa é lembrada neste navegador, e o módulo da página
 * atual sempre aparece aberto (quem navega por um atalho vê onde está).
 */
export function useNavOpen(pathname: string) {
  const [open, setOpen] = useState<Set<string>>(initialOpen);
  const activeId = moduleOfPath(pathname)?.id;

  useEffect(() => {
    if (activeId) setOpen((current) => (current.has(activeId) ? current : new Set(current).add(activeId)));
  }, [activeId]);

  const toggle = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      return next;
    });
  }, []);

  return { open, toggle, activeId };
}
