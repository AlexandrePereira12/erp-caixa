import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { Card, PageHeader } from "@/components/Card";
import { Checkbox, Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import { dayStartIso, nextDayStartIso } from "@/components/pdv/dates";
import { Button } from "@/components/Button";
import { caixaStatusLabel, caixaStatusTone } from "@/components/pdv/labels";
import type { CaixaResumo } from "@/components/pdv/types";
import { PAGE_SIZE, useUrlParams } from "@/components/pdv/useUrlParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useCaixas } from "./api";

/** Histórico de caixas de todos os operadores (caixa.listar). */
export function CaixasPage() {
  usePageTitle("Histórico de caixas");
  const { me } = usePermissions();
  const { params, update, clear, offset } = useUrlParams();
  const status = params.get("status") === "aberto" ? "aberto" : params.get("status") === "fechado" ? "fechado" : undefined;
  const mine = params.get("meus") === "1";
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  const list = useCaixas({ status, operadorId: mine ? me?.id : undefined, de: dayStartIso(de), ate: nextDayStartIso(ate), deslocamento: offset });
  const data = list.data;
  const hasFilters = Boolean(status || mine || de || ate);

  const columns: Column<CaixaResumo>[] = [
    {
      key: "numero",
      header: "Caixa",
      cell: (c) => (
        <Link to={`/caixas/${c.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
          #{c.id}
        </Link>
      ),
    },
    { key: "operador", header: "Operador", cell: (c) => <span>{c.operador.nome}</span> },
    { key: "status", header: "Situação", cell: (c) => <Badge tone={caixaStatusTone(c.status)}>{caixaStatusLabel(c.status)}</Badge> },
    { key: "abertura", header: "Abertura", cell: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(c.aberto_em)}</span> },
    { key: "fechamento", header: "Fechamento", cell: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(c.fechado_em)}</span> },
    { key: "valor", header: "Valor inicial", cell: (c) => <span className="tabular-nums">{formatMoney(c.valor_abertura)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
  ];

  return (
    <div>
      <PageHeader title="Histórico de caixas" description="Caixas abertos e fechados, de todos os operadores." />
      <Card>
        <form role="search" aria-label="Filtrar caixas" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Situação">
            <Select className="min-h-11" value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="aberto">Abertos</option>
              <option value="fechado">Fechados</option>
            </Select>
          </FormField>
          <FormField label="De">
            <Input type="date" className="min-h-11" value={de} max={ate || undefined} onChange={(e) => update({ de: e.target.value || undefined })} />
          </FormField>
          <FormField label="Até">
            <Input type="date" className="min-h-11" value={ate} min={de || undefined} onChange={(e) => update({ ate: e.target.value || undefined })} />
          </FormField>
          <div className="flex flex-wrap items-end gap-3 pb-1">
            <Checkbox label="Só os meus caixas" checked={mine} onChange={(e) => update({ meus: e.target.checked ? "1" : undefined })} />
            {hasFilters && (
              <Button className="min-h-11" onClick={clear}>
                Limpar filtros
              </Button>
            )}
          </div>
        </form>
        <DataTable
          caption="Lista de caixas"
          columns={columns}
          rows={data?.itens}
          getRowKey={(c) => c.id}
          isLoading={list.isLoading}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyTitle={hasFilters ? "Nenhum caixa encontrado" : "Nenhum caixa ainda"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
        />
        {data && !list.error && <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={list.isFetching} onChange={(o) => update({ pagina: String(o / PAGE_SIZE + 1) })} />}
      </Card>
    </div>
  );
}
