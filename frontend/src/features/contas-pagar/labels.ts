import type { BadgeTone } from "@/components/Badge";
import { formatDay } from "@/components/pdv/dates";
import type { SituacaoFiltro, SituacaoTitulo, TituloPagar } from "./api";

export const SITUACAO_LABEL: Record<SituacaoTitulo, string> = {
  a_vencer: "A vencer",
  vencido: "Vencida",
  pago: "Paga",
  cancelado: "Cancelada",
};

/** Opções do filtro de situação, na ordem em que aparecem na tela. */
export const SITUACAO_FILTROS: { value: SituacaoFiltro; label: string }[] = [
  { value: "aberto", label: "Em aberto" },
  { value: "a_vencer", label: "A vencer" },
  { value: "vencido", label: "Vencidas" },
  { value: "pago", label: "Pagas" },
  { value: "cancelado", label: "Canceladas" },
  { value: "todos", label: "Todas" },
];

export function parseSituacaoFiltro(value: string | null | undefined): SituacaoFiltro {
  // sem escolha, a lista mostra o que ainda precisa de ação: contas em aberto (vencidas e a vencer)
  return SITUACAO_FILTROS.find((s) => s.value === value)?.value ?? "aberto";
}

/** Dias que ainda faltam para o vencimento. "A vencer" só chama atenção (warning) na última semana. */
const DIAS_DE_ATENCAO = 7;

type Vencimento = Pick<TituloPagar, "situacao" | "dias_para_vencer">;

export function situacaoTone(t: Vencimento): BadgeTone {
  switch (t.situacao) {
    case "vencido":
      return "danger";
    case "pago":
      return "success";
    case "a_vencer":
      return t.dias_para_vencer !== null && t.dias_para_vencer <= DIAS_DE_ATENCAO ? "warning" : "neutral";
    default:
      return "neutral";
  }
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export type HintTone = "danger" | "warning" | "muted";

export const HINT_CLASS: Record<HintTone, string> = {
  danger: "text-danger-text",
  warning: "text-warning-text",
  muted: "text-muted",
};

/**
 * Frase curta sob o vencimento, derivada de `dias_para_vencer` (só vem em conta aberta; negativo = atraso).
 * Conta paga mostra o dia do último pagamento; cancelada não tem frase.
 */
export function vencimentoHint(t: Pick<TituloPagar, "situacao" | "dias_para_vencer" | "pago_em">): { text: string; tone: HintTone } | null {
  const dias = t.dias_para_vencer;
  if (dias === null) return t.situacao === "pago" && t.pago_em ? { text: `paga em ${formatDay(t.pago_em)}`, tone: "muted" } : null;
  if (dias < 0) return { text: `venceu há ${plural(Math.abs(dias), "dia", "dias")}`, tone: "danger" };
  if (dias === 0) return { text: "vence hoje", tone: "warning" };
  return { text: `vence em ${plural(dias, "dia", "dias")}`, tone: dias <= DIAS_DE_ATENCAO ? "warning" : "muted" };
}

/** Conta cancelada não tem saldo a pagar: a tela mostra "—" em vez do valor que sobrou. */
export function saldoVisivel(t: Pick<TituloPagar, "status" | "saldo">): string | null {
  return t.status === "cancelado" ? null : t.saldo;
}
