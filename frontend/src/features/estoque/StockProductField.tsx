import { useState } from "react";
import { useStockProductSearch } from "./api";
import type { SaldoOut } from "./types";
import { productTypeLabel } from "@/features/catalogo/types";
import { Button } from "@/components/Button";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useDebouncedValue } from "@/components/useListParams";
import { formatDecimal } from "@/lib/money";

/** Escolha de um produto que controla estoque (busca por nome ou código). */
export function StockProductField({
  label = "Produto",
  value,
  onChange,
  error,
}: {
  label?: string;
  value: SaldoOut | null;
  onChange: (product: SaldoOut | null) => void;
  error?: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const search = useStockProductSearch(useDebouncedValue(query.trim(), 250), value === null);

  if (value) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-fg">{label}</p>
        <div role="group" aria-label={`${label} selecionado`} className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-surface-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{value.nome}</p>
            <p className="text-xs text-muted">
              {productTypeLabel(value.tipo)} · Saldo atual: {formatDecimal(value.saldo)} {value.unidade}
            </p>
          </div>
          <Button size="sm" onClick={() => onChange(null)}>
            Trocar
          </Button>
        </div>
      </div>
    );
  }

  const items = search.data?.itens ?? [];
  const options: ComboOption[] = items.map((item) => ({ id: item.produto_id, label: item.nome, description: `${productTypeLabel(item.tipo)} · Saldo ${formatDecimal(item.saldo)} ${item.unidade}` }));

  return (
    <SearchCombobox
      label={label}
      placeholder="Buscar por nome ou código"
      query={query}
      onQueryChange={setQuery}
      options={options}
      onSelect={(option) => {
        const picked = items.find((item) => item.produto_id === option.id);
        if (picked) {
          onChange(picked);
          setQuery("");
        }
      }}
      isLoading={search.isLoading}
      error={search.error}
      emptyText="Nenhum produto com controle de estoque encontrado."
      errorText={error}
      required
    />
  );
}
