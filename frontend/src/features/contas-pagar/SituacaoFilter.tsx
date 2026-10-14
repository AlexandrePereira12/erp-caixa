import { useId } from "react";
import type { SituacaoFiltro } from "./api";
import { SITUACAO_FILTROS } from "./labels";

/**
 * Filtro de situação como grupo de opções (radio nativo): setas movem a escolha, o rótulo é o texto
 * da opção e a marcada se destaca por cor E por contorno/negrito, não só pela cor.
 */
export function SituacaoFilter({ value, onChange }: { value: SituacaoFiltro; onChange: (value: SituacaoFiltro) => void }) {
  const name = useId();
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
      <legend className="mb-1 text-sm font-semibold text-fg">Situação</legend>
      <div className="flex flex-wrap gap-2">
        {SITUACAO_FILTROS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center rounded-full border border-line-strong/70 bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-semibold has-[:checked]:text-brand-text has-[:checked]:ring-1 has-[:checked]:ring-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
