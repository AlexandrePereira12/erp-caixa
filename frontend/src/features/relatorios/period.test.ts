import { describe, expect, it } from "vitest";
import { barPercent, chartMax } from "./chartMath";
import { eachDay, MAX_PERIOD_DAYS, periodError, validDay } from "./period";

describe("validDay", () => {
  it("aceita datas reais e recusa o resto", () => {
    expect(validDay("2026-10-14")).toBe("2026-10-14");
    expect(validDay("2024-02-29")).toBe("2024-02-29");
    expect(validDay("2026-02-29")).toBe(""); // 2026 não é bissexto
    expect(validDay("2026-02-30")).toBe("");
    expect(validDay("2026-13-01")).toBe("");
    expect(validDay("14/10/2026")).toBe("");
    expect(validDay("2026-10-14T00:00")).toBe("");
    expect(validDay("")).toBe("");
    expect(validDay(null)).toBe("");
    expect(validDay(undefined)).toBe("");
  });
});

describe("periodError", () => {
  it("só valida quando as duas datas existem", () => {
    expect(periodError("", "")).toBeUndefined();
    expect(periodError("2026-10-20", "")).toBeUndefined();
    expect(periodError("", "2026-10-10")).toBeUndefined();
  });

  it("recusa data final antes da inicial, mas aceita o mesmo dia", () => {
    expect(periodError("2026-10-20", "2026-10-10")).toBe("A data final não pode ser anterior à inicial.");
    expect(periodError("2026-10-10", "2026-10-10")).toBeUndefined();
  });

  it("recusa 366 dias ou mais (igual ao backend) e aceita 365 dias de diferença", () => {
    expect(MAX_PERIOD_DAYS).toBe(366);
    expect(periodError("2025-10-14", "2026-10-14")).toBeUndefined(); // 365 dias de diferença
    expect(periodError("2025-10-13", "2026-10-14")).toBe("O período máximo é de 366 dias.");
  });
});

describe("eachDay", () => {
  it("lista os dias da janela, inclusive os extremos, atravessando mês e ano bissexto", () => {
    expect(eachDay("2026-10-01", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(eachDay("2026-10-31", "2026-11-02")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(eachDay("2024-02-28", "2024-03-01")).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
    expect(eachDay("2026-12-31", "2027-01-01")).toEqual(["2026-12-31", "2027-01-01"]);
    expect(eachDay("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
  });

  it("intervalo invertido ou inválido não gera dias", () => {
    expect(eachDay("2026-10-05", "2026-10-01")).toEqual([]);
    expect(eachDay("lixo", "2026-10-01")).toEqual([]);
  });

  it("nunca passa de um ano e um dia de colunas", () => {
    expect(eachDay("2020-01-01", "2026-10-01").length).toBeLessThanOrEqual(MAX_PERIOD_DAYS + 1);
  });
});

describe("chartMax e barPercent", () => {
  it("chartMax compara por valor", () => {
    expect(chartMax(["9.99", "10.00", "2"])).toBe("10.00");
    expect(chartMax([])).toBe("0");
  });

  it("barPercent: proporção inteira; valor positivo nunca some; zero fica zero", () => {
    expect(barPercent("50.00", "100.00")).toBe(50);
    expect(barPercent("100", "100.00")).toBe(100);
    expect(barPercent("0.01", "1000.00")).toBe(1); // arredondaria para 0: a barra continua visível
    expect(barPercent("0", "1000.00")).toBe(0);
    expect(barPercent("0.00", "0")).toBe(0);
  });
});
