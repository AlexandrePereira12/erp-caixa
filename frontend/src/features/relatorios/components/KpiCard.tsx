import type { ReactNode } from "react";

export type KpiTone = "neutral" | "success" | "warning" | "danger";

const CARD: Record<KpiTone, string> = {
  neutral: "border-line bg-surface",
  success: "border-success-text/30 bg-success-soft",
  warning: "border-warning-text/35 bg-warning-soft",
  danger: "border-danger/35 bg-danger-soft",
};
const VALUE: Record<KpiTone, string> = {
  neutral: "text-fg",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

/** Grade de indicadores: uma lista de definições (rótulo -> valor), lida assim por leitores de tela. */
export function KpiGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`grid grid-cols-1 gap-3 min-[30rem]:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</dl>;
}

export interface KpiCardProps {
  label: string;
  /** Valor já formatado (formatMoney, formatDecimal...). */
  value: ReactNode;
  /** Complemento sob o valor: período, contagem, selo de situação. */
  hint?: ReactNode;
  tone?: KpiTone;
  /** Indicador principal da tela: número maior e, em telas largas, ocupa duas colunas. */
  featured?: boolean;
}

/** Cartão de indicador. O valor usa a fonte de títulos; texto quebra em vez de estourar a tela de 320 px. */
export function KpiCard({ label, value, hint, tone = "neutral", featured = false }: KpiCardProps) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 shadow-sm ${CARD[tone]} ${featured ? "min-[30rem]:col-span-2 lg:col-span-1" : ""}`}>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className={`mt-1 break-words font-display font-semibold tabular-nums leading-tight ${VALUE[tone]} ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{value}</dd>
      {hint && <dd className="mt-1.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}
