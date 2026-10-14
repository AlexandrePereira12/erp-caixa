import { describe, expect, it } from "vitest";

/*
 * Dinheiro trafega como string decimal do campo até a API (components/pdv/forms, lib/decimal). Esta
 * varredura é só de contas a pagar e roda mesmo que a global (comandas/semFloat.test.ts) mude de escopo.
 * Número só entra como identificador, via toInt/positiveIntParam de components/pdv/forms.
 */
const files = import.meta.glob(["/src/features/contas-pagar/**/*.{ts,tsx}", "/src/app/routes.contaspagar.tsx", "!/src/**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const entries = Object.entries(files);

describe("contas a pagar não usa ponto flutuante para dinheiro", () => {
  it("varre o código da feature e as rotas", () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(files)).toContain("/src/features/contas-pagar/api.ts");
    expect(Object.keys(files)).toContain("/src/app/routes.contaspagar.tsx");
    expect(Object.keys(files).some((f) => f.endsWith(".test.tsx"))).toBe(false);
  });

  it.each(["parseFloat", "toFixed", "z.coerce.number", "parseInt", "Math.round", "Math.ceil"])("sem %s", (proibido) => {
    expect(entries.filter(([, fonte]) => fonte.includes(proibido)).map(([caminho]) => caminho)).toEqual([]);
  });

  it("sem Number( (inteiros passam por toInt/positiveIntParam)", () => {
    expect(entries.filter(([, fonte]) => /\bNumber\(/.test(fonte)).map(([caminho]) => caminho)).toEqual([]);
  });
});
