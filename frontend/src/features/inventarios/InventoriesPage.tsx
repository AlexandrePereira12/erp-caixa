import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INVENTORY_PAGE_SIZE, useInventories } from "./api";
import { InventoryOpenDialog } from "./InventoryOpenDialog";
import { ProgressBar } from "./ProgressBar";
import { INVENTORY_STATUSES, statusLabel, type InventarioResumoOut, type InventoryStatus } from "./types";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";
import { parsePage, useListParams } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

const STATUS_TONES: Record<string, BadgeTone> = { aberto: "brand", fechado: "success", cancelado: "neutral" };

function parseStatus(value: string | null): InventoryStatus | undefined {
  return INVENTORY_STATUSES.find((status) => status === value);
}

export function InventoriesPage() {
  usePageTitle("Inventários");
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();
  const status = parseStatus(params.get("status"));
  const deslocamento = (parsePage(params.get("pagina")) - 1) * INVENTORY_PAGE_SIZE;
  const inventories = useInventories({ status, deslocamento });
  const [opening, setOpening] = useState(false);

  const data = inventories.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      update({ pagina: String(Math.ceil(data.total / INVENTORY_PAGE_SIZE)) });
    }
  }, [data, update]);

  const columns: Column<InventarioResumoOut>[] = [
    {
      key: "inventario",
      header: "Inventário",
      cell: (i) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">{i.descricao}</p>
          <p className="text-xs text-muted">#{i.id}</p>
        </div>
      ),
    },
    { key: "status", label: "Status", header: "Status", cell: (i) => <Badge tone={STATUS_TONES[i.status] ?? "neutral"}>{statusLabel(i.status)}</Badge> },
    { key: "aberto", label: "Aberto em", header: "Aberto em", cell: (i) => <span className="whitespace-nowrap">{formatDateTime(i.created_at)}</span> },
    { key: "fechado", label: "Fechado em", header: "Fechado em", cell: (i) => <span className="whitespace-nowrap">{formatDateTime(i.fechado_em)}</span> },
    { key: "progresso", label: "Progresso", header: "Progresso", cell: (i) => <ProgressBar counted={i.itens_contados} total={i.total_itens} label={`Progresso do inventário ${i.descricao}`} /> },
    {
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (i) => (
        <Link to={`/inventarios/${i.id}`} aria-label={`${i.status === "aberto" ? "Contar" : "Ver"} inventário ${i.descricao}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          {i.status === "aberto" ? "Contar" : "Ver"}
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventários"
        description="Contagens físicas de estoque."
        actions={
          can("inventarios.criar") && (
            <Button variant="primary" onClick={() => setOpening(true)}>
              <PlusIcon width={16} height={16} />
              Novo inventário
            </Button>
          )
        }
      />
      <Card>
        <form role="search" aria-label="Filtrar inventários" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormField label="Status">
            <Select value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
              <option value="">Todos</option>
              {INVENTORY_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              ))}
            </Select>
          </FormField>
          {status && <Button onClick={() => reset()}>Limpar filtros</Button>}
        </form>
        <DataTable
          caption="Lista de inventários"
          columns={columns}
          rows={data?.itens}
          getRowKey={(i) => i.id}
          isLoading={inventories.isLoading}
          isFetching={inventories.isFetching}
          error={inventories.error}
          onRetry={() => void inventories.refetch()}
          emptyTitle={status ? "Nenhum inventário encontrado" : "Nenhum inventário aberto até agora"}
          emptyDescription={status ? "Ajuste ou limpe o filtro para ver mais resultados." : undefined}
        />
        {data && !inventories.error && (
          <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={inventories.isFetching} onChange={(offset) => update({ pagina: String(offset / INVENTORY_PAGE_SIZE + 1) })} />
        )}
      </Card>
      {opening && <InventoryOpenDialog onClose={() => setOpening(false)} />}
    </div>
  );
}
