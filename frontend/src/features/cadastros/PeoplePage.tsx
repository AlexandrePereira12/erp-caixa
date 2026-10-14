import { useEffect, useState } from "react";
import { PEOPLE_PAGE_SIZE, usePersonMutations, usePeople, type PersonFilters } from "./api";
import { formatDocument } from "./masks";
import { PersonFormDialog } from "./PersonFormDialog";
import { QuickPersonDialog } from "./QuickPersonDialog";
import { PERSON_ROLES, PERSON_TYPE_LABELS, roleLabel, type PapelPessoa, type PessoaOut } from "./types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/components/Toast";
import { parseBoolParam, parsePage, useListParams, useSearchDraft } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";

type Dialog = { kind: "create" | "quick" } | { kind: "edit" | "delete"; person: PessoaOut } | null;

function parsePapel(value: string | null): PapelPessoa | undefined {
  return PERSON_ROLES.find((role) => role === value);
}

export function PeoplePage() {
  usePageTitle("Pessoas");
  const toast = useToast();
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();

  const q = params.get("q") ?? "";
  const filters: PersonFilters = {
    q,
    papel: parsePapel(params.get("papel")),
    ativo: parseBoolParam(params.get("ativo")),
    deslocamento: (parsePage(params.get("pagina")) - 1) * PEOPLE_PAGE_SIZE,
  };
  const hasFilters = Boolean(q || filters.papel || filters.ativo !== undefined);

  const [searchDraft, setSearchDraft] = useSearchDraft(q, (value) => update({ q: value }));
  const people = usePeople(filters);
  const { remove } = usePersonMutations();
  const [dialog, setDialog] = useState<Dialog>(null);

  // Depois de excluir o último item de uma página, volta para a última página existente.
  const data = people.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      update({ pagina: String(Math.ceil(data.total / PEOPLE_PAGE_SIZE)) });
    }
  }, [data, update]);

  const canEdit = can("pessoas.editar");
  const canDelete = can("pessoas.excluir");

  const columns: Column<PessoaOut>[] = [
    {
      key: "pessoa",
      header: "Pessoa",
      cell: (p) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">{p.nome}</p>
          {p.nome_fantasia && <p className="text-xs text-muted">{p.nome_fantasia}</p>}
          <p className="text-xs text-muted">{PERSON_TYPE_LABELS[p.tipo === "J" ? "J" : "F"]}</p>
        </div>
      ),
    },
    { key: "documento", label: "Documento", header: "CPF/CNPJ", cell: (p) => <span className="whitespace-nowrap">{formatDocument(p.documento, p.tipo)}</span> },
    {
      key: "contato",
      label: "Contato",
      header: "Contato",
      cell: (p) => (
        <div className="min-w-36">
          <p>{p.telefone ?? p.whatsapp ?? <span className="text-muted">—</span>}</p>
          {p.email && <p className="break-all text-xs text-muted">{p.email}</p>}
        </div>
      ),
    },
    {
      key: "papeis",
      label: "Papéis",
      header: "Papéis",
      cell: (p) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {p.papeis.map((role) => (
            <Badge key={role}>{roleLabel(role)}</Badge>
          ))}
          {p.cliente?.aceita_fiado && <Badge tone="brand">Fiado</Badge>}
        </div>
      ),
    },
    { key: "situacao", label: "Situação", header: "Situação", cell: (p) => <Badge tone={p.ativo ? "success" : "neutral"}>{p.ativo ? "Ativo" : "Inativo"}</Badge> },
  ];
  if (canEdit || canDelete) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {canEdit && (
            <Button variant="ghost" size="sm" aria-label={`Editar ${p.nome}`} onClick={() => setDialog({ kind: "edit", person: p })}>
              Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" aria-label={`Excluir ${p.nome}`} className="text-danger-text" onClick={() => setDialog({ kind: "delete", person: p })}>
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
        title="Pessoas"
        description="Clientes, fornecedores e colaboradores."
        actions={
          <>
            {can("pessoas.cadastro_rapido") && (
              <Button onClick={() => setDialog({ kind: "quick" })}>
                <PlusIcon width={16} height={16} />
                Cadastro rápido
              </Button>
            )}
            {can("pessoas.criar") && (
              <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
                <PlusIcon width={16} height={16} />
                Nova pessoa
              </Button>
            )}
          </>
        }
      />

      <Card>
        <form role="search" aria-label="Filtrar pessoas" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          <FormField label="Buscar">
            <Input type="search" placeholder="Nome, e-mail, telefone ou início do CPF/CNPJ" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </FormField>
          <FormField label="Papel">
            <Select value={filters.papel ?? ""} onChange={(e) => update({ papel: e.target.value || undefined })}>
              <option value="">Todos</option>
              {PERSON_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Situação">
            <Select value={filters.ativo === undefined ? "" : String(filters.ativo)} onChange={(e) => update({ ativo: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </Select>
          </FormField>
          {hasFilters && (
            <Button
              onClick={() => {
                setSearchDraft("");
                reset();
              }}
            >
              Limpar filtros
            </Button>
          )}
        </form>

        <DataTable
          caption="Lista de pessoas"
          columns={columns}
          rows={data?.itens}
          getRowKey={(p) => p.id}
          isLoading={people.isLoading}
          isFetching={people.isFetching}
          error={people.error}
          onRetry={() => void people.refetch()}
          emptyTitle={hasFilters ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
        />
        {data && !people.error && (
          <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={people.isFetching} onChange={(offset) => update({ pagina: String(offset / PEOPLE_PAGE_SIZE + 1) })} />
        )}
      </Card>

      {dialog?.kind === "create" && <PersonFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <PersonFormDialog person={dialog.person} onClose={() => setDialog(null)} />}
      {dialog?.kind === "quick" && <QuickPersonDialog onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir pessoa"
        description={dialog?.kind === "delete" ? <>Excluir <strong>{dialog.person.nome}</strong>? Esta ação não pode ser desfeita.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await remove.mutateAsync(dialog.person.id);
          toast.success(`${dialog.person.nome} foi excluído.`);
        }}
      />
    </div>
  );
}
