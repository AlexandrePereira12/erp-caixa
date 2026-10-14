import { describe, expect, it } from "vitest";
import { dayEndExclusiveIso, dayStartIso, validDay } from "./dates";

describe("período dos movimentos", () => {
  it("`de` é a meia-noite local do dia", () => {
    expect(dayStartIso("2026-10-13")).toBe(new Date(2026, 9, 13, 0, 0).toISOString());
  });

  it("`ate` é EXCLUSIVO no backend: o dia escolhido inteiro entra, então vira a meia-noite local do dia seguinte", () => {
    expect(dayEndExclusiveIso("2026-10-13")).toBe(new Date(2026, 9, 14, 0, 0).toISOString());
    expect(dayEndExclusiveIso("2026-12-31")).toBe(new Date(2027, 0, 1, 0, 0).toISOString());
    expect(dayEndExclusiveIso("2026-02-28")).toBe(new Date(2026, 2, 1, 0, 0).toISOString());
  });

  it("valores malformados da URL são ignorados", () => {
    expect(dayStartIso("13/10/2026")).toBeUndefined();
    expect(dayEndExclusiveIso("")).toBeUndefined();
    expect(validDay("2026-10-13")).toBe("2026-10-13");
    expect(validDay("hoje")).toBe("");
    expect(validDay(null)).toBe("");
  });
});
