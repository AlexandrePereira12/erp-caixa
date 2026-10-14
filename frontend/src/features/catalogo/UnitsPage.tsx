import { useState } from "react";
import { useUnitMutations, useUnits } from "./api";
import { CatalogNav } from "./CatalogNav";
import type { UnidadeOut } from "./types";
import { UnitFormDialog } from "./UnitFormDialog";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { PlusIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; unit: UnidadeOut } | null;

export function UnitsPage() {
  usePageTitle("Unidades de medida");
  const toast = useToast();
  const { can } = usePermissions();
  const units = useUnits();
  const { remove } = useUnitMutations();
  const [dialog, setDialog] = useState<Dialog>(null);

  const canEdit = can("catalogo.editar");
  const canDelete = can("catalogo.excluir");

  const columns: Column<UnidadeOut>[] = [
    { key: "sigla", header: "Sigla", cell: (u) => <span className="font-medium text-fg">{u.sigla}</span> },
    { key: "nome", header: "Nome", cell: (u) => u.nome },
    {
      key: "casas",
      header: "Casas decimais",
      cell: (u) => (u.casas_decimais === 0 ? "0 (somente inteiros)" : u.casas_decimais),
    },
  ];
  if (canEdit || canDelete) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {canEdit && (
            <Button variant="ghost" size="sm" aria-label={`Editar ${u.sigla}`} onClick={() => setDialog({ kind: "edit", unit: u })}>
              Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" aria-label={`Excluir ${u.sigla}`} className="text-danger-text" onClick={() => setDialog({ kind: "delete", unit: u })}>
              Excluir
            </Button>
          )}
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title="Unidades de medida"
        description="Definem as casas decimais aceitas nas quantidades de cada produto."
        actions={
          can("catalogo.criar") && (
            <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Nova unidade
            </Button>
          )
        }
      />
      <CatalogNav />
      <Card>
        <DataTable
          caption="Lista de unidades de medida"
          columns={columns}
          rows={units.data}
          getRowKey={(u) => u.id}
          isLoading={units.isLoading}
          isFetching={units.isFetching}
          error={units.error}
          onRetry={() => void units.refetch()}
          emptyTitle="Nenhuma unidade cadastrada"
          emptyDescription="Cadastre as unidades (UN, KG, L...) antes de criar produtos."
        />
      </Card>

      {dialog?.kind === "create" && <UnitFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <UnitFormDialog unit={dialog.unit} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir unidade"
        description={dialog?.kind === "delete" ? <>Excluir a unidade <strong>{dialog.unit.sigla}</strong> ({dialog.unit.nome})? Unidades em uso por produtos não podem ser excluídas.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await remove.mutateAsync(dialog.unit.id);
          toast.success(`Unidade ${dialog.unit.sigla} excluída.`);
        }}
      />
    </div>
  );
}
