import { describe, expect, it } from "vitest";
import { humanizeStockMessage } from "./messages";

describe("humanizeStockMessage", () => {
  it("formata saldo e necessário em pt-BR com a unidade", () => {
    expect(humanizeStockMessage("Estoque insuficiente de Farinha de Trigo: saldo 20.000, necessário 30.000.", "KG")).toBe("Estoque insuficiente de Farinha de Trigo: saldo 20 KG, necessário 30 KG.");
    expect(humanizeStockMessage("Estoque insuficiente de Leite: saldo 1.250, necessário 2.500.", "L")).toBe("Estoque insuficiente de Leite: saldo 1,25 L, necessário 2,5 L.");
    expect(humanizeStockMessage("Estoque insuficiente de X: saldo -3.000, necessário 1.000.", "UN")).toBe("Estoque insuficiente de X: saldo -3 UN, necessário 1 UN.");
  });

  it("mensagem em outro formato passa como veio", () => {
    expect(humanizeStockMessage("Sem estoque.", "KG")).toBe("Sem estoque.");
  });
});
