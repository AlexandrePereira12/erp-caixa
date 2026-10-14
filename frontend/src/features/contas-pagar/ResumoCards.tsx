import type { ReactNode } from "react";
import { AlertIcon } from "@/components/icons";
import { formatDay } from "@/components/pdv/dates";
import { ErrorState, LoadingBlock } from "@/components/States";
import { formatMoney } from "@/lib/money";
import { useResumoPagar } from "./api";
import { plural } from "./labels";

type Tone = "neutral" | "danger";

const CARD: Record<Tone, string> = {
  neutral: "border-line bg-surface",
  danger: "border-danger-text bg-danger-soft",
};
const VALUE: Record<Tone, string> = {
  neutral: "text-fg",
  danger: "text-danger-text",
};

function ResumoCard({ label, value, hint, tone = "neutral", attention = false }: { label: string; value: string; hint: ReactNode; tone?: Tone; attention?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-[1.125rem] py-4 ${CARD[tone]}`}>
      <dt className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
        {attention && <AlertIcon aria-hidden="true" width={16} height={16} className="shrink-0 text-danger-text" />}
        {label}
      </dt>
      <dd className={`mt-1.5 break-words text-2xl font-bold leading-[1.15] tracking-[-0.01em] tabular-nums ${VALUE[tone]}`}>{value}</dd>
      <dd className="mt-1.5 text-xs text-muted">{hint}</dd>
    </div>
  );
}

/** Quatro cartões do topo: o que está em aberto, vencido, a vencer em 7 dias e pago no mês. */
export function ResumoCards() {
  const query = useResumoPagar();
  if (query.isLoading) return <LoadingBlock label="Carregando o resumo…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar o resumo" />;

  const r = query.data;
  const atrasadas = r.vencido_qtd > 0;
  return (
    <section aria-label="Resumo das contas a pagar" className="mb-5">
      <dl className="grid grid-cols-1 gap-3 min-[30rem]:grid-cols-2 lg:grid-cols-4">
        <ResumoCard label="Em aberto" value={formatMoney(r.em_aberto)} hint={plural(r.em_aberto_qtd, "conta", "contas")} />
        <ResumoCard
          label="Vencido"
          value={formatMoney(r.vencido)}
          hint={atrasadas ? `${plural(r.vencido_qtd, "conta", "contas")} em atraso` : "Nenhuma conta em atraso"}
          tone={atrasadas ? "danger" : "neutral"}
          attention={atrasadas}
        />
        <ResumoCard label="A vencer em 7 dias" value={formatMoney(r.a_vencer_7_dias)} hint={plural(r.a_vencer_7_dias_qtd, "conta", "contas")} />
        <ResumoCard
          label="Pago no mês"
          value={formatMoney(r.pago_no_mes)}
          hint={`${plural(r.pago_no_mes_qtd, "pagamento", "pagamentos")} · ${formatDay(r.mes_de)} a ${formatDay(r.mes_ate)}`}
        />
      </dl>
      <p className="mt-2 text-xs text-muted">Posição em {formatDay(r.data_referencia)}.</p>
    </section>
  );
}
