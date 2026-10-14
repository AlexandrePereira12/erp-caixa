import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { PlusIcon } from "@/components/icons";
import { formaTipoLabel } from "@/components/pdv/labels";
import type { FormaPagamento } from "@/components/pdv/types";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";
import { useFormaMutations, useFormas } from "./api";
import { FormaFormDialog } from "./FormaFormDialog";

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; forma: FormaPagamento } | null;

/** Dinheiro e fiado têm comportamento próprio no sistema: não podem ser desativados nem excluídos. */
const isProtected = (f: FormaPagamento) => f.tipo === "dinheiro" || f.tipo === "fiado";

export function FormasPage() {
  usePageTitle("Formas de pagamento");
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can("formas_pagamento.gerenciar");
  const formas = useFormas();
  const mutations = useFormaMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(forma: FormaPagamento) {
    setBusyId(forma.id);
    try {
      await mutations.update.mutateAsync({ id: forma.id, body: { ativa: !forma.ativa } });
      toast.success(`${forma.nome} ${forma.ativa ? "desativada" : "ativada"}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<FormaPagamento>[] = [
    { key: "ordem", header: "Ordem", cell: (f) => <span className="tabular-nums text-muted">{f.ordem}</span> },
    { key: "nome", header: "Nome", cell: (f) => <span className="font-medium text-fg">{f.nome}</span> },
    { key: "tipo", header: "Tipo", cell: (f) => <span>{formaTipoLabel(f.tipo)}</span> },
    {
      key: "situacao",
      header: "Situação",
      cell: (f) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={f.ativa ? "success" : "warning"}>{f.ativa ? "Ativa" : "Inativa"}</Badge>
          {isProtected(f) && <Badge tone="brand">Protegida</Badge>}
        </div>
      ),
    },
  ];
  if (canManage) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (f) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" className="min-h-11" aria-label={`Editar ${f.nome}`} onClick={() => setDialog({ kind: "edit", forma: f })}>
            Editar
          </Button>
          {!isProtected(f) && (
            <>
              <Button variant="ghost" className="min-h-11" loading={busyId === f.id} aria-label={`${f.ativa ? "Desativar" : "Ativar"} ${f.nome}`} onClick={() => void toggle(f)}>
                {f.ativa ? "Desativar" : "Ativar"}
              </Button>
              <Button variant="ghost" className="min-h-11 text-danger-text" aria-label={`Excluir ${f.nome}`} onClick={() => setDialog({ kind: "delete", forma: f })}>
                Excluir
              </Button>
            </>
          )}
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title="Formas de pagamento"
        description="Como o restaurante recebe. Dinheiro e fiado são protegidos."
        actions={
          canManage && (
            <Button variant="primary" className="min-h-11" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Nova forma
            </Button>
          )
        }
      />
      <Card>
        <DataTable
          caption="Formas de pagamento"
          columns={columns}
          rows={formas.data}
          getRowKey={(f) => f.id}
          isLoading={formas.isLoading}
          isFetching={formas.isFetching}
          error={formas.error}
          onRetry={() => void formas.refetch()}
          emptyTitle="Nenhuma forma de pagamento"
          emptyDescription="Cadastre as formas aceitas para poder receber nas comandas."
        />
      </Card>
      {dialog?.kind === "create" && <FormaFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <FormaFormDialog forma={dialog.forma} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir forma de pagamento"
        description={
          dialog?.kind === "delete" ? (
            <>
              Excluir <strong>{dialog.forma.nome}</strong>? Formas já usadas em movimentos de caixa não podem ser excluídas: desative-as.
            </>
          ) : undefined
        }
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          try {
            await mutations.remove.mutateAsync(dialog.forma.id);
            toast.success(`${dialog.forma.nome} excluída.`);
          } catch (error) {
            throw error instanceof ApiError && error.codigo === "forma_em_uso" ? new ApiError(error.status, error.codigo, `${error.message} Use “Desativar”.`) : error;
          }
        }}
      />
    </div>
  );
}
