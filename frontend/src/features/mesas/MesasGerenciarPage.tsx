import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { ArrowLeftIcon, PlusIcon } from "@/components/icons";
import { mesaStatusLabel } from "@/components/pdv/labels";
import type { Mesa } from "@/components/pdv/types";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import { usePageTitle } from "@/lib/usePageTitle";
import { useMesaMutations, useMesas } from "./api";
import { MesaFormDialog } from "./MesaFormDialog";

const TONE: Record<string, BadgeTone> = { livre: "success", ocupada: "brand", aguardando_pagamento: "warning", reservada: "neutral", bloqueada: "neutral" };

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; mesa: Mesa } | null;

/** Gestão de mesas: cadastro, edição, exclusão e reservar/bloquear/liberar (mesas.gerenciar). */
export function MesasGerenciarPage() {
  usePageTitle("Gerenciar mesas");
  const toast = useToast();
  const mesas = useMesas();
  const mutations = useMesaMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function transition(mesa: Mesa, action: "reserve" | "block" | "release", message: string) {
    setBusyId(mesa.id);
    try {
      await mutations[action].mutateAsync(mesa.id);
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Mesa>[] = [
    { key: "nome", header: "Mesa", cell: (m) => <span className="font-medium text-fg">{m.nome}</span> },
    { key: "capacidade", header: "Lugares", cell: (m) => <span className="tabular-nums">{m.capacidade ?? "—"}</span> },
    {
      key: "status",
      header: "Situação",
      cell: (m) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={TONE[m.status] ?? "neutral"}>{mesaStatusLabel(m.status)}</Badge>
          {!m.ativa && <Badge tone="warning">Inativa</Badge>}
        </div>
      ),
    },
    {
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (m) => {
        const loading = busyId === m.id;
        return (
          <div className="flex flex-wrap gap-1">
            {m.status === "livre" && (
              <Button variant="ghost" className="min-h-11" loading={loading} aria-label={`Reservar ${m.nome}`} onClick={() => void transition(m, "reserve", `${m.nome} reservada.`)}>
                Reservar
              </Button>
            )}
            {(m.status === "livre" || m.status === "reservada") && (
              <Button variant="ghost" className="min-h-11" loading={loading} aria-label={`Bloquear ${m.nome}`} onClick={() => void transition(m, "block", `${m.nome} bloqueada.`)}>
                Bloquear
              </Button>
            )}
            {(m.status === "reservada" || m.status === "bloqueada") && (
              <Button variant="ghost" className="min-h-11" loading={loading} aria-label={`Liberar ${m.nome}`} onClick={() => void transition(m, "release", `${m.nome} liberada.`)}>
                Liberar
              </Button>
            )}
            <Button variant="ghost" className="min-h-11" aria-label={`Editar ${m.nome}`} onClick={() => setDialog({ kind: "edit", mesa: m })}>
              Editar
            </Button>
            <Button variant="ghost" className="min-h-11 text-danger-text" aria-label={`Excluir ${m.nome}`} onClick={() => setDialog({ kind: "delete", mesa: m })}>
              Excluir
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Gerenciar mesas"
        description="Cadastre as mesas do salão e marque como reservada, bloqueada ou livre."
        actions={
          <>
            <Link to="/mesas" className={buttonClasses({ className: "min-h-11" })}>
              <ArrowLeftIcon width={16} height={16} />
              Voltar ao salão
            </Link>
            <Button variant="primary" className="min-h-11" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Nova mesa
            </Button>
          </>
        }
      />
      <Card>
        <DataTable
          caption="Mesas cadastradas"
          columns={columns}
          rows={mesas.data}
          getRowKey={(m) => m.id}
          isLoading={mesas.isLoading}
          isFetching={mesas.isFetching}
          error={mesas.error}
          onRetry={() => void mesas.refetch()}
          emptyTitle="Nenhuma mesa cadastrada"
          emptyDescription="Cadastre a primeira mesa para usar o mapa do salão."
        />
      </Card>

      {dialog?.kind === "create" && <MesaFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <MesaFormDialog mesa={dialog.mesa} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir mesa"
        description={dialog?.kind === "delete" ? <>Excluir <strong>{dialog.mesa.nome}</strong>? Mesas com comanda em andamento não podem ser excluídas.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await mutations.remove.mutateAsync(dialog.mesa.id);
          toast.success(`${dialog.mesa.nome} excluída.`);
        }}
      />
    </div>
  );
}
