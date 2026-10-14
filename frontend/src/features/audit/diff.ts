export type JsonObject = Record<string, unknown>;

export interface DiffRow {
  campo: string;
  antes: unknown;
  depois: unknown;
  hasAntes: boolean;
  hasDepois: boolean;
  changed: boolean;
}

const SENSITIVE_KEY = /senha|password|passwd|hash|token|secret|segredo/i;

/** Valores de campos sensíveis nunca são exibidos, mesmo que o backend os envie. */
export function isSensitiveKey(campo: string): boolean {
  return SENSITIVE_KEY.test(campo);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compara os snapshots `antes` e `depois` de um registro de auditoria.
 * Um campo é "alterado" se o backend o listou em campos_alterados ou se o valor difere.
 * Criação (antes nulo) e exclusão (depois nulo) marcam todos os campos como alterados.
 */
export function diffRows(antes: JsonObject | null, depois: JsonObject | null, camposAlterados: string[] | null): DiffRow[] {
  const listed = new Set(camposAlterados ?? []);
  const keys: string[] = [];
  for (const source of [depois, antes]) {
    for (const key of Object.keys(source ?? {})) if (!keys.includes(key)) keys.push(key);
  }
  for (const key of listed) if (!keys.includes(key)) keys.push(key);

  return keys.map((campo) => {
    const hasAntes = antes !== null && campo in antes;
    const hasDepois = depois !== null && campo in depois;
    const a = hasAntes ? antes[campo] : undefined;
    const d = hasDepois ? depois[campo] : undefined;
    const changed = listed.has(campo) || hasAntes !== hasDepois || !valuesEqual(a, d);
    return { campo, antes: a, depois: d, hasAntes, hasDepois, changed };
  });
}

/** Texto legível de um valor de snapshot. Objetos/listas viram JSON indentado. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "(vazio)" : value;
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}
