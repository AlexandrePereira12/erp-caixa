import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { Input } from "./controls";
import { FormField } from "./FormField";

export interface ComboOption {
  id: number | string;
  label: string;
  description?: string;
}

export interface SearchComboboxProps {
  label: string;
  /** Texto digitado; a busca (debounce, requisição) é de quem usa. */
  query: string;
  onQueryChange: (value: string) => void;
  options: ComboOption[];
  /** Chamado ao escolher uma opção (clique ou Enter). Quem usa costuma limpar a busca. */
  onSelect: (option: ComboOption) => void;
  isLoading?: boolean;
  error?: unknown;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  errorText?: string | undefined;
  hint?: ReactNode;
}

/**
 * Campo de busca com lista de resultados (padrão WAI-ARIA combobox com aria-activedescendant).
 * Setas movem a opção ativa, Enter escolhe e Esc fecha só a lista (sem fechar o diálogo em volta).
 */
export function SearchCombobox({ label, query, onQueryChange, options, onSelect, isLoading, error, placeholder, emptyText = "Nenhum resultado.", disabled, required, errorText, hint }: SearchComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const hasList = open && !disabled && !error && !isLoading && options.length > 0;
  const optionId = (index: number) => `${listId}-opt-${index}`;

  function choose(option: ComboOption) {
    onSelect(option);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.min(activeIndex + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      const option = options[activeIndex];
      if (hasList && option) {
        event.preventDefault(); // não envia o formulário em volta
        choose(option);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div>
      <FormField label={label} error={errorText} hint={hint} required={required ?? false}>
        <Input
          role="combobox"
          type="search"
          autoComplete="off"
          aria-expanded={hasList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={hasList ? optionId(activeIndex) : undefined}
          placeholder={placeholder}
          disabled={disabled}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </FormField>
      {open && !disabled && (
        <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-sm">
          {error ? (
            <p role="alert" className="px-3 py-2 text-sm text-danger-text">
              {errorMessage(error)}
            </p>
          ) : isLoading ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              Buscando…
            </p>
          ) : options.length === 0 ? (
            <p role="status" className="px-3 py-2 text-sm text-muted">
              {emptyText}
            </p>
          ) : (
            <ul role="listbox" id={listId} aria-label={label} className="max-h-56 overflow-y-auto">
              {options.map((option, index) => (
                <li
                  key={option.id}
                  id={optionId(index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  // mousedown (e não click) evita que o campo perca o foco antes da escolha.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  className={`cursor-pointer px-3 py-2 text-sm ${index === activeIndex ? "bg-brand-soft text-brand-text" : "text-fg hover:bg-surface-2"}`}
                >
                  <span className="block font-medium">{option.label}</span>
                  {option.description && <span className="block text-xs text-muted">{option.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
