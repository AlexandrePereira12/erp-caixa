import { describe, expect, it } from "vitest";
import { formatDecimal, formatMoney } from "./money";

// Intl usa espaço não separável entre "R$" e o número.
const norm = (s: string) => s.replace(/\p{Zs}/gu, " ");

describe("formatMoney", () => {
  it("formata string decimal em BRL pt-BR", () => {
    expect(norm(formatMoney("1234.5"))).toBe("R$ 1.234,50");
    expect(norm(formatMoney("0"))).toBe("R$ 0,00");
    expect(norm(formatMoney("12.99"))).toBe("R$ 12,99");
    expect(norm(formatMoney("1000000"))).toBe("R$ 1.000.000,00");
  });

  it("aceita negativos", () => {
    expect(norm(formatMoney("-10.5"))).toBe("-R$ 10,50");
  });

  it("não passa por float: valores acima de 2^53 mantêm todos os dígitos", () => {
    // Em number, 9007199254740993.10 viraria 9007199254740992 ou ...994.
    expect(norm(formatMoney("9007199254740993.10"))).toBe("R$ 9.007.199.254.740.993,10");
    expect(norm(formatMoney("12345678901234567890.12"))).toBe("R$ 12.345.678.901.234.567.890,12");
  });

  it("arredonda só na exibição, com decimal exato (0,1 + 0,2 nunca é calculado aqui)", () => {
    expect(norm(formatMoney("0.30"))).toBe("R$ 0,30");
    expect(norm(formatMoney("10.005"))).toBe("R$ 10,01");
  });

  it("valor ausente ou malformado vira travessão, nunca NaN", () => {
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("")).toBe("—");
    expect(formatMoney("abc")).toBe("—");
    expect(formatMoney("1,50")).toBe("—");
    expect(formatMoney("1e3")).toBe("—");
  });
});

describe("formatDecimal", () => {
  it("formata quantidades sem moeda", () => {
    expect(formatDecimal("1.500")).toBe("1,5");
    expect(formatDecimal("2500.125")).toBe("2.500,125");
    expect(formatDecimal("3", { minimumFractionDigits: 2 })).toBe("3,00");
    expect(formatDecimal("x")).toBe("—");
  });
});
