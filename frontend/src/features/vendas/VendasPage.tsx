import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { dayStartIso, nextDayStartIso } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import type { VendaResumo } from "@/components/pdv/types";
import { PAGE_SIZE, useSearchDraft, useUrlParams } from "@/components/pdv/useUrlParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useVendas, type VendaStatus } from "./api";

const STATUS: Record<VendaStatus, string> = { todas: "Todas", validas: "Válidas", estornadas: "Estornadas" };

function parseStatus(value: string | null): VendaStatus {
  return value === "validas" || value === "estornadas" ? value : "todas";
}

/** Lista de vendas: período, situação (todas/válidas/estornadas), caixa e cliente, na URL. */
export function VendasPage() {
  usePageTitle("Vendas");
  const { can } = usePermissions();
  const { params, update, clear, offset } = useUrlParams();
  const status = parseStatus(params.get("situacao"));
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  const caixaParam = params.get("caixa") ?? "";
  const caixaId = positiveIntParam(caixaParam);
  const clienteId = positiveIntParam(params.get("cliente"));
  const clienteNome = params.get("clienteNome") ?? "";
  const [caixaDraft, setCaixaDraft] = useSearchDraft(caixaParam, (value) => update({ caixa: value }));

  const list = useVendas({ status, de: dayStartIso(de), ate: nextDayStartIso(ate), caixaId, clienteId, deslocamento: offset });
  const data = list.data;
  const cliente: ClientValue | null = clienteId ? { id: clienteId, nome: clienteNome || `Cliente #${clienteId}` } : null;
  const hasFilters = Boolean(status !== "todas" || de || ate || caixaParam || clienteId);

  const columns: Column<VendaResumo>[] = [
    {
      key: "numero",
      header: "Venda",
      cell: (v) => (
        <Link to={`/vendas/${v.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
          #{v.id}
        </Link>
      ),
    },
    { key: "data", header: "Data", cell: (v) => <span className="whitespace-nowrap text-muted">{formatDateTime(v.created_at)}</span> },
    { key: "cliente", header: "Cliente", cell: (v) => <span>{v.cliente?.nome ?? <span className="text-muted">—</span>}</span> },
    {
      key: "comanda",
      header: "Comanda",
      cell: (v) =>
        can("comandas.listar") ? (
          <Link to={`/comandas/${v.comanda_id}`} className="text-brand-text underline-offset-2 hover:underline">
            #{v.comanda_id}
          </Link>
        ) : (
          <span>#{v.comanda_id}</span>
        ),
    },
    { key: "caixa", header: "Caixa", cell: (v) => <span>#{v.caixa_id}</span> },
    {
      key: "status",
      header: "Situação",
      cell: (v) => (v.estornada ? <Badge tone="danger">Estornada</Badge> : <Badge tone="success">Válida</Badge>),
    },
    { key: "total", header: "Total", cell: (v) => <span className={`font-medium tabular-nums ${v.estornada ? "text-muted line-through" : ""}`}>{formatMoney(v.total)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
  ];

  return (
    <div>
      <PageHeader title="Vendas" description="Vendas registradas no fechamento das comandas." />
      <Card>
        <form role="search" aria-label="Filtrar vendas" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Situação">
            <Select className="min-h-11" value={status} onChange={(e) => update({ situacao: e.target.value === "todas" ? undefined : e.target.value })}>
              {Object.entries(STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="De">
            <Input type="date" className="min-h-11" value={de} max={ate || undefined} onChange={(e) => update({ de: e.target.value || undefined })} />
          </FormField>
          <FormField label="Até">
            <Input type="date" className="min-h-11" value={ate} min={de || undefined} onChange={(e) => update({ ate: e.target.value || undefined })} />
          </FormField>
          <FormField label="Caixa nº">
            <Input className="min-h-11" inputMode="numeric" placeholder="Ex.: 12" value={caixaDraft} onChange={(e) => setCaixaDraft(e.target.value)} />
          </FormField>
          {can("pessoas.listar") && (
            <div className="sm:col-span-2">
              <ClientPicker label="Cliente" value={cliente} onChange={(p) => update({ cliente: p ? String(p.id) : undefined, clienteNome: p?.nome })} />
            </div>
          )}
          {hasFilters && (
            <div className="flex items-end">
              <Button
                className="min-h-11"
                onClick={() => {
                  setCaixaDraft("");
                  clear();
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </form>
        <DataTable
          caption="Lista de vendas"
          columns={columns}
          rows={data?.itens}
          getRowKey={(v) => v.id}
          isLoading={list.isLoading}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyTitle={hasFilters ? "Nenhuma venda encontrada" : "Nenhuma venda ainda"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "As vendas aparecem aqui quando uma conta é fechada."}
        />
        {data && !list.error && <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={list.isFetching} onChange={(o) => update({ pagina: String(o / PAGE_SIZE + 1) })} />}
      </Card>
    </div>
  );
}
