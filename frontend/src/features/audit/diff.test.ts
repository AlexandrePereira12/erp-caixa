import { describe, expect, it } from "vitest";
import { diffRows, formatValue, isSensitiveKey } from "./diff";

describe("diffRows", () => {
  it("marca como alterados os campos listados ou com valor diferente", () => {
    const rows = diffRows({ nome: "Ana", ativo: true, email: "a@x.com" }, { nome: "Ana Souza", ativo: true, email: "a@x.com" }, ["nome"]);
    const byField = Object.fromEntries(rows.map((r) => [r.campo, r]));
    expect(byField.nome).toMatchObject({ antes: "Ana", depois: "Ana Souza", changed: true });
    expect(byField.ativo!.changed).toBe(false);
    expect(byField.email!.changed).toBe(false);
  });

  it("detecta mudança mesmo que campos_alterados venha vazio/nulo", () => {
    const rows = diffRows({ a: 1, b: 2 }, { a: 1, b: 3 }, null);
    expect(rows.filter((r) => r.changed).map((r) => r.campo)).toEqual(["b"]);
  });

  it("compara listas e objetos por conteúdo", () => {
    const rows = diffRows({ papeis: [1, 2], cfg: { x: 1 } }, { papeis: [1, 2], cfg: { x: 2 } }, []);
    expect(rows.find((r) => r.campo === "papeis")!.changed).toBe(false);
    expect(rows.find((r) => r.campo === "cfg")!.changed).toBe(true);
  });

  it("criação (antes nulo): todos os campos aparecem como novos", () => {
    const rows = diffRows(null, { nome: "Ana", email: "a@x.com" }, null);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.changed && !r.hasAntes && r.hasDepois)).toBe(true);
  });

  it("exclusão (depois nulo): todos os campos aparecem como removidos", () => {
    const rows = diffRows({ nome: "Ana" }, null, null);
    expect(rows[0]).toMatchObject({ campo: "nome", hasAntes: true, hasDepois: false, changed: true });
  });

  it("campo listado em campos_alterados mas ausente nos snapshots ainda aparece", () => {
    const rows = diffRows({}, {}, ["permissoes"]);
    expect(rows).toEqual([{ campo: "permissoes", antes: undefined, depois: undefined, hasAntes: false, hasDepois: false, changed: true }]);
  });

  it("sem snapshots nem campos: lista vazia", () => {
    expect(diffRows(null, null, null)).toEqual([]);
  });
});

describe("formatValue / isSensitiveKey", () => {
  it("formata tipos primitivos e estruturas", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue("")).toBe("(vazio)");
    expect(formatValue(true)).toBe("sim");
    expect(formatValue(false)).toBe("não");
    expect(formatValue(7)).toBe("7");
    expect(formatValue([1, 2])).toBe("[\n  1,\n  2\n]");
  });

  it("reconhece campos sensíveis", () => {
    expect(isSensitiveKey("senha_hash")).toBe(true);
    expect(isSensitiveKey("access_token")).toBe(true);
    expect(isSensitiveKey("nome")).toBe(false);
  });
});
