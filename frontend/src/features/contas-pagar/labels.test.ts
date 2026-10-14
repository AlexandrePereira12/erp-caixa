import { describe, expect, it } from "vitest";
import { periodoError, validDay } from "./dates";
import { parseSituacaoFiltro, plural, saldoVisivel, situacaoTone, vencimentoHint } from "./labels";

describe("vencimentoHint", () => {
  it.each([
    [-3, "venceu há 3 dias", "danger"],
    [-1, "venceu há 1 dia", "danger"],
    [0, "vence hoje", "warning"],
    [1, "vence em 1 dia", "warning"],
    [7, "vence em 7 dias", "warning"],
    [8, "vence em 8 dias", "muted"],
    [30, "vence em 30 dias", "muted"],
  ] as const)("dias_para_vencer %i -> %s", (dias, text, tone) => {
    expect(vencimentoHint({ situacao: dias < 0 ? "vencido" : "a_vencer", dias_para_vencer: dias, pago_em: null })).toEqual({ text, tone });
  });

  it("conta paga mostra o dia do pagamento; cancelada e paga sem data não têm frase", () => {
    expect(vencimentoHint({ situacao: "pago", dias_para_vencer: null, pago_em: "2026-10-09" })).toEqual({ text: "paga em 09/10/2026", tone: "muted" });
    expect(vencimentoHint({ situacao: "cancelado", dias_para_vencer: null, pago_em: null })).toBeNull();
    expect(vencimentoHint({ situacao: "pago", dias_para_vencer: null, pago_em: null })).toBeNull();
  });
});

describe("situacaoTone", () => {
  it("vencida é danger, paga é success, a vencer é warning só na última semana e cancelada é neutra", () => {
    expect(situacaoTone({ situacao: "vencido", dias_para_vencer: -2 })).toBe("danger");
    expect(situacaoTone({ situacao: "pago", dias_para_vencer: null })).toBe("success");
    expect(situacaoTone({ situacao: "a_vencer", dias_para_vencer: 0 })).toBe("warning");
    expect(situacaoTone({ situacao: "a_vencer", dias_para_vencer: 7 })).toBe("warning");
    expect(situacaoTone({ situacao: "a_vencer", dias_para_vencer: 20 })).toBe("neutral");
    expect(situacaoTone({ situacao: "cancelado", dias_para_vencer: null })).toBe("neutral");
  });
});

describe("auxiliares", () => {
  it("plural, situação do filtro e saldo de conta cancelada", () => {
    expect(plural(1, "conta", "contas")).toBe("1 conta");
    expect(plural(0, "conta", "contas")).toBe("0 contas");
    expect(parseSituacaoFiltro("vencido")).toBe("vencido");
    expect(parseSituacaoFiltro("todos")).toBe("todos");
    expect(parseSituacaoFiltro("aberto")).toBe("aberto");
    expect(parseSituacaoFiltro(null)).toBe("aberto"); // padrão da tela: o que ainda precisa de ação
    expect(parseSituacaoFiltro("lixo")).toBe("aberto");
    expect(saldoVisivel({ status: "aberto", saldo: "10.00" })).toBe("10.00");
    expect(saldoVisivel({ status: "cancelado", saldo: "10.00" })).toBeNull();
  });

  it("validDay só aceita datas reais do calendário e o período exige de <= até", () => {
    expect(validDay("2026-10-14")).toBe("2026-10-14");
    expect(validDay("2026-02-30")).toBe("");
    expect(validDay("14/10/2026")).toBe("");
    expect(validDay(null)).toBe("");
    expect(periodoError("2026-10-14", "2026-10-13")).toBe("A data final não pode ser anterior à inicial.");
    expect(periodoError("2026-10-14", "2026-10-14")).toBeUndefined();
    expect(periodoError("2026-10-14", "")).toBeUndefined();
  });
});
