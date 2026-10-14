import { describe, expect, it } from "vitest";

/*
 * Dinheiro, quantidade e percentual trafegam como string decimal do campo até a API
 * (lib/decimal + parseDecimalInput). Number só existe em components/pdv/forms.ts (toInt), para
 * inteiros pequenos: ids, página, parcelas, pessoas, ordem, janela de cancelamento.
 */
const NUMBER_HELPER = "/src/components/pdv/forms.ts";

const files = import.meta.glob(
  [
    "/src/features/{mesas,comandas,caixa,vendas,financeiro,contas-pagar,relatorios,formas-pagamento,settings,roles}/**/*.{ts,tsx}",
    "/src/components/pdv/**/*.{ts,tsx}",
    "/src/app/routes.pdv.tsx",
    "/src/app/navigation.ts",
    "/src/routes/Home.tsx",
    "!/src/**/*.test.{ts,tsx}",
    "!/src/features/comandas/fixtures.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const entries = Object.entries(files);

describe("nenhuma tela usa ponto flutuante para dinheiro", () => {
  it("varre os arquivos da Fase 2", () => {
    expect(entries.length).toBeGreaterThan(40);
    expect(Object.keys(files)).toContain(NUMBER_HELPER);
    expect(Object.keys(files).some((f) => f.endsWith(".test.tsx"))).toBe(false);
  });

  it.each(["parseFloat", "toFixed", "z.coerce.number", "parseInt", "Math.round", "Math.ceil"])("sem %s", (forbidden) => {
    expect(entries.filter(([, source]) => source.includes(forbidden)).map(([path]) => path)).toEqual([]);
  });

  it("Number( só no helper de inteiros", () => {
    expect(entries.filter(([path, source]) => path !== NUMBER_HELPER && /\bNumber\(/.test(source)).map(([path]) => path)).toEqual([]);
  });
});
