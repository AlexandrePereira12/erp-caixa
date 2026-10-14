import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { formatDay } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import { tituloStatusLabel, tituloStatusTone } from "@/components/pdv/labels";
import type { Titulo } from "@/components/pdv/types";
import { PAGE_SIZE, useUrlParams } from "@/components/pdv/useUrlParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useTitulos, type TituloStatus } from "./api";

type StatusParam = TituloStatus | "todos";
const STATUSES: StatusParam[] = ["aberto", "pago", "cancelado", "todos"];

function parseStatus(value: string | null): StatusParam {
  return STATUSES.find((s) => s === value) ?? "aberto";
}

/** Contas a receber (fiado): por padrão as abertas; filtros por situação e cliente na URL. */
export function ContasPage() {
  usePageTitle("Contas a receber");
  const { can } = usePermissions();
  const { params, update, clear, offset } = useUrlParams();
  const status = parseStatus(params.get("situacao"));
  const clienteId = positiveIntParam(params.get("cliente"));
  const clienteNome = params.get("clienteNome") ?? "";
  const list = useTitulos({ status: status === "todos" ? undefined : status, pessoaId: clienteId, deslocamento: offset });
  const data = list.data;
  const cliente: ClientValue | null = clienteId ? { id: clienteId, nome: clienteNome || `Cliente #${clienteId}` } : null;
  const hasFilters = status !== "aberto" || clienteId !== undefined;

  const columns: Column<Titulo>[] = [
    {
      key: "numero",
      header: "Conta",
      cell: (t) => (
        <Link to={`/contas-receber/${t.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
          #{t.id}
        </Link>
      ),
    },
    { key: "cliente", header: "Cliente", cell: (t) => <span className="font-medium text-fg">{t.pessoa.nome}</span> },
    { key: "descricao", header: "Descrição", cell: (t) => <span className="text-muted">{t.descricao}</span> },
    { key: "vencimento", header: "Vencimento", cell: (t) => <span className="whitespace-nowrap">{formatDay(t.vencimento)}</span> },
    { key: "original", header: "Original", cell: (t) => <span className="tabular-nums">{formatMoney(t.valor_original)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
    { key: "pago", header: "Pago", cell: (t) => <span className="tabular-nums">{formatMoney(t.valor_pago)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
    { key: "saldo", header: "Saldo", cell: (t) => <span className="font-semibold tabular-nums">{formatMoney(t.saldo)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
    { key: "status", header: "Situação", cell: (t) => <Badge tone={tituloStatusTone(t.status)}>{tituloStatusLabel(t.status)}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Contas a receber" description="Vendas em fiado e recebimentos." />
      <Card>
        <form role="search" aria-label="Filtrar contas" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
          <FormField label="Situação">
            <Select className="min-h-11" value={status} onChange={(e) => update({ situacao: e.target.value === "aberto" ? undefined : e.target.value })}>
              <option value="aberto">Abertas</option>
              <option value="pago">Pagas</option>
              <option value="cancelado">Canceladas</option>
              <option value="todos">Todas</option>
            </Select>
          </FormField>
          {can("pessoas.listar") && <ClientPicker label="Cliente" value={cliente} onChange={(p) => update({ cliente: p ? String(p.id) : undefined, clienteNome: p?.nome })} />}
          {hasFilters && (
            <div>
              <Button className="min-h-11" onClick={clear}>
                Limpar filtros
              </Button>
            </div>
          )}
        </form>
        <DataTable
          caption="Contas a receber"
          columns={columns}
          rows={data?.itens}
          getRowKey={(t) => t.id}
          isLoading={list.isLoading}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyTitle={hasFilters ? "Nenhuma conta encontrada" : "Nenhuma conta em aberto"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "As vendas em fiado aparecem aqui."}
        />
        {data && !list.error && <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={list.isFetching} onChange={(o) => update({ pagina: String(o / PAGE_SIZE + 1) })} />}
      </Card>
    </div>
  );
}
