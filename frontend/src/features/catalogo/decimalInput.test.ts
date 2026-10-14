import { describe, expect, it } from "vitest";
import { decimalToInput, formatCost, formatSigned, parseMoneyInput, parseOptionalMoney, parseQuantityInput } from "./decimalInput";

describe("parseQuantityInput", () => {
  it("converte a vírgula digitada em string decimal da API", () => {
    expect(parseQuantityInput("1,5", { scale: 3, unit: "KG" })).toEqual({ value: "1.5" });
    expect(parseQuantityInput(" 0,150 ", { scale: 3 })).toEqual({ value: "0.150" });
    expect(parseQuantityInput("2", { scale: 0, unit: "UN" })).toEqual({ value: "2" });
  });

  it("respeita as casas da unidade e explica o erro antes de enviar", () => {
    expect(parseQuantityInput("1,5", { scale: 0, unit: "UN" }).error).toBe("A unidade UN não aceita casas decimais: use um número inteiro.");
    expect(parseQuantityInput("1,2345", { scale: 3, unit: "KG" }).error).toBe("A unidade KG aceita no máximo 3 casas decimais.");
    expect(parseQuantityInput("1,5", { scale: 1, unit: "L" })).toEqual({ value: "1.5" });
    expect(parseQuantityInput("1,25", { scale: 1, unit: "L" }).error).toBe("A unidade L aceita no máximo 1 casa decimal.");
  });

  it("recusa texto, vazio, zero e negativo conforme as opções", () => {
    expect(parseQuantityInput("abc", { scale: 3 }).error).toMatch(/inválida/);
    expect(parseQuantityInput("", { scale: 3 }).error).toBe("Informe a quantidade.");
    expect(parseQuantityInput("0", { scale: 3 }).error).toBe("A quantidade deve ser maior que zero.");
    expect(parseQuantityInput("0", { scale: 3, allowZero: true })).toEqual({ value: "0" });
    expect(parseQuantityInput("-1", { scale: 3 }).error).toBe("A quantidade não pode ser negativa.");
    expect(parseQuantityInput("-1,5", { scale: 3, allowNegative: true })).toEqual({ value: "-1.5" });
  });

  it("aceita o sinal + e o menos tipográfico", () => {
    expect(parseQuantityInput("+2", { scale: 0, allowNegative: true })).toEqual({ value: "2" });
    expect(parseQuantityInput("−2", { scale: 0, allowNegative: true })).toEqual({ value: "-2" });
  });

  it("com escala 0, ponto de milhar é milhar (1.500 = 1500)", () => {
    expect(parseQuantityInput("1.500", { scale: 0 })).toEqual({ value: "1500" });
  });
});

describe("parseMoneyInput / parseOptionalMoney", () => {
  it("converte dinheiro com 2 casas e custo com 4", () => {
    expect(parseMoneyInput("12,50")).toEqual({ value: "12.50" });
    expect(parseMoneyInput("1.234,56")).toEqual({ value: "1234.56" });
    expect(parseMoneyInput("0,0333", { scale: 4 })).toEqual({ value: "0.0333" });
  });

  it("recusa casas demais, negativo e texto", () => {
    expect(parseMoneyInput("12,505").error).toBe("Use no máximo 2 casas decimais.");
    expect(parseMoneyInput("-1").error).toBe("O valor não pode ser negativo.");
    expect(parseMoneyInput("doze").error).toMatch(/inválido/);
  });

  it("campo opcional vazio vale null", () => {
    expect(parseOptionalMoney("  ")).toEqual({ value: null });
    expect(parseOptionalMoney("3,5")).toEqual({ value: "3.5" });
  });
});

describe("formatação", () => {
  it("decimalToInput devolve texto de campo", () => {
    expect(decimalToInput("12.50")).toBe("12,50");
    expect(decimalToInput("7.500", { trim: true })).toBe("7,5");
    expect(decimalToInput("7.000", { trim: true })).toBe("7");
    expect(decimalToInput(null)).toBe("");
  });

  it("formatCost mostra de 2 a 4 casas (custo médio não é arredondado para centavos)", () => {
    expect(formatCost("0.0333")).toMatch(/0,0333/);
    expect(formatCost("3.2500")).toMatch(/3,25/);
    expect(formatCost(null)).toBe("—");
    expect(formatCost("abc")).toBe("—");
  });

  it("formatSigned põe + só em positivos", () => {
    expect(formatSigned("2.000")).toBe("+2");
    expect(formatSigned("-1.500")).toBe("-1,5");
    expect(formatSigned(null)).toBe("—");
  });
});
