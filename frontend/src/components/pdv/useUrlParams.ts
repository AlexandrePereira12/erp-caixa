import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toInt } from "./forms";

export const PAGE_SIZE = 20;

/**
 * Filtros e paginação na URL. Os efeitos e timers (debounce) chamam `update` depois de novas
 * renderizações; ler os parâmetros do ref evita gravar uma URL antiga por cima de um filtro
 * escolhido no meio do caminho. Qualquer filtro novo volta para a página 1.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const ref = useRef(params);
  useEffect(() => {
    ref.current = params;
  });

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(ref.current);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!("pagina" in patch)) next.delete("pagina");
      setParams(next, { replace: true });
    },
    [setParams],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const page = Math.max(1, toInt(params.get("pagina")) ?? 1);
  return { params, update, clear, page, offset: (page - 1) * PAGE_SIZE };
}

/** Campo de busca local com debounce: a URL só muda depois de 300 ms sem digitar. */
export function useSearchDraft(committed: string, onCommit: (value: string | undefined) => void) {
  const [draft, setDraft] = useState(committed);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  useEffect(() => {
    if (draft.trim() === committed) return;
    const timer = setTimeout(() => commitRef.current(draft.trim() || undefined), 300);
    return () => clearTimeout(timer);
  }, [draft, committed]);
  return [draft, setDraft] as const;
}
