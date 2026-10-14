import { useEffect, useState } from "react";
import { STOCK_PAGE_SIZE, useMovements, useStockProductSearch, type MovementFilters } from "./api";
import { validDay } from "./dates";
import { MOVEMENT_TYPES, movementLabel, originLabel, type MovimentoOut, type TipoMovimento } from "./types";
import { formatSigned } from "@/features/catalogo/decimalInput";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { Pagination } from "@/components/Pagination";
import { SearchCombobox } from "@/components/SearchCombobox";
import { parsePage, parsePositiveInt, useDebouncedValue, useListParams } from "@/components/useListParams";
import { formatDateTime } from "@/lib/format";
import { formatDecimal } from "@/lib/money";

function parseTipo(value: string | null): TipoMovimento | undefined {
  return MOVEMENT_TYPES.find((tipo) => tipo === value);
}

const TONES: Record<string, BadgeTone> = { entrada: "success", estorno_venda: "success", saida: "warning", perda: "danger", ajuste: "brand", inventario: "brand", venda: "neutral" };


function ProductFilter({ productId, productName, onPick, onClear }: { productId: number | undefined; productName: string; onPick: (id: number, name: string) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const search = useStockProductSearch(useDebouncedValue(query.trim(), 250), productId === undefined);
  if (productId !== undefined) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-fg">Produto</p>
        <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface-2 px-3">
          <span className="truncate text-sm text-fg">{productName || `#${productId}`}</span>
          <Button variant="ghost" size="sm" aria-label="Remover filtro de produto" onClick={onClear}>
            Remover
          </Button>
        </div>
      </div>
    );
  }
  return (
    <SearchCombobox
      label="Produto"
      placeholder="Todos os produtos"
      query={query}
      onQueryChange={setQuery}
      options={(search.data?.itens ?? []).map((item) => ({ id: item.produto_id, label: item.nome, description: item.unidade }))}
      onSelect={(option) => {
        const id = typeof option.id === "number" ? option.id : parsePositiveInt(option.id);
        if (id === undefined) return;
        onPick(id, option.label);
        setQuery("");
      }}
      isLoading={search.isLoading}
      error={search.error}
      emptyText="Nenhum produto encontrado."
    />
  );
}

/** Aba "Movimentos": histórico com filtros de produto, tipo e período (datas locais viram ISO). */
export function MovementsTab() {
  const { params, update, reset } = useListParams();
  const filters: MovementFilters = {
    produtoId: parsePositiveInt(params.get("produto")),
    tipo: parseTipo(params.get("mtipo")),
    de: validDay(params.get("de")),
    ate: validDay(params.get("ate")),
    deslocamento: (parsePage(params.get("pagina")) - 1) * STOCK_PAGE_SIZE,
  };
  const hasFilters = Boolean(filters.produtoId || filters.tipo || filters.de || filters.ate);
  const movements = useMovements(filters);

  const data = movements.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      update({ pagina: String(Math.ceil(data.total / STOCK_PAGE_SIZE)) });
    }
  }, [data, update]);

  const columns: Column<MovimentoOut>[] = [
    { key: "quando", label: "Data", header: "Data e hora", cell: (m) => <span className="whitespace-nowrap">{formatDateTime(m.ocorrido_em)}</span> },
    { key: "produto", header: "Produto", cell: (m) => <span className="font-medium text-fg">{m.produto_nome}</span> },
    { key: "tipo", label: "Tipo", header: "Tipo", cell: (m) => <Badge tone={TONES[m.tipo] ?? "neutral"}>{movementLabel(m.tipo)}</Badge> },
    {
      key: "quantidade",
      label: "Quantidade",
      header: "Quantidade",
      cell: (m) => (
        <span className={`whitespace-nowrap font-medium ${m.quantidade.trim().startsWith("-") ? "text-danger-text" : "text-success-text"}`}>
          {formatSigned(m.quantidade)} {m.unidade}
        </span>
      ),
    },
    { key: "saldo", label: "Saldo após", header: "Saldo após", cell: (m) => <span className="whitespace-nowrap tabular-nums">{formatDecimal(m.saldo_apos)} {m.unidade}</span> },
    { key: "usuario", label: "Usuário", header: "Usuário", cell: (m) => m.usuario_nome ?? <span className="text-muted">—</span> },
    { key: "origem", label: "Origem", header: "Origem", cell: (m) => originLabel(m.origem_tipo, m.origem_id) },
    {
      key: "detalhes",
      label: "Detalhes",
      header: "Documento / justificativa",
      cell: (m) =>
        m.documento || m.justificativa ? (
          <div className="min-w-40 max-w-xs">
            {m.documento && <p className="text-xs text-muted">Doc.: {m.documento}</p>}
            {m.justificativa && <p>{m.justificativa}</p>}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <Card>
      <form role="search" aria-label="Filtrar movimentos" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <ProductFilter
          productId={filters.produtoId}
          productName={params.get("pnome") ?? ""}
          onPick={(id, name) => update({ produto: String(id), pnome: name })}
          onClear={() => update({ produto: undefined, pnome: undefined })}
        />
        <FormField label="Tipo de movimento">
          <Select value={filters.tipo ?? ""} onChange={(e) => update({ mtipo: e.target.value || undefined })}>
            <option value="">Todos</option>
            {MOVEMENT_TYPES.map((tipo) => (
              <option key={tipo} value={tipo}>
                {movementLabel(tipo)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De">
          <Input type="date" value={filters.de} max={filters.ate || undefined} onChange={(e) => update({ de: e.target.value || undefined })} />
        </FormField>
        <FormField label="Até">
          <Input type="date" value={filters.ate} min={filters.de || undefined} onChange={(e) => update({ ate: e.target.value || undefined })} />
        </FormField>
        {hasFilters && (
          <Button onClick={() => reset(["aba"])} className="sm:col-span-2 lg:col-span-1">
            Limpar filtros
          </Button>
        )}
      </form>

      <DataTable
        caption="Movimentos de estoque"
        columns={columns}
        rows={data?.itens}
        getRowKey={(m) => m.id}
        isLoading={movements.isLoading}
        isFetching={movements.isFetching}
        error={movements.error}
        onRetry={() => void movements.refetch()}
        emptyTitle={hasFilters ? "Nenhum movimento encontrado" : "Nenhum movimento registrado"}
        emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
      />
      {data && !movements.error && (
        <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={movements.isFetching} onChange={(offset) => update({ pagina: String(offset / STOCK_PAGE_SIZE + 1) })} />
      )}
    </Card>
  );
}
