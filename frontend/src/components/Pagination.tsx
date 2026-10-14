import { Button } from "./Button";

export interface PaginationProps {
  total: number;
  limite: number;
  deslocamento: number;
  /** Recebe o novo deslocamento (offset). */
  onChange: (deslocamento: number) => void;
  disabled?: boolean;
}

export function Pagination({ total, limite, deslocamento, onChange, disabled }: PaginationProps) {
  if (total <= 0) return null;
  const from = Math.min(deslocamento + 1, total);
  const to = Math.min(deslocamento + limite, total);
  const page = Math.floor(deslocamento / limite) + 1;
  const pages = Math.max(1, Math.ceil(total / limite));

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <p className="text-muted">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted" aria-live="polite">
          Página {page} de {pages}
        </span>
        <Button size="sm" disabled={disabled || deslocamento <= 0} onClick={() => onChange(Math.max(0, deslocamento - limite))}>
          Anterior
        </Button>
        <Button size="sm" disabled={disabled || deslocamento + limite >= total} onClick={() => onChange(deslocamento + limite)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}
