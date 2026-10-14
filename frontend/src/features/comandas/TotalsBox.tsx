import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/pdv/icons";
import type { Comanda } from "@/components/pdv/types";
import { Spinner } from "@/components/Spinner";
import { compareDecimal } from "@/lib/decimal";
import { formatDecimal, formatMoney } from "@/lib/money";

export interface TotalsBoxProps {
  comanda: Comanda;
  /** Há alterações em voo: o total mostrado ainda é o anterior. */
  busy: boolean;
  /** Botões principais (pedir conta, fechar conta...). */
  actions?: ReactNode;
}

/**
 * Totais da comanda: TODOS vindos da API (subtotal, desconto, acréscimo, taxa de serviço, total).
 * No celular fica fixo no rodapé (resumo compacto + detalhes sob toque); no desktop é um cartão estático.
 */
export function TotalsBox({ comanda, busy, actions }: TotalsBoxProps) {
  const [open, setOpen] = useState(false);
  const t = comanda.totais;
  const lineClass = `${open ? "grid" : "hidden"} lg:grid grid-cols-[1fr_auto] gap-x-3 text-sm`;

  return (
    <section
      aria-label="Totais da comanda"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] lg:static lg:z-auto lg:rounded-xl lg:border lg:px-[1.125rem] lg:py-4 lg:shadow-none"
    >
      <div aria-live="polite" aria-atomic="true">
        <div className="flex min-h-11 items-center justify-between gap-3 lg:min-h-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted">
            Total
            {busy && (
              <span className="flex items-center gap-1 text-xs font-normal normal-case">
                <Spinner /> atualizando…
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className={`text-3xl font-bold tabular-nums text-fg ${busy ? "opacity-60" : ""}`}>{formatMoney(t.total)}</span>
            {/* Só no celular: no desktop os detalhes ficam sempre abertos e o botão nem existe. */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Ocultar detalhes dos totais" : "Ver detalhes dos totais"}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 lg:hidden"
            >
              <ChevronDownIcon className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
            </button>
          </span>
        </div>

        <dl className={`space-y-0.5 pb-1 ${open ? "mt-1 border-t border-dashed border-line-strong pt-2" : "lg:mt-1 lg:border-t lg:border-dashed lg:border-line-strong/50 lg:pt-2"}`}>
          <div className={lineClass}>
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(t.subtotal)}</dd>
          </div>
          <div className={lineClass}>
            <dt className="text-muted">Desconto</dt>
            <dd className="tabular-nums">{compareDecimal(t.desconto, "0") > 0 ? `− ${formatMoney(t.desconto)}` : formatMoney(t.desconto)}</dd>
          </div>
          <div className={lineClass}>
            <dt className="text-muted">Acréscimo</dt>
            <dd className="tabular-nums">{formatMoney(t.acrescimo)}</dd>
          </div>
          <div className={lineClass}>
            <dt className="text-muted">Taxa de serviço ({formatDecimal(comanda.taxa_servico_pct, { maximumFractionDigits: 2 })}%)</dt>
            <dd className="tabular-nums">{formatMoney(t.taxa_servico)}</dd>
          </div>
        </dl>
      </div>
      {actions && <div className="mt-1 flex flex-wrap gap-2 lg:mt-3">{actions}</div>}
    </section>
  );
}
