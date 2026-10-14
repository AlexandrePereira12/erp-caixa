import { chartMax, barPercent } from "../chartMath";

export interface BarItem {
  key: string | number;
  label: string;
  /** Valor decimal em texto, só para o tamanho da barra. */
  value: string;
  /** O mesmo valor já formatado (formatMoney, formatDecimal...). */
  valueText: string;
}

export interface BarListProps {
  items: BarItem[];
  /**
   * Resumo lido por leitores de tela no lugar do desenho. A mesma informação precisa estar numa
   * tabela ao lado: o gráfico é decorativo para quem não enxerga.
   */
  ariaLabel: string;
  className?: string;
}

/** Barras horizontais, uma por item, na ordem recebida; a maior ocupa toda a largura. */
export function BarList({ items, ariaLabel, className = "" }: BarListProps) {
  const max = chartMax(items.map((item) => item.value));
  return (
    <div role="img" aria-label={ariaLabel} className={`space-y-3 ${className}`}>
      {items.map((item) => (
        <div key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-fg">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-fg">{item.valueText}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-surface-2">
            <div className="h-full rounded-[3px] bg-brand" style={{ width: `${barPercent(item.value, max)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface TopBarListProps {
  items: BarItem[];
  /** O que as barras medem, para o resumo lido por leitores de tela ("total por produto"). */
  subject: string;
  /** Quantas barras mostrar; a tabela ao lado traz todas as linhas. */
  limit?: number;
  /** Como o aviso chama as barras mostradas: "maiores" (ordenado por valor) ou "primeiros". */
  noun?: "maiores" | "primeiros";
}

/** `BarList` limitada às primeiras linhas, com o resumo "Maior: ..." e o aviso de que a tabela traz todas. */
export function TopBarList({ items, subject, limit = 10, noun = "maiores" }: TopBarListProps) {
  const bars = items.slice(0, limit);
  const first = bars[0];
  if (!first) return null;
  return (
    <>
      <BarList ariaLabel={`Gráfico de barras: ${subject}. Maior: ${first.label}, ${first.valueText}.`} items={bars} />
      {items.length > limit && (
        <p className="mt-3 text-xs text-muted">
          Gráfico com os {limit} {noun}; a tabela traz todos os {items.length}.
        </p>
      )}
    </>
  );
}
