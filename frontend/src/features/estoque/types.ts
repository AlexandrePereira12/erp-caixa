import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type SaldoOut = Schemas["SaldoOut"];
export type MovimentoOut = Schemas["MovimentoOut"];
export type EntradaIn = Schemas["EntradaIn"];
export type AjusteIn = Schemas["app__modules__inventory__schemas__AjusteIn"];
export type TipoAjuste = AjusteIn["tipo"];

export const MOVEMENT_TYPES = ["entrada", "saida", "perda", "ajuste", "inventario", "venda", "estorno_venda"] as const;
export type TipoMovimento = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  saida: "Saída",
  perda: "Perda",
  ajuste: "Ajuste",
  inventario: "Inventário",
  venda: "Venda",
  estorno_venda: "Estorno de venda",
};

export function movementLabel(tipo: string): string {
  return (MOVEMENT_LABELS as Record<string, string>)[tipo] ?? tipo;
}

const ORIGIN_LABELS: Record<string, string> = {
  manual_entrada: "Entrada manual",
  manual_ajuste: "Ajuste manual",
  inventario: "Inventário",
  venda: "Venda",
  estorno_venda: "Estorno de venda",
};

/** Origem do movimento para exibição (com o id do documento de origem quando existe). */
export function originLabel(origemTipo: string | null, origemId: number | null): string {
  if (!origemTipo) return "—";
  const base = ORIGIN_LABELS[origemTipo] ?? origemTipo;
  return origemId === null ? base : `${base} #${origemId}`;
}

export const ADJUSTMENT_OPTIONS: { value: TipoAjuste; label: string; hint: string }[] = [
  { value: "ajuste", label: "Ajuste (+/-)", hint: "Corrige o saldo: quantidade positiva soma e negativa baixa." },
  { value: "perda", label: "Perda", hint: "Baixa por perda, quebra ou vencimento: informe a quantidade positiva." },
  { value: "saida", label: "Saída", hint: "Baixa manual (consumo interno, doação…): informe a quantidade positiva." },
];
