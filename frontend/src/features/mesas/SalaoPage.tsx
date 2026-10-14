import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { PlusIcon } from "@/components/icons";
import { RefreshIcon } from "@/components/pdv/icons";
import { mesaStatusLabel } from "@/components/pdv/labels";
import type { MesaMapa, MesaStatus } from "@/components/pdv/types";
import { useNow } from "@/components/pdv/useNow";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { AbrirComandaDialog } from "@/features/comandas/AbrirComandaDialog";
import type { ComandaTipo } from "@/features/comandas/api";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";
import { MAPA_REFRESH_MS, useMesaMapa } from "./api";
import { MesaCard } from "./MesaCard";

const ORDER: MesaStatus[] = ["livre", "ocupada", "aguardando_pagamento", "reservada", "bloqueada"];
const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" });

/** Amostra de cor da legenda: a mesma linguagem visual dos cartões. */
const LEGEND: Record<MesaStatus, string> = {
  livre: "bg-success-text",
  ocupada: "bg-info-text",
  aguardando_pagamento: "bg-warning-text",
  reservada: "border-[1.5px] border-dashed border-control-line",
  bloqueada: "border-[1.5px] border-dashed border-control-line",
};

type Opening = { tipo: ComandaTipo; mesaId?: number } | null;

/** Mapa do salão: uma mesa por cartão, com atualização automática (15 s e ao voltar para a aba). */
export function SalaoPage() {
  usePageTitle("Salão");
  const { can } = usePermissions();
  const now = useNow();
  const mapa = useMesaMapa();
  const [opening, setOpening] = useState<Opening>(null);
  const canOpen = can("comandas.abrir");
  const mesas = mapa.data;

  const counts = ORDER.map((status) => ({ status, total: mesas?.filter((m) => m.status === status).length ?? 0 }));

  return (
    <div>
      <PageHeader
        title="Salão"
        description="Toque numa mesa livre para abrir uma comanda ou numa mesa ocupada para continuar o atendimento."
        actions={
          <>
            {canOpen &&
              (["balcao", "retirada", "delivery"] as const).map((tipo) => (
                <Button key={tipo} className="min-h-11" onClick={() => setOpening({ tipo })}>
                  <PlusIcon width={16} height={16} />
                  {tipo === "balcao" ? "Balcão" : tipo === "retirada" ? "Retirada" : "Delivery"}
                </Button>
              ))}
            {can("mesas.gerenciar") && (
              <Link to="/mesas/gerenciar" className={buttonClasses({ className: "min-h-11" })}>
                Gerenciar mesas
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Resumo por situação" className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8125rem]">
          {counts.map(({ status, total }) => (
            <li key={status} className="flex items-center gap-2 text-fg">
              <span aria-hidden="true" className={`h-3 w-3 rounded-[3px] ${LEGEND[status]}`} />
              {mesaStatusLabel(status)}: <strong className="tabular-nums">{total}</strong>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
          {mapa.isError && mesas && <span className="text-danger-text">Falha ao atualizar; mostrando dados antigos.</span>}
          {mapa.dataUpdatedAt > 0 && <span>Atualizado às {time.format(mapa.dataUpdatedAt)}</span>}
          <Button size="sm" className="min-h-11 min-w-11 px-0!" aria-label="Atualizar mapa agora" loading={mapa.isFetching} onClick={() => void mapa.refetch()}>
            {!mapa.isFetching && <RefreshIcon width={16} height={16} />}
          </Button>
        </div>
      </div>
      <p className="sr-only">O mapa é atualizado automaticamente a cada {MAPA_REFRESH_MS / 1000} segundos.</p>

      {mapa.isLoading ? (
        <LoadingBlock label="Carregando mesas…" />
      ) : mapa.error && !mesas ? (
        <ErrorState error={mapa.error} onRetry={() => void mapa.refetch()} />
      ) : mesas && mesas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma mesa cadastrada"
            description={can("mesas.gerenciar") ? "Cadastre as mesas para usar o mapa do salão." : "Peça a um gerente para cadastrar as mesas."}
            {...(can("mesas.gerenciar")
              ? {
                  action: (
                    <Link to="/mesas/gerenciar" className={buttonClasses({ variant: "primary", className: "min-h-11" })}>
                      Cadastrar mesas
                    </Link>
                  ),
                }
              : {})}
          />
        </Card>
      ) : (
        <ul aria-label="Mesas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mesas?.map((mesa: MesaMapa) => (
            <li key={mesa.id} className="flex">
              <MesaCard mesa={mesa} now={now} canOpen={canOpen} canView={can("comandas.listar")} onOpen={(m) => setOpening({ tipo: "mesa", mesaId: m.id })} />
            </li>
          ))}
        </ul>
      )}

      {opening && <AbrirComandaDialog initialTipo={opening.tipo} {...(opening.mesaId ? { initialMesaId: opening.mesaId } : {})} onClose={() => setOpening(null)} />}
    </div>
  );
}
