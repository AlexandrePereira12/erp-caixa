import { compareDecimal } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";

export type DiferencaKind = "sobra" | "falta" | "confere";

/** Sinal da diferença de caixa: positiva = sobra (contou mais), negativa = falta, zero = confere. */
export function diferencaKind(value: string): DiferencaKind {
  const sign = compareDecimal(value, "0");
  return sign > 0 ? "sobra" : sign < 0 ? "falta" : "confere";
}

export const DIFERENCA_LABEL: Record<DiferencaKind, string> = { sobra: "Sobra", falta: "Falta", confere: "Confere" };

const TEXT: Record<DiferencaKind, string> = { sobra: "text-warning-text", falta: "text-danger-text", confere: "text-success-text" };

/** Valor da diferença com a palavra ao lado (cor nunca sozinha). `null` = caixa ainda aberto, sem conferência. */
export function DiferencaValue({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted">Em aberto</span>;
  const kind = diferencaKind(value);
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 font-medium tabular-nums ${TEXT[kind]}`}>
      {formatMoney(value)}
      <span className="text-xs font-semibold">{DIFERENCA_LABEL[kind]}</span>
    </span>
  );
}
