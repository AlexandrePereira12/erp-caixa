import { useId, useState } from "react";
import { Button } from "@/components/Button";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useDebouncedValue } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { useFornecedores } from "./api";

export interface FornecedorValue {
  id: number;
  nome: string;
}

export interface FornecedorPickerProps {
  label: string;
  value: FornecedorValue | null;
  onChange: (fornecedor: FornecedorValue | null) => void;
  /** No cadastro só vale fornecedor ativo (o backend recusa inativo); no filtro da lista, qualquer um. */
  somenteAtivos?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string | undefined;
}

/**
 * Busca de fornecedor (GET /pessoas?papel=fornecedor, exige pessoas.listar). Sem cadastro rápido de
 * propósito: o cadastro rápido cria cliente, e o backend recusa conta de quem não é fornecedor.
 */
export function FornecedorPicker({ label, value, onChange, somenteAtivos = false, disabled = false, hint, error }: FornecedorPickerProps) {
  const { can } = usePermissions();
  const canSearch = can("pessoas.listar");
  const id = useId();
  const [term, setTerm] = useState("");
  const typed = term.trim();
  const query = useDebouncedValue(typed, 250);
  const results = useFornecedores({ q: query, somenteAtivos, enabled: canSearch && !value });
  const people = results.data?.itens ?? [];

  const options: ComboOption[] = query.length < 2 ? [] : people.map((p) => ({ id: p.id, label: p.nome, description: [p.nome_fantasia, p.telefone ?? p.whatsapp].filter(Boolean).join(" · ") || "Sem telefone" }));
  const searching = canSearch && typed.length >= 2 && (query !== typed || results.isFetching);

  function choose(option: ComboOption) {
    const person = people.find((p) => p.id === option.id);
    if (!person) return;
    setTerm("");
    onChange({ id: person.id, nome: person.nome });
  }

  if (value) {
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
    return (
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
        <p id={`${id}-label`} className="mb-1 block text-sm font-semibold text-fg">
          {label}
        </p>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5">
          <span className="min-w-0 truncate font-medium text-fg">{value.nome}</span>
          {!disabled && (
            <Button size="sm" className="min-h-11 shrink-0" onClick={() => onChange(null)} aria-label={`Remover fornecedor ${value.nome}`}>
              Remover
            </Button>
          )}
        </div>
        {hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="mt-1 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!canSearch) {
    return (
      <div role="group" aria-labelledby={`${id}-label`}>
        <p id={`${id}-label`} className="mb-1 block text-sm font-semibold text-fg">
          {label}
        </p>
        <p className="text-sm text-muted">Você não tem permissão para buscar fornecedores.</p>
      </div>
    );
  }

  return (
    <SearchCombobox
      label={label}
      query={term}
      onQueryChange={setTerm}
      options={options}
      onSelect={choose}
      isLoading={searching}
      error={results.error}
      placeholder="Buscar por nome ou telefone"
      emptyText={typed.length < 2 ? "Digite ao menos 2 letras para buscar." : "Nenhum fornecedor encontrado."}
      disabled={disabled}
      errorText={error}
      hint={hint}
    />
  );
}
