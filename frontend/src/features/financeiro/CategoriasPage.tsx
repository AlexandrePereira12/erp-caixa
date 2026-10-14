import { useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { PlusIcon } from "@/components/icons";
import { SectionTabs, tabPanelProps } from "@/components/SectionTabs";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";
import { CategoriaFormDialog, TIPO_LABEL } from "./CategoriaFormDialog";
import { useCategoriaMutations, useCategorias, type CategoriaFinanceira, type CategoriaTipo } from "./categoriasApi";

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; categoria: CategoriaFinanceira } | null;

const TABS = [
  { id: "despesa", label: "Despesas" },
  { id: "receita", label: "Receitas" },
];

/** Categorias de despesa (contas a pagar) e de receita (contas a receber). */
export function CategoriasPage() {
  usePageTitle("Categorias financeiras");
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can("financeiro.categorias");
  const [tipo, setTipo] = useState<CategoriaTipo>("despesa");
  const categorias = useCategorias({ tipo });
  const mutations = useCategoriaMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(categoria: CategoriaFinanceira) {
    setBusyId(categoria.id);
    try {
      await mutations.update.mutateAsync({ id: categoria.id, body: { ativa: !categoria.ativa } });
      toast.success(`${categoria.nome} ${categoria.ativa ? "desativada" : "ativada"}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<CategoriaFinanceira>[] = [
    { key: "nome", header: "Nome", cell: (c) => <span className="font-medium text-fg">{c.nome}</span> },
    { key: "tipo", header: "Tipo", cell: (c) => <span>{TIPO_LABEL[c.tipo]}</span> },
    { key: "situacao", header: "Situação", cell: (c) => <Badge tone={c.ativa ? "success" : "warning"}>{c.ativa ? "Ativa" : "Inativa"}</Badge> },
  ];
  if (canManage) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" className="min-h-11" aria-label={`Editar ${c.nome}`} onClick={() => setDialog({ kind: "edit", categoria: c })}>
            Editar
          </Button>
          <Button variant="ghost" className="min-h-11" loading={busyId === c.id} aria-label={`${c.ativa ? "Desativar" : "Ativar"} ${c.nome}`} onClick={() => void toggle(c)}>
            {c.ativa ? "Desativar" : "Ativar"}
          </Button>
          <Button variant="ghost" className="min-h-11 text-danger-text" aria-label={`Excluir ${c.nome}`} onClick={() => setDialog({ kind: "delete", categoria: c })}>
            Excluir
          </Button>
        </div>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title="Categorias financeiras"
        description="Organizam o que entra e o que sai: despesas nas contas a pagar, receitas nas contas a receber."
        actions={
          canManage && (
            <Button variant="primary" className="min-h-11" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Nova categoria
            </Button>
          )
        }
      />
      <SectionTabs label="Tipo de categoria" prefix="categorias" tabs={TABS} active={tipo} onChange={(id) => setTipo(id === "receita" ? "receita" : "despesa")} />
      <Card className="mt-4">
        <div {...tabPanelProps("categorias", tipo)}>
          <DataTable
            caption={`Categorias de ${tipo === "despesa" ? "despesa" : "receita"}`}
            columns={columns}
            rows={categorias.data}
            getRowKey={(c) => c.id}
            isLoading={categorias.isLoading}
            isFetching={categorias.isFetching}
            error={categorias.error}
            onRetry={() => void categorias.refetch()}
            emptyTitle={tipo === "despesa" ? "Nenhuma categoria de despesa" : "Nenhuma categoria de receita"}
            emptyDescription="Cadastre categorias para classificar as contas."
          />
        </div>
      </Card>
      {dialog?.kind === "create" && <CategoriaFormDialog tipoInicial={tipo} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <CategoriaFormDialog categoria={dialog.categoria} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir categoria"
        description={
          dialog?.kind === "delete" ? (
            <>
              Excluir <strong>{dialog.categoria.nome}</strong>? Categorias com contas lançadas não podem ser excluídas: desative-as.
            </>
          ) : undefined
        }
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          try {
            await mutations.remove.mutateAsync(dialog.categoria.id);
            toast.success(`${dialog.categoria.nome} excluída.`);
          } catch (error) {
            throw error instanceof ApiError && error.codigo === "categoria_em_uso" ? new ApiError(error.status, error.codigo, `${error.message} Use “Desativar”.`) : error;
          }
        }}
      />
    </div>
  );
}
