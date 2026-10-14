import { describe, expect, it } from "vitest";
import type { FormaPagamento } from "@/components/pdv/types";
import { calcularPrevia, checkLinhas, montarCorpo, novaLinha, podeConfirmar, toInputText } from "./fechamento";
import { FORMAS } from "./fixtures";

const formas = FORMAS as FormaPagamento[];

describe("prévia do fechamento (só exibição; o backend recalcula)", () => {
  it("soma exata em decimais: 0,10 + 0,20 cobre 0,30", () => {
    const linhas = [novaLinha(1, { formaId: "2", valor: "0,10" }), novaLinha(2, { formaId: "2", valor: "0,20" })];
    const checks = checkLinhas(linhas, formas);
    const previa = calcularPrevia("0.30", checks);
    expect(previa.soma).toBe("0.30");
    expect(previa.bate).toBe(true);
    expect(previa.falta).toBe("0");
    expect(podeConfirmar("0.30", linhas, checks, previa)).toBe(true);
  });

  it("falta cobrir e excesso", () => {
    const checks = checkLinhas([novaLinha(1, { formaId: "2", valor: "10" })], formas);
    expect(calcularPrevia("19.80", checks)).toMatchObject({ soma: "10.00", falta: "9.80", excesso: "0", bate: false });
    expect(calcularPrevia("5.00", checks)).toMatchObject({ falta: "0", excesso: "5.00", bate: false });
  });

  it("troco previsto só em dinheiro com valor recebido válido", () => {
    const linhas = [novaLinha(1, { formaId: "1", valor: "19,80", recebido: "50" })];
    const checks = checkLinhas(linhas, formas);
    expect(checks[0]!.troco).toBe("30.20");
    expect(calcularPrevia("19.80", checks).troco).toBe("30.20");
    // Recebido menor que o valor: erro e sem troco.
    const menor = checkLinhas([novaLinha(1, { formaId: "1", valor: "19,80", recebido: "10" })], formas);
    expect(menor[0]!.erros.recebido).toBeTruthy();
    expect(menor[0]!.troco).toBeNull();
  });

  it("valida cada linha: forma, valor positivo, parcelas só no crédito e um único fiado", () => {
    const checks = checkLinhas(
      [
        novaLinha(1, { formaId: "", valor: "" }),
        novaLinha(2, { formaId: "2", valor: "0" }),
        novaLinha(3, { formaId: "3", valor: "10", parcelas: "25" }),
        novaLinha(4, { formaId: "4", valor: "5" }),
        novaLinha(5, { formaId: "4", valor: "5" }),
      ],
      formas,
    );
    expect(checks[0]!.erros).toMatchObject({ forma: expect.any(String), valor: expect.any(String) });
    expect(checks[1]!.erros.valor).toBe("O valor deve ser maior que zero.");
    expect(checks[2]!.erros.parcelas).toBe("Parcelas de 1 a 24.");
    expect(checks[3]!.erros).toEqual({});
    expect(checks[4]!.erros.forma).toBe("Use uma única linha de pagamento em fiado.");
  });

  it("total zero só confirma sem linhas", () => {
    expect(podeConfirmar("0.00", [], [], calcularPrevia("0.00", []))).toBe(true);
    const linhas = [novaLinha(1, { formaId: "2", valor: "1" })];
    const checks = checkLinhas(linhas, formas);
    expect(podeConfirmar("0.00", linhas, checks, calcularPrevia("0.00", checks))).toBe(false);
  });

  it("corpo do envio: strings decimais com 2 casas, parcelas inteiro, opcionais só quando preenchidos", () => {
    const linhas = [
      novaLinha(1, { formaId: "1", valor: "10,5", recebido: "20" }),
      novaLinha(2, { formaId: "3", valor: "9,3", parcelas: "3", observacao: " final 1234 " }),
    ];
    const checks = checkLinhas(linhas, formas);
    expect(montarCorpo(linhas, checks, { clienteId: 20 })).toEqual({
      pagamentos: [
        { forma_pagamento_id: 1, valor: "10.50", valor_recebido: "20.00" },
        { forma_pagamento_id: 3, valor: "9.30", parcelas: 3, observacao: "final 1234" },
      ],
      cliente_id: 20,
    });
    expect(montarCorpo(linhas, checks, { permitirEstoqueNegativo: true, justificativaEstoque: "contagem" })).toMatchObject({ permitir_estoque_negativo: true, justificativa_estoque: "contagem" });
  });

  it("toInputText troca só o ponto decimal", () => {
    expect(toInputText("1234.50")).toBe("1234,50");
  });
});
