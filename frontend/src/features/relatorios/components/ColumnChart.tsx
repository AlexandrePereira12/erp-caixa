import { compareDecimal } from "@/lib/decimal";
import { chartMax, barPercent } from "../chartMath";

export interface ColumnItem {
  key: string;
  /** Texto completo (dica ao passar o mouse). */
  label: string;
  /** Rótulo curto sob a coluna (ex.: o dia do mês). */
  shortLabel: string;
  /** Valor decimal em texto, só para a altura da coluna. */
  value: string;
  /** O mesmo valor já formatado. */
  valueText: string;
}

export interface ColumnChartProps {
  items: ColumnItem[];
  /** Resumo lido por leitores de tela; os números completos ficam numa tabela. */
  ariaLabel: string;
  className?: string;
}

/** Cada coluna ocupa 0,5 rem no mínimo; períodos longos rolam dentro do gráfico, nunca a página. */
const MIN_COLUMN_REM = 0.5;

/** Colunas ao longo do tempo (ex.: um dia por coluna). Rótulos só em algumas colunas quando são muitas. */
export function ColumnChart({ items, ariaLabel, className = "" }: ColumnChartProps) {
  const max = chartMax(items.map((item) => item.value));
  const top = items.find((item) => compareDecimal(item.value, max) === 0);
  const step = items.length <= 12 ? 1 : Math.floor((items.length + 7) / 8);
  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      {top && <p className="mb-2 text-xs text-muted">Maior valor: {top.valueText}</p>}
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${items.length * MIN_COLUMN_REM}rem` }}>
          <div className="flex h-40 items-end gap-px border-b border-line-strong/60">
            {items.map((item) => (
              <div key={item.key} title={`${item.label}: ${item.valueText}`} className="flex h-full min-w-0 flex-1 items-end">
                <div className="w-full rounded-t-xs bg-brand" style={{ height: `${barPercent(item.value, max)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-px pt-1 text-[0.7rem] leading-none text-muted">
            {items.map((item, index) => (
              <span key={item.key} className="flex min-w-0 flex-1 justify-center whitespace-nowrap tabular-nums">
                {index % step === 0 ? item.shortLabel : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
