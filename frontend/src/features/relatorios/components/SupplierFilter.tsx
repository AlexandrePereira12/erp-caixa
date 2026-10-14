import { useState } from "react";
import { Button } from "@/components/Button";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useDebouncedValue } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { useBuscaFornecedores } from "../api";

export interface SupplierValue {
  id: number;
  nome: string;
}

/**
 * Filtro de fornecedor (opcional): busca pessoas com o papel fornecedor, inclusive as desativadas
 * (compras antigas continuam sendo delas). Só aparece para quem pode listar pessoas.
 */
export function SupplierFilter({ value, onChange }: { value: SupplierValue | null; onChange: (supplier: SupplierValue | null) => void }) {
  const { can } = usePermissions();
  const allowed = can("pessoas.listar");
  const [query, setQuery] = useState("");
  const term = useDebouncedValue(query.trim(), 250);
  const search = useBuscaFornecedores(term, allowed && value === null && term.length >= 2);

  if (!allowed) return null;

  if (value) {
    return (
      <div>
        <p className="mb-1 text-sm font-semibold text-fg">Fornecedor</p>
        <div role="group" aria-label="Fornecedor selecionado" className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line-strong/80 bg-surface-2 px-3 py-1">
          <p className="min-w-0 break-words font-medium text-fg">{value.nome}</p>
          <Button size="sm" onClick={() => onChange(null)}>
            Trocar
          </Button>
        </div>
      </div>
    );
  }

  const items = search.data?.itens ?? [];
  const options: ComboOption[] = items.map((pessoa) => ({ id: pessoa.id, label: pessoa.nome, description: pessoa.nome_fantasia ?? undefined }));
  return (
    <SearchCombobox
      label="Fornecedor"
      placeholder="Buscar pelo nome"
      query={query}
      onQueryChange={setQuery}
      options={options}
      onSelect={(option) => {
        const picked = items.find((pessoa) => pessoa.id === option.id);
        if (picked) {
          onChange({ id: picked.id, nome: picked.nome });
          setQuery("");
        }
      }}
      isLoading={search.isLoading}
      error={search.error}
      emptyText="Nenhum fornecedor encontrado."
      hint="Opcional. Em branco: todos os fornecedores."
    />
  );
}
