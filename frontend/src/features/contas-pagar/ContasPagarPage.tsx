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
import { formatDay } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import { PAGE_SIZE, useSearchDraft, useUrlParams } from "@/components/pdv/useUrlParams";
import { EmptyState } from "@/components/States";
import { useCategorias } from "@/features/financeiro/categoriasApi";
import { usePermissions } from "@/lib/auth/hooks";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useContasPagar, type TituloPagar } from "./api";
import { ContaFormDialog } from "./ContaFormDialog";
import { periodoError, validDay } from "./dates";
import { FornecedorPicker, type FornecedorValue } from "./FornecedorPicker";
import { HINT_CLASS, SITUACAO_LABEL, parseSituacaoFiltro, saldoVisivel, situacaoTone, vencimentoHint } from "./labels";
import { ResumoCards } from "./ResumoCards";
import { SituacaoFilter } from "./SituacaoFilter";

/** Contas a pagar: resumo de vencimentos e lista filtrável (situação, busca, fornecedor, categoria, vencimento), tudo na URL. */
export function ContasPagarPage() {
  usePageTitle("Contas a pagar");
  const { can } = usePermissions();
  const { params, update, clear, offset } = useUrlParams();
  const situacao = parseSituacaoFiltro(params.get("situacao"));
  const q = params.get("q") ?? "";
  const fornecedorId = positiveIntParam(params.get("fornecedor"));
  const fornecedorNome = params.get("fornecedorNome") ?? "";
  const categoriaId = positiveIntParam(params.get("categoria"));
  const de = validDay(params.get("de"));
  const ate = validDay(params.get("ate"));
  const periodoInvalido = periodoError(de, ate);
  const [creating, setCreating] = useState(false);
  const [searchDraft, setSearchDraft] = useSearchDraft(q, (value) => update({ q: value }));

  const categorias = useCategorias({ tipo: "despesa", enabled: can("financeiro.listar") });
  const list = useContasPagar({
    situacao,
    pessoaId: fornecedorId,
    categoriaId,
    vencimentoDe: de || undefined,
    vencimentoAte: ate || undefined,
    q: q || undefined,
    deslocamento: offset,
    enabled: periodoInvalido === undefined,
  });
  const data = list.data;
  const fornecedor: FornecedorValue | null = fornecedorId ? { id: fornecedorId, nome: fornecedorNome || `Fornecedor #${fornecedorId}` } : null;
  const hasFilters = Boolean(situacao !== "aberto" || q || fornecedorId || categoriaId || de || ate);

  const columns: Column<TituloPagar>[] = [
    {
      key: "vencimento",
      header: "Vencimento",
      cell: (t) => {
        const hint = vencimentoHint(t);
        return (
          <div>
            <p className="whitespace-nowrap font-medium text-fg">{formatDay(t.vencimento)}</p>
            {hint && <p className={`text-xs ${HINT_CLASS[hint.tone]}`}>{hint.text}</p>}
          </div>
        );
      },
    },
    {
      key: "descricao",
      header: "Descrição",
      cell: (t) => (
        <div className="min-w-40">
          <Link to={`/contas-pagar/${t.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline">
            {t.descricao}
          </Link>
          {t.documento && <p className="text-xs text-muted">Documento {t.documento}</p>}
        </div>
      ),
    },
    { key: "fornecedor", header: "Fornecedor", cell: (t) => (t.fornecedor ? <span className="text-fg">{t.fornecedor.nome}</span> : <span className="text-muted">—</span>) },
    { key: "categoria", header: "Categoria", cell: (t) => (t.categoria ? <span className="text-fg">{t.categoria.nome}</span> : <span className="text-muted">—</span>) },
    { key: "valor", header: "Valor", cell: (t) => <span className="tabular-nums">{formatMoney(t.valor_original)}</span>, className: "md:text-right", headerClassName: "md:text-right" },
    { key: "saldo", header: "Saldo", cell: (t) => <span className="font-semibold tabular-nums">{formatMoney(saldoVisivel(t))}</span>, className: "md:text-right", headerClassName: "md:text-right" },
    { key: "situacao", header: "Situação", cell: (t) => <Badge tone={situacaoTone(t)}>{SITUACAO_LABEL[t.situacao]}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description="Despesas, fornecedores e vencimentos."
        actions={
          can("contas_pagar.criar") && (
            <Button variant="primary" className="min-h-11" onClick={() => setCreating(true)}>
              <PlusIcon width={16} height={16} />
              Nova conta
            </Button>
          )
        }
      />
      <ResumoCards />
      <Card>
        <form role="search" aria-label="Filtrar contas a pagar" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SituacaoFilter value={situacao} onChange={(value) => update({ situacao: value === "aberto" ? undefined : value })} />
          <FormField label="Buscar" hint="Descrição, documento ou fornecedor." className="sm:col-span-2">
            <Input type="search" className="min-h-11" autoComplete="off" maxLength={100} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </FormField>
          {can("financeiro.listar") && (
            <FormField label="Categoria" className="sm:col-span-2">
              <Select className="min-h-11" value={categoriaId ? String(categoriaId) : ""} onChange={(e) => update({ categoria: e.target.value || undefined })}>
                <option value="">Todas</option>
                {(categorias.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ativa ? c.nome : `${c.nome} (inativa)`}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {can("pessoas.listar") && (
            <div className="sm:col-span-2">
              <FornecedorPicker label="Fornecedor" value={fornecedor} onChange={(p) => update({ fornecedor: p ? String(p.id) : undefined, fornecedorNome: p?.nome })} />
            </div>
          )}
          <FormField label="Vencimento de">
            <Input type="date" className="min-h-11" value={de} max={ate || undefined} onChange={(e) => update({ de: e.target.value || undefined })} />
          </FormField>
          <FormField label="Vencimento até" error={periodoInvalido}>
            <Input type="date" className="min-h-11" value={ate} min={de || undefined} onChange={(e) => update({ ate: e.target.value || undefined })} />
          </FormField>
          {hasFilters && (
            <div className="flex items-end">
              <Button
                className="min-h-11"
                onClick={() => {
                  setSearchDraft("");
                  clear();
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </form>
        {periodoInvalido ? (
          <EmptyState title="Período inválido" description="Corrija as datas de vencimento para ver as contas." />
        ) : (
          <>
            <DataTable
              caption="Contas a pagar"
              columns={columns}
              rows={data?.itens}
              getRowKey={(t) => t.id}
              isLoading={list.isLoading}
              isFetching={list.isFetching}
              error={list.error}
              onRetry={() => void list.refetch()}
              emptyTitle={hasFilters ? "Nenhuma conta encontrada" : "Nenhuma conta a pagar"}
              emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "As contas lançadas aparecem aqui, em ordem de vencimento."}
            />
            {data && !list.error && <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={list.isFetching} onChange={(o) => update({ pagina: String(o / PAGE_SIZE + 1) })} />}
          </>
        )}
      </Card>
      {creating && <ContaFormDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
