import { useState } from "react";
import { useCategories, useCategoryMutations } from "./api";
import { CategoryFormDialog } from "./CategoryFormDialog";
import { CatalogNav } from "./CatalogNav";
import type { CategoriaOut } from "./types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { PlusIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; category: CategoriaOut } | null;

export function CategoriesPage() {
  usePageTitle("Categorias");
  const toast = useToast();
  const { can } = usePermissions();
  const categories = useCategories();
  const { remove } = useCategoryMutations();
  const [dialog, setDialog] = useState<Dialog>(null);

  const canEdit = can("catalogo.editar");
  const canDelete = can("catalogo.excluir");

  const columns: Column<CategoriaOut>[] = [
    { key: "nome", header: "Nome", cell: (c) => <span className="font-medium text-fg">{c.nome}</span> },
    { key: "descricao", header: "Descrição", cell: (c) => c.descricao ?? <span className="text-muted">—</span> },
    { key: "situacao", header: "Situação", cell: (c) => <Badge tone={c.ativo ? "success" : "neutral"}>{c.ativo ? "Ativa" : "Inativa"}</Badge> },
  ];
  if (canEdit || canDelete) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {canEdit && (
            <Button variant="ghost" size="sm" aria-label={`Editar ${c.nome}`} onClick={() => setDialog({ kind: "edit", category: c })}>
              Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" aria-label={`Excluir ${c.nome}`} className="text-danger-text" onClick={() => setDialog({ kind: "delete", category: c })}>
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
        title="Categorias"
        description="Agrupam os produtos do catálogo."
        actions={
          can("catalogo.criar") && (
            <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Nova categoria
            </Button>
          )
        }
      />
      <CatalogNav />
      <Card>
        <DataTable
          caption="Lista de categorias"
          columns={columns}
          rows={categories.data}
          getRowKey={(c) => c.id}
          isLoading={categories.isLoading}
          isFetching={categories.isFetching}
          error={categories.error}
          onRetry={() => void categories.refetch()}
          emptyTitle="Nenhuma categoria cadastrada"
        />
      </Card>

      {dialog?.kind === "create" && <CategoryFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <CategoryFormDialog category={dialog.category} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir categoria"
        description={dialog?.kind === "delete" ? <>Excluir a categoria <strong>{dialog.category.nome}</strong>? Categorias com produtos não podem ser excluídas.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await remove.mutateAsync(dialog.category.id);
          toast.success(`Categoria ${dialog.category.nome} excluída.`);
        }}
      />
    </div>
  );
}
