import { Link } from "react-router-dom";
import { Badge, type BadgeTone } from "@/components/Badge";
import { elapsedLabel } from "@/components/pdv/dates";
import { mesaStatusLabel } from "@/components/pdv/labels";
import type { MesaMapa, MesaStatus } from "@/components/pdv/types";
import { formatMoney } from "@/lib/money";

/** O status vem sempre escrito no selo: a cor reforça, nunca é a única pista. */
export const MESA_TONE: Record<MesaStatus, BadgeTone> = {
  livre: "success",
  ocupada: "info",
  aguardando_pagamento: "warning",
  reservada: "neutral",
  bloqueada: "neutral",
};

// livre e indisponível: fundo cinza-claro, sem destaque; com comanda: cartão branco com borda mais firme
const base = "flex min-h-[9.4rem] w-full flex-col gap-2 rounded-xl border px-4 py-3.5 text-left transition-colors";
const interactive = "hover:border-control-line motion-reduce:transition-none";

function cardStyle(mesa: MesaMapa): string {
  if (mesa.comanda) return "border-line-strong bg-surface";
  if (mesa.status === "reservada") return "border-dashed border-line-strong bg-surface-2";
  return "border-line bg-surface-2";
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
  const c = mesa.comanda;

  const body = (
    <>
      <span className="text-[1.0625rem] font-bold text-fg">{mesa.nome}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={MESA_TONE[mesa.status]}>{mesaStatusLabel(mesa.status)}</Badge>
        {mesa.capacidade ? <span className="text-xs text-muted">{mesa.capacidade} lugares</span> : null}
      </span>

      {c ? (
        <span className="mt-auto flex flex-col gap-0.5">
          <span className="text-xl font-bold text-fg">{formatMoney(c.total_parcial)}</span>
          <span className="text-xs text-muted">
            Comanda #{c.id} · {c.itens_ativos} {c.itens_ativos === 1 ? "item" : "itens"}
            {c.num_pessoas ? ` · ${c.num_pessoas} pessoas` : ""}
          </span>
          <span className="text-xs text-muted">aberta há {elapsedLabel(c.aberta_em, now)}</span>
          {c.nome_cliente && <span className="truncate text-xs text-muted">{c.nome_cliente}</span>}
        </span>
      ) : mesa.status === "livre" || mesa.status === "reservada" ? (
        <span className="mt-auto text-[0.8125rem] text-muted">{canOpen ? "Toque para abrir comanda" : "Sem comanda"}</span>
      ) : (
        <span className="mt-auto text-[0.8125rem] text-muted">Indisponível</span>
      )}
    </>
  );

  if (c && canView) {
    return (
      <Link to={`/comandas/${c.id}`} className={`${base} ${cardStyle(mesa)} ${interactive}`}>
        {body}
      </Link>
    );
  }
  if (!c && canOpen && (mesa.status === "livre" || mesa.status === "reservada")) {
    return (
      <button type="button" onClick={() => onOpen(mesa)} className={`${base} ${cardStyle(mesa)} ${interactive}`}>
        {body}
      </button>
    );
  }
  return (
    <div role="group" aria-label={`${mesa.nome}, ${mesaStatusLabel(mesa.status)}`} className={`${base} ${cardStyle(mesa)} ${mesa.status === "bloqueada" ? "opacity-80" : ""}`}>
      {body}
    </div>
  );
}
