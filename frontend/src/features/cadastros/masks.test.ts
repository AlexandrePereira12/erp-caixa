import { describe, expect, it } from "vitest";
import { documentLengthError, formatDocument, maskCep, maskCnpj, maskCpf, maskDocument, maskPhone } from "./masks";

describe("máscaras", () => {
  it("CPF e CNPJ progressivos, sem separador sobrando", () => {
    expect(maskCpf("529")).toBe("529");
    expect(maskCpf("5299")).toBe("529.9");
    expect(maskCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("529.982.247-25999")).toBe("529.982.247-25");
    expect(maskCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskDocument("52998224725", "F")).toBe("529.982.247-25");
    expect(maskDocument("52998224725", "J")).toBe("52.998.224/725");
  });

  it("CEP", () => {
    expect(maskCep("01310100")).toBe("01310-100");
    expect(maskCep("0131")).toBe("0131");
  });

  it("formatDocument e validação leve de tamanho", () => {
    expect(formatDocument("52998224725", "F")).toBe("529.982.247-25");
    expect(formatDocument(null, "F")).toBe("—");
    expect(formatDocument("123", "F")).toBe("123");
    expect(documentLengthError("529.982", "F")).toBe("O CPF deve ter 11 dígitos.");
    expect(documentLengthError("11.222.333/0001", "J")).toBe("O CNPJ deve ter 14 dígitos.");
    expect(documentLengthError("", "J")).toBeNull();
    expect(documentLengthError("529.982.247-25", "F")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("aplica (DD) 0000-0000 até 10 dígitos e (DD) 00000-0000 com 11, sem separador sobrando", () => {
    expect(maskPhone("")).toBe("");
    expect(maskPhone("8")).toBe("(8");
    expect(maskPhone("85")).toBe("(85");
    expect(maskPhone("853")).toBe("(85) 3");
    expect(maskPhone("8533334444")).toBe("(85) 3333-4444");
    expect(maskPhone("85999994444")).toBe("(85) 99999-4444");
    expect(maskPhone("(85) 99999-4444 999")).toBe("(85) 99999-4444");
  });
});
