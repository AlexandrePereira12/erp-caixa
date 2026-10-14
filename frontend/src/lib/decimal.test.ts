import { describe, expect, it } from "vitest";
import { addDecimal, compareDecimal, parseDecimalInput, subDecimal, sumDecimals } from "./decimal";

describe("aritmética decimal exata", () => {
  it("soma e subtrai sem erro de ponto flutuante", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
    expect(subDecimal("35.00", "20.00")).toBe("15.00");
    expect(subDecimal("10", "10.01")).toBe("-0.01");
    expect(subDecimal("0.00", "0.00")).toBe("0.00");
    expect(sumDecimals(["10.10", "20.20", "0.01"])).toBe("30.31");
    expect(sumDecimals([])).toBe("0");
  });

  it("funciona acima de 2^53", () => {
    expect(addDecimal("9007199254740993.01", "0.01")).toBe("9007199254740993.02");
  });

  it("compara por valor, não por texto", () => {
    expect(compareDecimal("10.0", "10.00")).toBe(0);
    expect(compareDecimal("9.99", "10")).toBe(-1);
    expect(compareDecimal("-1", "-2")).toBe(1);
  });

  it("recusa texto que não é decimal", () => {
    expect(() => addDecimal("abc", "1")).toThrow();
    expect(() => addDecimal("1,5", "1")).toThrow();
  });
});

describe("parseDecimalInput", () => {
  it.each([
    ["12,50", "12.50"],
    ["12.5", "12.5"],
    ["1.234,56", "1234.56"],
    ["1.234.567", "1234567"],
    ["0,5", "0.5"],
    [" 7 ", "7"],
  ])("converte %s", (entrada, esperado) => expect(parseDecimalInput(entrada)).toBe(esperado));

  it.each(["", "abc", "1,2,3", "12,345", "--1", "1e3", "R$ 10"])("recusa %s", (entrada) =>
    expect(parseDecimalInput(entrada)).toBeNull(),
  );

  it("aceita mais casas quando a unidade permite (quantidade)", () => {
    expect(parseDecimalInput("0,125", 3)).toBe("0.125");
    expect(parseDecimalInput("1.250", 3)).toBe("1.250"); // com 3 casas permitidas, é decimal
    expect(parseDecimalInput("0,1255", 3)).toBeNull();
  });
});
