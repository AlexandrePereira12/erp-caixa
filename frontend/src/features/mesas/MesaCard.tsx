import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, LockIcon } from "@/components/icons";
import { CalendarIcon, ClockIcon, ReceiptIcon, UserIcon, UtensilsIcon } from "@/components/pdv/icons";
import { elapsedLabel } from "@/components/pdv/dates";
import { mesaStatusLabel } from "@/components/pdv/labels";
import type { MesaMapa, MesaStatus } from "@/components/pdv/types";
import { formatMoney } from "@/lib/money";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Cor + ícone + texto por status: o status nunca depende só da cor. */
const STATUS_STYLE: Record<MesaStatus, { icon: Icon; card: string; label: string }> = {
  // livre: papel limpo; ocupada: terracota; conta pedida: amarelo-gema; reservada: tracejada; bloqueada: hachurada
  livre: { icon: CheckIcon, card: "border-line bg-surface hover:border-success-text/60", label: "text-success-text" },
  ocupada: { icon: UtensilsIcon, card: "border-terra/45 bg-terra-soft", label: "text-terra-text" },
  aguardando_pagamento: { icon: ReceiptIcon, card: "border-accent bg-warning-soft", label: "text-warning-text" },
  reservada: { icon: CalendarIcon, card: "border-dashed border-line-strong bg-surface", label: "text-fg" },
  bloqueada: { icon: LockIcon, card: "hatch border-line bg-surface-2", label: "text-muted" },
};

const base = "flex min-h-36 w-full flex-col gap-1 rounded-xl border-[1.5px] p-3.5 text-left shadow-sm transition-[transform,box-shadow,border-color]";
const interactive = "hover:-translate-y-0.5 hover:shadow-md focus-visible:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** Mesa vista de cima, com uma cadeira por lugar (2 a 8). Só enfeita: o número de lugares vem escrito ao lado. */
function MesaGlyph({ lugares, className }: { lugares: number | null; className: string }) {
  const total = Math.min(Math.max(lugares ?? 4, 2), 8);
  const top = total - Math.floor(total / 2);
  const chairs = (count: number, y: number) =>
    Array.from({ length: count }, (_, i) => <rect key={`${y}-${i}`} x={8 + (40 / count) * (i + 0.5) - 4} y={y} width="8" height="5" rx="2" fill="currentColor" opacity="0.55" />);
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 56 36" width="56" height="36" className={`shrink-0 ${className}`}>
      <rect x="8" y="11" width="40" height="14" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {chairs(top, 3)}
      {chairs(total - top, 28)}
    </svg>
  );
}

export interface MesaCardProps {
  mesa: MesaMapa;
  now: number;
  /** Pode abrir comanda numa mesa livre/reservada (comandas.abrir). */
  canOpen: boolean;
  /** Pode abrir a tela da comanda em andamento (comandas.listar). */
  canView: boolean;
  onOpen: (mesa: MesaMapa) => void;
}

export function MesaCard({ mesa, now, canOpen, canView, onOpen }: MesaCardProps) {
  const style = STATUS_STYLE[mesa.status];
  const Icon = style.icon;
  const c = mesa.comanda;

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-display text-[1.35rem] font-semibold leading-tight text-fg">{mesa.nome}</span>
        <MesaGlyph lugares={mesa.capacidade ?? null} className={style.label} />
      </span>
      <span className={`flex items-center gap-1.5 text-[0.8rem] font-bold ${style.label}`}>
        <Icon width={15} height={15} />
        {mesaStatusLabel(mesa.status)}
      </span>
      {mesa.capacidade ? <span className="text-xs text-muted">{mesa.capacidade} lugares</span> : null}

      {c ? (
        <span className="mt-auto flex flex-col gap-0.5 pt-2">
          <span className="font-display text-2xl font-semibold tabular-nums text-fg">{formatMoney(c.total_parcial)}</span>
          <span className="text-xs font-medium text-fg">
            Comanda #{c.id} · {c.itens_ativos} {c.itens_ativos === 1 ? "item" : "itens"}
            {c.num_pessoas ? ` · ${c.num_pessoas} pessoas` : ""}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <ClockIcon width={12} height={12} />
            aberta há {elapsedLabel(c.aberta_em, now)}
          </span>
          {c.nome_cliente && (
            <span className="flex items-center gap-1 truncate text-xs text-muted">
              <UserIcon width={12} height={12} />
              {c.nome_cliente}
            </span>
          )}
        </span>
      ) : mesa.status === "livre" || mesa.status === "reservada" ? (
        <span className="mt-auto pt-2 text-sm font-medium text-fg">{canOpen ? "Toque para abrir comanda" : "Sem comanda"}</span>
      ) : (
        <span className="mt-auto pt-2 text-sm text-muted">Indisponível</span>
      )}
    </>
  );

  if (c && canView) {
    return (
      <Link to={`/comandas/${c.id}`} className={`${base} ${style.card} ${interactive}`}>
        {body}
      </Link>
    );
  }
  if (!c && canOpen && (mesa.status === "livre" || mesa.status === "reservada")) {
    return (
      <button type="button" onClick={() => onOpen(mesa)} className={`${base} ${style.card} ${interactive}`}>
        {body}
      </button>
    );
  }
  return (
    <div role="group" aria-label={`${mesa.nome}, ${mesaStatusLabel(mesa.status)}`} className={`${base} ${style.card} ${mesa.status === "bloqueada" ? "opacity-80" : ""}`}>
      {body}
    </div>
  );
}
