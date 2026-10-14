import { describe, expect, it } from "vitest";
import { crc16, pixComValor } from "./pix";

// Exemplo do manual do BR Code do Banco Central (sem valor).
const BASE = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
const BASE_ACENTO = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5917José da Conceição6008BRASILIA62070503***630444E4";

// Vetores montados do zero com o CRC do backend (backend/tests/test_pix.py fixa os mesmos valores).
const COM_40 = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000520400005303986540540.005802BR5913Fulano de Tal6008BRASILIA62070503***6304996E";
const COM_1234_56 = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-42665544000052040000530398654071234.565802BR5913Fulano de Tal6008BRASILIA62070503***63046EE5";
const COM_40_ACENTO = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000520400005303986540540.005802BR5917José da Conceição6008BRASILIA62070503***630490AF";

describe("crc16", () => {
  it("bate com o valor de catálogo e com o exemplo do manual", () => {
    expect(crc16("123456789")).toBe("29B1");
    expect(crc16(BASE.slice(0, -4))).toBe("1D3D");
  });
});

describe("pixComValor", () => {
  it("insere o valor depois da moeda e refaz o CRC", () => {
    expect(pixComValor(BASE, "40.00")).toBe(COM_40);
    expect(pixComValor(BASE, "1234.56")).toBe(COM_1234_56);
  });

  it("conta caracteres no tamanho e bytes UTF-8 no CRC (nome com acento)", () => {
    expect(pixComValor(BASE_ACENTO, "40.00")).toBe(COM_40_ACENTO);
  });

  it("troca um valor que já exista em vez de duplicar", () => {
    const comOutroValor = pixComValor(BASE, "10.00")!;
    expect(pixComValor(comOutroValor, "40.00")).toBe(COM_40);
  });

  it("recusa valor inválido, zero ou código quebrado", () => {
    expect(pixComValor(BASE, "0.00")).toBeNull();
    expect(pixComValor(BASE, "40,00")).toBeNull();
    expect(pixComValor(BASE, "-1.00")).toBeNull();
    expect(pixComValor(BASE, "")).toBeNull();
    expect(pixComValor("texto qualquer", "40.00")).toBeNull();
    expect(pixComValor(BASE.slice(0, -10), "40.00")).toBeNull();
  });
});
