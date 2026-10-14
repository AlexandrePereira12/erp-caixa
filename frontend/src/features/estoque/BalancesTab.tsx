import { useEffect } from "react";
import { STOCK_PAGE_SIZE, useBalances, type BalanceFilters } from "./api";
import type { SaldoOut } from "./types";
import { useCategories } from "@/features/catalogo/api";
import { formatCost } from "@/features/catalogo/decimalInput";
import { PRODUCT_TYPES, productTypeLabel, type TipoProduto } from "@/features/catalogo/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox, Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import { parsePage, parsePositiveInt, useListParams, useSearchDraft } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDecimal, formatMoney } from "@/lib/money";

function parseTipo(value: string | null): TipoProduto | undefined {
  return PRODUCT_TYPES.find((tipo) => tipo === value);
}

/** Aba "Saldos": o que a API devolve por produto, sem somar nem recalcular nada no navegador. */
export function BalancesTab() {
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();
  const q = params.get("q") ?? "";
  const filters: BalanceFilters = {
    q,
    tipo: parseTipo(params.get("tipo")),
    categoriaId: parsePositiveInt(params.get("categoria")),
    abaixoMinimo: params.get("abaixo_minimo") === "1",
    deslocamento: (parsePage(params.get("pagina")) - 1) * STOCK_PAGE_SIZE,
  };
  const hasFilters = Boolean(q || filters.tipo || filters.categoriaId || filters.abaixoMinimo);

  const [searchDraft, setSearchDraft] = useSearchDraft(q, (value) => update({ q: value }));
  const canListCategories = can("catalogo.listar");
  const categories = useCategories({ enabled: canListCategories });
  const balances = useBalances(filters);

  const data = balances.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      update({ pagina: String(Math.ceil(data.total / STOCK_PAGE_SIZE)) });
    }
  }, [data, update]);

  const columns: Column<SaldoOut>[] = [
    {
      key: "produto",
      header: "Produto",
      cell: (s) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">{s.nome}</p>
          <p className="text-xs text-muted">{productTypeLabel(s.tipo)}</p>
        </div>
      ),
    },
    {
      key: "saldo",
      label: "Saldo",
      header: "Saldo",
      cell: (s) => (
        <div className="whitespace-nowrap">
          <p className={s.abaixo_minimo ? "font-semibold text-danger-text" : "font-medium text-fg"}>
            {formatDecimal(s.saldo)} {s.unidade}
          </p>
          {s.abaixo_minimo && <Badge tone="danger">Abaixo do mínimo</Badge>}
        </div>
      ),
    },
    { key: "minimo", label: "Mínimo", header: "Mínimo", cell: (s) => <span className="whitespace-nowrap tabular-nums">{formatDecimal(s.estoque_minimo)} {s.unidade}</span> },
    { key: "custo", label: "Custo médio", header: "Custo médio", cell: (s) => <span className="whitespace-nowrap">{formatCost(s.custo_medio)}</span> },
    { key: "valor", label: "Valor em estoque", header: "Valor em estoque", cell: (s) => <span className="whitespace-nowrap tabular-nums">{formatMoney(s.valor_em_estoque)}</span> },
  ];

  return (
    <Card>
      <form role="search" aria-label="Filtrar saldos" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <FormField label="Buscar">
          <Input type="search" placeholder="Nome ou código" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
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
        {canListCategories && (
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
        )}
        <div className="flex h-10 items-center">
          <Checkbox label="Abaixo do mínimo" checked={filters.abaixoMinimo} onChange={(e) => update({ abaixo_minimo: e.target.checked ? "1" : undefined })} />
        </div>
        {hasFilters && (
          <Button
            onClick={() => {
              setSearchDraft("");
              reset(["aba"]);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </form>

      <DataTable
        caption="Saldos de estoque"
        columns={columns}
        rows={data?.itens}
        getRowKey={(s) => s.produto_id}
        isLoading={balances.isLoading}
        isFetching={balances.isFetching}
        error={balances.error}
        onRetry={() => void balances.refetch()}
        emptyTitle={hasFilters ? "Nenhum produto encontrado" : "Nenhum produto controla estoque"}
        emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : "Cadastre produtos com “Controla estoque” marcado para acompanhar o saldo."}
      />
      {data && !balances.error && (
        <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={balances.isFetching} onChange={(offset) => update({ pagina: String(offset / STOCK_PAGE_SIZE + 1) })} />
      )}
    </Card>
  );
}
