import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AUDIT_PAGE_SIZE, useAudit, useUserOptions, type AuditFilters } from "./api";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import type { AuditoriaOut } from "@/lib/api/types";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime, localInputToIso } from "@/lib/format";
import { moduleLabel } from "@/lib/labels";
import { usePageTitle } from "@/lib/usePageTitle";

type FilterKey = Exclude<keyof AuditFilters, "pagina">;
type FilterValues = Pick<AuditFilters, FilterKey>;
const PARAM_NAMES: Record<FilterKey, string> = {
  usuarioId: "usuario_id",
  acao: "acao",
  modulo: "modulo",
  recurso: "recurso",
  recursoId: "recurso_id",
  requestId: "request_id",
  de: "de",
  ate: "ate",
};
const FILTER_KEYS = Object.keys(PARAM_NAMES) as FilterKey[];

function readFilterValues(params: URLSearchParams): FilterValues {
  const values = {} as FilterValues;
  for (const key of FILTER_KEYS) values[key] = params.get(PARAM_NAMES[key]) ?? "";
  return values;
}

function readFilters(params: URLSearchParams): AuditFilters {
  return { ...readFilterValues(params), pagina: Math.max(1, Math.floor(Number(params.get("pagina"))) || 1) };
}

export function AuditPage() {
  usePageTitle("Auditoria");
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const applied = readFilters(params);

  const [draft, setDraft] = useState<FilterValues>(() => readFilterValues(params));
  // Voltar/avançar no navegador muda a URL sem passar pelo formulário: o rascunho acompanha a URL.
  const paramsKey = params.toString();
  const [syncedKey, setSyncedKey] = useState(paramsKey);
  if (syncedKey !== paramsKey) {
    setSyncedKey(paramsKey);
    setDraft(readFilterValues(params));
  }
  const [rangeError, setRangeError] = useState<string | null>(null);
  const set = (key: FilterKey) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const audit = useAudit(applied);
  const canListUsers = can("usuarios.listar");
  const userOptions = useUserOptions(canListUsers);
  // Select de usuários só se a lista cabe inteira (limite 200); senão cai para o ID numérico.
  const userSelectable = canListUsers && userOptions.data && userOptions.data.total <= userOptions.data.itens.length;

  function writeParams(filters: FilterValues, pagina: number) {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = filters[key].trim();
      if (value) next.set(PARAM_NAMES[key], value);
    }
    if (pagina > 1) next.set("pagina", String(pagina));
    setParams(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const de = localInputToIso(draft.de);
    const ate = localInputToIso(draft.ate);
    if (de && ate && de > ate) {
      setRangeError("A data inicial deve ser anterior à data final.");
      return;
    }
    setRangeError(null);
    writeParams(draft, 1);
  }

  function onClear() {
    const empty = readFilterValues(new URLSearchParams());
    setDraft(empty);
    setRangeError(null);
    setParams(new URLSearchParams());
  }

  const hasFilters = FILTER_KEYS.some((k) => applied[k]);
  const advancedOpen = Boolean(applied.recurso || applied.recursoId || applied.requestId);

  const columns: Column<AuditoriaOut>[] = [
    { key: "quando", header: "Data e hora", cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.ocorrido_em)}</span> },
    {
      key: "usuario",
      header: "Usuário",
      cell: (a) => (
        <div className="min-w-32">
          <p className="text-fg">{a.usuario_nome ?? "Sistema"}</p>
          {a.papel && <p className="text-xs text-muted">{a.papel}</p>}
        </div>
      ),
    },
    { key: "acao", header: "Ação", cell: (a) => <Badge tone="brand">{a.acao}</Badge> },
    {
      key: "recurso",
      header: "Módulo / recurso",
      cell: (a) => (
        <div className="min-w-32">
          <p className="text-fg">{moduleLabel(a.modulo)}</p>
          <p className="text-xs text-muted">
            {a.recurso}
            {a.recurso_id ? ` #${a.recurso_id}` : ""}
          </p>
        </div>
      ),
    },
    { key: "descricao", header: "Descrição", className: "min-w-56 max-w-md", cell: (a) => a.descricao },
    {
      key: "detalhes",
      header: <span className="sr-only">Detalhes</span>,
      cell: (a) => (
        <Link to={`/auditoria/${a.id}`} state={{ search: params.toString() ? `?${params.toString()}` : "" }} aria-label={`Ver detalhes do registro ${a.id}`} className="whitespace-nowrap rounded-md px-2 py-1 text-brand-text underline-offset-2 hover:underline">
          Ver detalhes
        </Link>
      ),
    },
  ];

  const data = audit.data;

  return (
    <div>
      <PageHeader title="Auditoria" description="Quem fez o quê, e quando. Os registros mais recentes aparecem primeiro." />

      <Card>
        <form role="search" aria-label="Filtrar auditoria" onSubmit={onSubmit} noValidate className="space-y-3 border-b border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Ação">
              <Input maxLength={40} placeholder="ex.: criar" value={draft.acao} onChange={(e) => set("acao")(e.target.value)} />
            </FormField>
            <FormField label="Módulo">
              <Input maxLength={40} placeholder="ex.: usuarios" value={draft.modulo} onChange={(e) => set("modulo")(e.target.value)} />
            </FormField>
            {userSelectable ? (
              <FormField label="Usuário">
                <Select value={draft.usuarioId} onChange={(e) => set("usuarioId")(e.target.value)}>
                  <option value="">Todos</option>
                  {userOptions.data?.itens.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="ID do usuário">
                <Input type="number" min={1} inputMode="numeric" value={draft.usuarioId} onChange={(e) => set("usuarioId")(e.target.value)} />
              </FormField>
            )}
            <div className="hidden lg:block" />
            <FormField label="De">
              <Input type="datetime-local" value={draft.de} onChange={(e) => set("de")(e.target.value)} />
            </FormField>
            <FormField label="Até" error={rangeError ?? undefined}>
              <Input type="datetime-local" value={draft.ate} onChange={(e) => set("ate")(e.target.value)} />
            </FormField>
          </div>

          <details open={advancedOpen} className="text-sm">
            <summary className="cursor-pointer rounded text-brand-text">Mais filtros</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FormField label="Recurso">
                <Input maxLength={60} value={draft.recurso} onChange={(e) => set("recurso")(e.target.value)} />
              </FormField>
              <FormField label="ID do recurso">
                <Input maxLength={60} value={draft.recursoId} onChange={(e) => set("recursoId")(e.target.value)} />
              </FormField>
              <FormField label="ID da requisição">
                <Input maxLength={64} value={draft.requestId} onChange={(e) => set("requestId")(e.target.value)} />
              </FormField>
            </div>
          </details>

          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Filtrar
            </Button>
            {hasFilters && <Button onClick={onClear}>Limpar filtros</Button>}
          </div>
        </form>

        <DataTable
          caption="Registros de auditoria"
          columns={columns}
          rows={data?.itens}
          getRowKey={(a) => a.id}
          isLoading={audit.isLoading}
          isFetching={audit.isFetching}
          error={audit.error}
          onRetry={() => void audit.refetch()}
          emptyTitle={hasFilters ? "Nenhum registro encontrado" : "Nenhum registro de auditoria"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
        />
        {data && !audit.error && (
          <Pagination total={data.total} limite={data.limite || AUDIT_PAGE_SIZE} deslocamento={data.deslocamento} disabled={audit.isFetching} onChange={(offset) => writeParams(applied, offset / AUDIT_PAGE_SIZE + 1)} />
        )}
      </Card>
    </div>
  );
}
