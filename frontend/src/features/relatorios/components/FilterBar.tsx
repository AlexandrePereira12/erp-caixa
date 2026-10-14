import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/controls";
import { FormField } from "@/components/FormField";

export interface FilterBarProps {
  /** Nome da região de busca (lido por leitores de tela). */
  label: string;
  children: ReactNode;
  /** Mostra "Limpar filtros" quando há algum filtro ativo. */
  onClear?: (() => void) | undefined;
  hasFilters?: boolean;
  /** Linha de ajuda sob os campos. */
  hint?: ReactNode;
}

/** Cartão com os filtros de um relatório. Os campos entram numa grade de 1 a 4 colunas. */
export function FilterBar({ label, children, onClear, hasFilters = false, hint }: FilterBarProps) {
  return (
    <Card className="mb-5">
      <form role="search" aria-label={label} onSubmit={(e) => e.preventDefault()} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        {hasFilters && onClear && (
          <div className="flex items-end">
            <Button className="min-h-11" onClick={onClear}>
              Limpar filtros
            </Button>
          </div>
        )}
        {hint && <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">{hint}</p>}
      </form>
    </Card>
  );
}

export interface PeriodFieldsProps {
  de: string;
  ate: string;
  /** Erro do par de datas (de depois de ate, período longo demais): aparece no campo "Até". */
  error?: string | undefined;
  onChange: (patch: { de?: string | undefined; ate?: string | undefined }) => void;
}

/** Campos "De" e "Até" (datas "YYYY-MM-DD"). Vazio = padrão do backend. */
export function PeriodFields({ de, ate, error, onChange }: PeriodFieldsProps) {
  return (
    <>
      <FormField label="De">
        <Input type="date" className="min-h-11" value={de} max={ate || undefined} onChange={(e) => onChange({ de: e.target.value || undefined })} />
      </FormField>
      <FormField label="Até" error={error}>
        <Input type="date" className="min-h-11" value={ate} min={de || undefined} onChange={(e) => onChange({ ate: e.target.value || undefined })} />
      </FormField>
    </>
  );
}

export interface PeriodFilterProps extends PeriodFieldsProps {
  label: string;
  onClear: () => void;
  /** Filtros extras do relatório, depois do período. */
  children?: ReactNode;
  /** Há filtros além do período (para o botão "Limpar filtros"). */
  hasOtherFilters?: boolean;
  hint?: ReactNode;
}

/** Barra de filtros por período, com validação de/até e filtros extras como filhos. */
export function PeriodFilter({ label, de, ate, error, onChange, onClear, children, hasOtherFilters = false, hint }: PeriodFilterProps) {
  return (
    <FilterBar label={label} hasFilters={Boolean(de || ate || hasOtherFilters)} onClear={onClear} hint={hint ?? "Sem datas, o relatório mostra o mês atual, do dia 1 até hoje."}>
      <PeriodFields de={de} ate={ate} error={error} onChange={onChange} />
      {children}
    </FilterBar>
  );
}
