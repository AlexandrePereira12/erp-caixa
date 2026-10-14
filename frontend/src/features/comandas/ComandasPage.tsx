import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { dayStartIso, nextDayStartIso } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import { comandaLocal, comandaStatusLabel, comandaStatusTone, comandaTipoLabel } from "@/components/pdv/labels";
import type { ComandaResumo } from "@/components/pdv/types";
import { PAGE_SIZE, useSearchDraft, useUrlParams } from "@/components/pdv/useUrlParams";
import { useMesaMapa } from "@/features/mesas/api";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { AbrirComandaDialog } from "./AbrirComandaDialog";
import { useComandas, type ComandaStatus, type ComandaTipo } from "./api";

const STATUSES: ComandaStatus[] = ["aberta", "aguardando_pagamento", "fechada", "cancelada"];
const TIPOS: ComandaTipo[] = ["mesa", "balcao", "retirada", "delivery"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

/** Lista de comandas com filtros na URL (status, tipo, mesa, cliente, período e busca por nº/nome). */
export function ComandasPage() {
  usePageTitle("Comandas");
  const { can } = usePermissions();
  const { params, update, clear, offset } = useUrlParams();
  const [creating, setCreating] = useState(false);

  const q = params.get("q") ?? "";
  const status = oneOf(params.get("status"), STATUSES);
  const tipo = oneOf(params.get("tipo"), TIPOS);
  const mesaId = positiveIntParam(params.get("mesa"));
  const clienteId = positiveIntParam(params.get("cliente"));
  const clienteNome = params.get("clienteNome") ?? "";
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  const [draft, setDraft] = useSearchDraft(q, (value) => update({ q: value }));

  const canSeeMesas = can("mesas.listar");
  const mesas = useMesaMapa({ enabled: canSeeMesas });
  const list = useComandas({ status, tipo, mesaId, clienteId, de: dayStartIso(de), ate: nextDayStartIso(ate), q, deslocamento: offset });
  const data = list.data;

  const cliente: ClientValue | null = clienteId ? { id: clienteId, nome: clienteNome || `Cliente #${clienteId}` } : null;
  const hasFilters = Boolean(q || status || tipo || mesaId || clienteId || de || ate);

  const columns: Column<ComandaResumo>[] = [
    {
      key: "numero",
      header: "Comanda",
      cell: (c) => (
        <Link to={`/comandas/${c.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
          #{c.id}
        </Link>
      ),
    },
    {
      key: "local",
      header: "Local",
      cell: (c) => (
        <span>
          {comandaLocal(c)}
          {c.tipo === "mesa" && <span className="text-muted"> · {comandaTipoLabel(c.tipo)}</span>}
        </span>
      ),
    },
    { key: "cliente", header: "Cliente", cell: (c) => <span>{c.cliente?.nome ?? c.nome_cliente ?? <span className="text-muted">—</span>}</span> },
    { key: "status", header: "Situação", cell: (c) => <Badge tone={comandaStatusTone(c.status)}>{comandaStatusLabel(c.status)}</Badge> },
    { key: "aberta", header: "Abertura", cell: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(c.aberta_em)}</span> },
    { key: "itens", header: "Itens", cell: (c) => <span className="tabular-nums">{c.itens_ativos}</span> },
    { key: "total", header: "Total", cell: (c) => <span className="font-medium tabular-nums">{formatMoney(c.total)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
  ];

  return (
    <div>
      <PageHeader
        title="Comandas"
        description="Consulte e abra comandas de mesa, balcão, retirada e delivery."
        actions={
          can("comandas.abrir") && (
            <Button variant="primary" className="min-h-11" onClick={() => setCreating(true)}>
              <PlusIcon width={16} height={16} />
              Nova comanda
            </Button>
          )
        }
      />
      <Card>
        <form role="search" aria-label="Filtrar comandas" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Buscar" hint="Número ou nome na comanda">
            <Input type="search" className="min-h-11" placeholder="Ex.: 42 ou Maria" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </FormField>
          <FormField label="Situação">
            <Select className="min-h-11" value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
              <option value="">Todas</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {comandaStatusLabel(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tipo">
            <Select className="min-h-11" value={tipo ?? ""} onChange={(e) => update({ tipo: e.target.value || undefined })}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {comandaTipoLabel(t)}
                </option>
              ))}
            </Select>
          </FormField>
          {canSeeMesas && (
            <FormField label="Mesa">
              <Select className="min-h-11" value={mesaId ?? ""} onChange={(e) => update({ mesa: e.target.value || undefined })}>
                <option value="">Todas</option>
                {mesas.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="De">
            <Input type="date" className="min-h-11" value={de} max={ate || undefined} onChange={(e) => update({ de: e.target.value || undefined })} />
          </FormField>
          <FormField label="Até">
            <Input type="date" className="min-h-11" value={ate} min={de || undefined} onChange={(e) => update({ ate: e.target.value || undefined })} />
          </FormField>
          {can("pessoas.listar") && (
            <div className="sm:col-span-2">
              <ClientPicker
                label="Cliente"
                value={cliente}
                onChange={(p) => update({ cliente: p ? String(p.id) : undefined, clienteNome: p?.nome })}
              />
            </div>
          )}
          {hasFilters && (
            <div className="flex items-end">
              <Button
                className="min-h-11"
                onClick={() => {
                  setDraft("");
                  clear();
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </form>

        <DataTable
          caption="Lista de comandas"
          columns={columns}
          rows={data?.itens}
          getRowKey={(c) => c.id}
          isLoading={list.isLoading}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyTitle={hasFilters ? "Nenhuma comanda encontrada" : "Nenhuma comanda ainda"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "As comandas abertas no salão e no balcão aparecem aqui."}
        />
        {data && !list.error && (
          <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={list.isFetching} onChange={(o) => update({ pagina: String(o / PAGE_SIZE + 1) })} />
        )}
      </Card>

      {creating && <AbrirComandaDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
