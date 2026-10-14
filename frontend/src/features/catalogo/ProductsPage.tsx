import { useEffect, useState } from "react";
import { PRODUCT_PAGE_SIZE, useCategories, useProductMutations, useProducts, type ProductFilters } from "./api";
import { CatalogNav } from "./CatalogNav";
import { formatCost } from "./decimalInput";
import { explainProductDeleteError } from "./productErrors";
import { ProductFormDialog } from "./ProductFormDialog";
import { RecipeDialog } from "./RecipeDialog";
import { PRODUCT_TYPES, productTypeLabel, type ProdutoOut, type TipoProduto } from "./types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Checkbox, Input, Select } from "@/components/controls";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/components/Toast";
import { parseBoolParam, parsePage, parsePositiveInt, useListParams, useSearchDraft } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";

type Dialog = { kind: "create" } | { kind: "edit" | "recipe" | "delete"; product: ProdutoOut } | null;

function parseTipo(value: string | null): TipoProduto | undefined {
  return PRODUCT_TYPES.find((tipo) => tipo === value);
}

const triState = (value: boolean | undefined) => (value === undefined ? "" : String(value));

export function ProductsPage() {
  usePageTitle("Produtos");
  const toast = useToast();
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();

  const q = params.get("q") ?? "";
  const filters: ProductFilters = {
    q,
    tipo: parseTipo(params.get("tipo")),
    categoriaId: parsePositiveInt(params.get("categoria")),
    ativo: parseBoolParam(params.get("ativo")),
    vendavel: parseBoolParam(params.get("vendavel")),
    abaixoMinimo: params.get("abaixo_minimo") === "1",
    deslocamento: (parsePage(params.get("pagina")) - 1) * PRODUCT_PAGE_SIZE,
  };
  const hasFilters = Boolean(q || filters.tipo || filters.categoriaId || filters.ativo !== undefined || filters.vendavel !== undefined || filters.abaixoMinimo);

  const [searchDraft, setSearchDraft] = useSearchDraft(q, (value) => update({ q: value }));
  const categories = useCategories();
  const products = useProducts(filters);
  const { remove } = useProductMutations();
  const [dialog, setDialog] = useState<Dialog>(null);

  // Depois de excluir o último item de uma página, volta para a última página existente.
  const data = products.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      update({ pagina: String(Math.ceil(data.total / PRODUCT_PAGE_SIZE)) });
    }
  }, [data, update]);

  const canEdit = can("catalogo.editar");
  const canDelete = can("catalogo.excluir");

  const columns: Column<ProdutoOut>[] = [
    {
      key: "produto",
      header: "Produto",
      cell: (p) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">
            {p.nome}
            {!p.ativo && (
              <Badge className="ml-2 align-middle" tone="neutral">
                Inativo
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted">
            {productTypeLabel(p.tipo)}
            {p.categoria ? ` · ${p.categoria.nome}` : ""}
            {p.codigo ? ` · Cód. ${p.codigo}` : ""}
            {p.codigo_barras ? ` · ${p.codigo_barras}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "preco",
      label: "Preço",
      header: "Preço",
      cell: (p) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums">{formatMoney(p.preco_venda)}</p>
          {!p.vendavel && <p className="text-xs text-muted">Não vendável</p>}
        </div>
      ),
    },
    {
      key: "custo",
      label: "Custo médio",
      header: "Custo médio",
      cell: (p) => (
        <div className="whitespace-nowrap">
          <p>{formatCost(p.custo_medio)}</p>
          {p.custo_ficha !== null && <p className="text-xs text-muted">Ficha: {formatCost(p.custo_ficha)}</p>}
        </div>
      ),
    },
    {
      key: "estoque",
      label: "Estoque",
      header: "Estoque",
      cell: (p) =>
        p.controla_estoque ? (
          <div className="whitespace-nowrap">
            <p className={p.abaixo_minimo ? "font-semibold text-danger-text" : undefined}>
              {formatDecimal(p.saldo)} {p.unidade.sigla}
            </p>
            {p.abaixo_minimo ? (
              <Badge tone="danger">Estoque baixo (mín. {formatDecimal(p.estoque_minimo)})</Badge>
            ) : (
              <p className="text-xs text-muted">Mín. {formatDecimal(p.estoque_minimo)}</p>
            )}
          </div>
        ) : (
          <span className="text-muted">Não controla</span>
        ),
    },
  ];
  if (canEdit || canDelete) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {canEdit && (
            <Button variant="ghost" size="sm" aria-label={`Editar ${p.nome}`} onClick={() => setDialog({ kind: "edit", product: p })}>
              Editar
            </Button>
          )}
          {p.tipo === "preparado" && (
            <Button variant="ghost" size="sm" aria-label={`Ficha técnica de ${p.nome}`} onClick={() => setDialog({ kind: "recipe", product: p })}>
              Ficha técnica
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" aria-label={`Excluir ${p.nome}`} className="text-danger-text" onClick={() => setDialog({ kind: "delete", product: p })}>
              Excluir
            </Button>
          )}
        </div>
      ),
    });
  } else {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (p) =>
        p.tipo === "preparado" ? (
          <Button variant="ghost" size="sm" aria-label={`Ficha técnica de ${p.nome}`} onClick={() => setDialog({ kind: "recipe", product: p })}>
            Ficha técnica
          </Button>
        ) : null,
    });
  }

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Catálogo de produtos, com preço, custo e saldo de estoque."
        actions={
          can("catalogo.criar") && (
            <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Novo produto
            </Button>
          )
        }
      />
      <CatalogNav />

      <Card>
        <form role="search" aria-label="Filtrar produtos" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <FormField label="Buscar" className="sm:col-span-2">
            <Input type="search" placeholder="Nome, código ou código de barras" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </FormField>
          <FormField label="Tipo">
            <Select value={filters.tipo ?? ""} onChange={(e) => update({ tipo: e.target.value || undefined })}>
              <option value="">Todos</option>
              {PRODUCT_TYPES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {productTypeLabel(tipo)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Categoria">
            <Select value={filters.categoriaId ?? ""} onChange={(e) => update({ categoria: e.target.value || undefined })}>
              <option value="">Todas</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Situação">
            <Select value={triState(filters.ativo)} onChange={(e) => update({ ativo: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </Select>
          </FormField>
          <FormField label="Vendável">
            <Select value={triState(filters.vendavel)} onChange={(e) => update({ vendavel: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="true">Vendáveis</option>
              <option value="false">Não vendáveis</option>
            </Select>
          </FormField>
          <div className="flex h-10 items-center">
            <Checkbox label="Abaixo do mínimo" checked={filters.abaixoMinimo} onChange={(e) => update({ abaixo_minimo: e.target.checked ? "1" : undefined })} />
          </div>
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
          caption="Lista de produtos"
          columns={columns}
          rows={data?.itens}
          getRowKey={(p) => p.id}
          isLoading={products.isLoading}
          isFetching={products.isFetching}
          error={products.error}
          onRetry={() => void products.refetch()}
          emptyTitle={hasFilters ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
        />
        {data && !products.error && (
          <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={products.isFetching} onChange={(offset) => update({ pagina: String(offset / PRODUCT_PAGE_SIZE + 1) })} />
        )}
      </Card>

      {dialog?.kind === "create" && <ProductFormDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <ProductFormDialog product={dialog.product} onClose={() => setDialog(null)} />}
      {dialog?.kind === "recipe" && <RecipeDialog product={dialog.product} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir produto"
        description={dialog?.kind === "delete" ? <>Excluir <strong>{dialog.product.nome}</strong>? Produto com saldo em estoque ou usado como insumo de outra ficha técnica não pode ser excluído.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          try {
            await remove.mutateAsync(dialog.product.id);
          } catch (error) {
            throw explainProductDeleteError(error);
          }
          toast.success(`${dialog.product.nome} foi excluído.`);
        }}
      />
    </div>
  );
}
