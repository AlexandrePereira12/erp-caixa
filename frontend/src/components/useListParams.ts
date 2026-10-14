import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/** Inteiro positivo vindo de um parâmetro de URL ("12" -> 12). Qualquer outra coisa -> undefined. */
export function parsePositiveInt(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = parseInt(value, 10);
  return parsed > 0 ? parsed : undefined;
}

/** Página (1-based) de `?pagina=`. */
export function parsePage(value: string | null | undefined): number {
  return parsePositiveInt(value) ?? 1;
}

/** "true"/"false" de um parâmetro de URL; qualquer outra coisa -> undefined (sem filtro). */
export function parseBoolParam(value: string | null | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * Filtros e paginação na URL (?q=...&pagina=2). `update` aplica um patch (valor vazio remove o
 * parâmetro) e volta para a página 1 a menos que o patch traga `pagina`. Os parâmetros são lidos
 * de um ref para que efeitos/timers atrasados (debounce da busca) nunca gravem uma URL velha por
 * cima de um filtro escolhido no meio do caminho.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  const setParamsRef = useRef(setParams);
  useEffect(() => {
    paramsRef.current = params;
    setParamsRef.current = setParams;
  });

  const update = useCallback((patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("pagina" in patch)) next.delete("pagina");
    paramsRef.current = next;
    setParamsRef.current(next, { replace: true });
  }, []);

  /** Limpa todos os filtros, preservando os parâmetros de `keep` (ex.: a aba ativa). */
  const reset = useCallback((keep: string[] = []) => {
    const next = new URLSearchParams();
    for (const key of keep) {
      const value = paramsRef.current.get(key);
      if (value) next.set(key, value);
    }
    paramsRef.current = next;
    setParamsRef.current(next, { replace: true });
  }, []);

  return { params, update, reset };
}

/**
 * Campo de busca com debounce: o texto é local e `commit` só é chamado depois de `delay` ms sem
 * digitar. Quem limpa os filtros deve chamar `setDraft("")` também.
 */
export function useSearchDraft(committed: string, commit: (value: string | undefined) => void, delay = 300) {
  const [draft, setDraft] = useState(committed);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    if (draft.trim() === committed) return;
    const timer = setTimeout(() => commitRef.current(draft.trim() || undefined), delay);
    return () => clearTimeout(timer);
  }, [draft, committed, delay]);

  return [draft, setDraft] as const;
}

/** Valor com atraso: só muda depois de `delay` ms sem novas alterações (busca ao digitar). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
