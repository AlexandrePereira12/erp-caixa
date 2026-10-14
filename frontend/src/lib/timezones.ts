/** Fusos do Brasil primeiro; o restante vem do próprio navegador (Intl). */
const BRAZIL = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
];

function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export interface TimezoneOption {
  value: string;
  label: string;
}

export function timezoneOptions(current?: string): { brasil: TimezoneOption[]; outros: TimezoneOption[] } {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  const brasil = [...BRAZIL];
  // Valor já salvo que não está nas listas continua selecionável.
  if (current && !brasil.includes(current) && !all.includes(current)) brasil.unshift(current);
  return {
    brasil: brasil.map((value) => ({ value, label: `${value.replace(/_/g, " ")} (${offsetLabel(value) || "—"})` })),
    outros: all.filter((z) => !brasil.includes(z)).map((value) => ({ value, label: value.replace(/_/g, " ") })),
  };
}
