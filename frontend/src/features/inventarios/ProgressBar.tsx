/** Progresso vindo da API (itens_contados / total_itens); nada é calculado aqui. */
export function ProgressBar({ counted, total, label }: { counted: number; total: number; label: string }) {
  return (
    <div className="min-w-32">
      <progress className="h-2 w-full accent-brand" value={counted} max={Math.max(total, 1)} aria-label={label} />
      <p className="text-xs text-muted">
        {counted} de {total} contados
      </p>
    </div>
  );
}
