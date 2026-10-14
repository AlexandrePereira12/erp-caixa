import { describe, expect, it } from "vitest";

/**
 * Dinheiro e quantidade trafegam como string decimal. Nenhuma tela da Fase 1 pode converter para
 * number (parseFloat/Number), arredondar no cliente ou usar campo numérico nativo: a conversão do
 * que o usuário digita é sempre `parseDecimalInput` (lib/decimal) e a exibição é lib/money.
 */
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "parseFloat", pattern: /\bparseFloat\s*\(/ },
  { name: "Number.parseFloat", pattern: /\bNumber\s*\.\s*parseFloat/ },
  { name: "Number(...)", pattern: /\bNumber\s*\(/ },
  { name: "toFixed", pattern: /\.toFixed\s*\(/ },
  { name: "Math.round", pattern: /\bMath\.round\s*\(/ },
  { name: "valueAsNumber", pattern: /valueAsNumber/ },
  { name: "input type=number", pattern: /type=["']number["']/ },
  { name: "z.coerce.number", pattern: /z\.coerce\.number/ },
  { name: "z.number()", pattern: /z\.number\s*\(/ },
  { name: "unário + sobre texto", pattern: /[=(,:]\s*\+\s*[a-zA-Z_]+\.(value|text)\b/ },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

export function findViolations(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name);
}

const files = import.meta.glob(
  [
    "../{cadastros,catalogo,estoque,inventarios}/**/*.{ts,tsx}",
    "../../components/{SearchCombobox,SectionTabs,useListParams,icons-cadastros}.{ts,tsx}",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const productionFiles = Object.entries(files).filter(([path]) => !/\.test\.tsx?$/.test(path));

describe("higiene decimal das telas da Fase 1", () => {
  it("varre os arquivos de produção das quatro áreas", () => {
    expect(productionFiles.length).toBeGreaterThan(40);
    const names = productionFiles.map(([path]) => path);
    expect(names.some((n) => n.endsWith("EntryDialog.tsx"))).toBe(true);
    expect(names.some((n) => n.endsWith("InventoryDetailPage.tsx"))).toBe(true);
    expect(names.some((n) => n.endsWith("RecipeDialog.tsx"))).toBe(true);
    expect(names.some((n) => n.endsWith("PersonFormDialog.tsx"))).toBe(true);
  });

  it("nenhuma tela converte dinheiro/quantidade com parseFloat/Number nem usa campo numérico nativo", () => {
    const found = productionFiles.map(([path, source]) => ({ path, violations: findViolations(source) })).filter((entry) => entry.violations.length > 0);
    expect(found).toEqual([]);
  });

  it("o detector pega o que deve pegar (e ignora comentários)", () => {
    expect(findViolations("const x = parseFloat(text);")).toContain("parseFloat");
    expect(findViolations("const x = Number(value);")).toContain("Number(...)");
    expect(findViolations("total.toFixed(2)")).toContain("toFixed");
    expect(findViolations('<input type="number" />')).toContain("input type=number");
    expect(findViolations("const q = +input.value;")).toContain("unário + sobre texto");
    expect(findViolations("// nunca parseFloat(x)\n/* Number(y) */\nconst ok = parseDecimalInput(text, 2);")).toEqual([]);
  });
});
