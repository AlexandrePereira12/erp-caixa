import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/Button";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useDebouncedValue } from "@/components/useListParams";
import { api } from "@/lib/api/client";
import { usePermissions } from "@/lib/auth/hooks";

export interface SupplierValue {
  id: number;
  nome: string;
}

/**
 * Fornecedor da compra (opcional): busca pessoas com o papel fornecedor. Só aparece para quem pode
 * listar pessoas; o backend valida de novo que a pessoa é fornecedora ativa.
 */
export function SupplierField({ value, onChange }: { value: SupplierValue | null; onChange: (supplier: SupplierValue | null) => void }) {
  const { can } = usePermissions();
  const [query, setQuery] = useState("");
  const term = useDebouncedValue(query.trim(), 250);
  const search = useQuery({
    queryKey: ["pessoas", "busca-fornecedor", term],
    queryFn: ({ signal }) => api.get("/pessoas", { query: { q: term, papel: "fornecedor", ativo: true, limite: 8 }, signal }),
    enabled: can("pessoas.listar") && value === null && term.length >= 2,
    staleTime: 15_000,
  });

  if (!can("pessoas.listar")) return null;

  if (value) {
    return (
      <div>
        <p className="mb-1 text-sm font-semibold text-fg">Fornecedor</p>
        <div role="group" aria-label="Fornecedor selecionado" className="flex items-center justify-between gap-3 rounded-md border border-line-strong/80 bg-surface-2 px-3 py-2">
          <p className="min-w-0 truncate font-medium text-fg">{value.nome}</p>
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
      placeholder="Buscar fornecedor pelo nome"
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
      emptyText="Nenhum fornecedor encontrado. Cadastre em Pessoas, com o papel de fornecedor."
      hint="Opcional. Alimenta o relatório de compras."
    />
  );
}
