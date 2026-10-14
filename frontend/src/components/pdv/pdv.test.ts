import { describe, expect, it } from "vitest";
import { dayStartIso, elapsedLabel, formatDay, nextDayStartIso } from "./dates";
import { parseConferenciaIncompleta, parseDiferencaSemJustificativa, parseEstoqueInsuficiente, parsePagamentoDiferente } from "./errorInfo";
import { parseMoney, positiveIntParam, toInt, trimDecimalText } from "./forms";

describe("forms", () => {
  it("parseMoney normaliza para 2 casas e recusa lixo", () => {
    expect(parseMoney("12,5")).toBe("12.50");
    expect(parseMoney("1.234,56")).toBe("1234.56");
    expect(parseMoney("7")).toBe("7.00");
    expect(parseMoney("12,345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("toInt só aceita inteiros pequenos", () => {
    expect(toInt("12")).toBe(12);
    expect(toInt(" 7 ")).toBe(7);
    expect(toInt("1,5")).toBeUndefined();
    expect(toInt("-1")).toBeUndefined();
    expect(toInt("")).toBeUndefined();
    expect(toInt("99999999999")).toBeUndefined();
    expect(positiveIntParam("0")).toBeUndefined();
    expect(positiveIntParam("3")).toBe(3);
  });
  it("trimDecimalText", () => {
    expect(trimDecimalText("1.500")).toBe("1,5");
    expect(trimDecimalText("2.000")).toBe("2");
    expect(trimDecimalText("100")).toBe("100");
    expect(trimDecimalText("0.350")).toBe("0,35");
  });
});

describe("dates", () => {
  it("filtro de período: início do dia e limite exclusivo no dia seguinte", () => {
    expect(dayStartIso("2026-10-13")).toBe(new Date("2026-10-13T00:00").toISOString());
    expect(nextDayStartIso("2026-10-13")).toBe(new Date("2026-10-14T00:00").toISOString());
    expect(nextDayStartIso("2026-12-31")).toBe(new Date("2027-01-01T00:00").toISOString());
    expect(dayStartIso("13/10/2026")).toBeUndefined();
    expect(nextDayStartIso("")).toBeUndefined();
  });
  it("formatDay não desloca o dia pelo fuso", () => {
    expect(formatDay("2026-10-20")).toBe("20/10/2026");
    expect(formatDay(null)).toBe("—");
  });
  it("elapsedLabel", () => {
    const now = new Date("2026-10-13T15:00:00Z").getTime();
    expect(elapsedLabel("2026-10-13T14:59:40Z", now)).toBe("agora");
    expect(elapsedLabel("2026-10-13T14:25:00Z", now)).toBe("35 min");
    expect(elapsedLabel("2026-10-13T13:40:00Z", now)).toBe("1 h 20 min");
    expect(elapsedLabel("2026-10-13T13:00:00Z", now)).toBe("2 h");
    expect(elapsedLabel("2026-10-11T13:00:00Z", now)).toBe("2 d");
  });
});

describe("errorInfo (leitura das mensagens do backend)", () => {
  it("pagamento_diferente_do_total", () => {
    expect(parsePagamentoDiferente("Os pagamentos somam 19.00 e o total da comanda é 19.80.")).toEqual({ informado: "19.00", total: "19.80" });
    expect(parsePagamentoDiferente("outra coisa")).toBeNull();
  });
  it("estoque_insuficiente aceita nome de produto com dois-pontos e vírgula", () => {
    expect(parseEstoqueInsuficiente("Estoque insuficiente de Chopp: 300ml, gelado: saldo 1.000, necessário 2.000.")).toEqual({ produto: "Chopp: 300ml, gelado", saldo: "1.000", necessario: "2.000" });
    expect(parseEstoqueInsuficiente("Estoque insuficiente de X: saldo -2.000, necessário 3.000.")?.saldo).toBe("-2.000");
  });
  it("conferencia_incompleta casa nomes conhecidos (inclusive com vírgula)", () => {
    const formas = [
      { id: 1, nome: "Dinheiro" },
      { id: 2, nome: "Pix" },
      { id: 3, nome: "Vale, refeição" },
    ];
    expect(parseConferenciaIncompleta("Informe o valor contado de: Pix, Vale, refeição.", formas)).toEqual([2, 3]);
    expect(parseConferenciaIncompleta("Informe o valor contado de: Dinheiro.", formas)).toEqual([1]);
    expect(parseConferenciaIncompleta("Informe o valor contado de: Cripto.", formas)).toBeNull();
    expect(parseConferenciaIncompleta("outra", formas)).toBeNull();
  });
  it("diferenca_sem_justificativa", () => {
    const formas = [{ id: 2, nome: "Pix" }];
    expect(parseDiferencaSemJustificativa("Pix: há diferença de -10.00. Informe a justificativa.", formas)).toEqual({ formaId: 2, forma: "Pix", diferenca: "-10.00" });
    expect(parseDiferencaSemJustificativa("Pix: há diferença de +5.00. Informe a justificativa.", formas)?.diferenca).toBe("5.00");
    expect(parseDiferencaSemJustificativa("Cripto: há diferença de 1.00. Informe a justificativa.", formas)?.formaId).toBeNull();
    expect(parseDiferencaSemJustificativa("x", formas)).toBeNull();
  });
});

describe("leitores estruturados de erro (ApiError.extras)", () => {
  const formas = [
    { id: 1, nome: "Dinheiro" },
    { id: 2, nome: "Pix" },
  ];

  it("lê o objeto detalhes do backend em vez do texto", async () => {
    const { ApiError } = await import("@/lib/api/errors");
    const { conferenciaIncompletaDe, diferencaSemJustificativaDe, estoqueInsuficienteDe, pagamentoDiferenteDe } =
      await import("./errorInfo");

    expect(pagamentoDiferenteDe(new ApiError(422, "x", "texto qualquer", [], { total: "12.50", informado: "10.00" }))).toEqual({
      total: "12.50",
      informado: "10.00",
    });
    expect(
      estoqueInsuficienteDe(
        new ApiError(409, "x", "Estoque insuficiente de Chopp: saldo 1.000, necessário 2.000.", [], {
          produto_id: 7,
          saldo: "1.000",
          necessario: "2.000",
        }),
      ),
    ).toEqual({ produto: "Chopp", saldo: "1.000", necessario: "2.000" });
    expect(conferenciaIncompletaDe(new ApiError(422, "x", "mensagem mudou", [], { formas: ["Pix", "Dinheiro"] }), formas)).toEqual([2, 1]);
    expect(
      diferencaSemJustificativaDe(new ApiError(422, "x", "mensagem mudou", [], { forma_pagamento_id: 2, diferenca: "-3.00" }), formas),
    ).toEqual({ formaId: 2, forma: "Pix", diferenca: "-3.00" });
  });

  it("sem objeto estruturado, volta ao texto da mensagem", async () => {
    const { ApiError } = await import("@/lib/api/errors");
    const { pagamentoDiferenteDe } = await import("./errorInfo");
    const erro = new ApiError(422, "x", "Os pagamentos somam 19.00 e o total da comanda é 19.80.");
    expect(pagamentoDiferenteDe(erro)).toEqual({ informado: "19.00", total: "19.80" });
  });
});
