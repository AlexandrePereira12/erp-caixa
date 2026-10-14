/*
 * Abaixo de `md` a tabela vira uma lista de cartões (CSS puro, mesmo DOM). Trocar o `display` dos
 * elementos de tabela faz alguns leitores de tela perderem a semântica; por isso os papéis ARIA
 * são declarados de forma explícita (o aviso de papel redundante é intencional).
 */
/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "./States";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Rótulo exibido nos cartões (celular). Padrão: o `header`, se for texto; coluna só de ações não tem rótulo. */
  label?: string;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  /** Descrição acessível da tabela (lida por leitores de tela). */
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowKey: (row: T) => string | number;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

/** Tabela com os estados de carregando, erro e vazio já resolvidos. */
export function DataTable<T>({ caption, columns, rows, getRowKey, isLoading, isFetching, error, onRetry, emptyTitle, emptyDescription, emptyAction }: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading || !rows) return <LoadingBlock />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} {...(emptyDescription ? { description: emptyDescription } : {})} {...(emptyAction ? { action: emptyAction } : {})} />;

  return (
    <div className="relative overflow-x-auto" aria-busy={isFetching || undefined}>
      <table role="table" className={`w-full border-collapse text-left text-[0.84rem] transition-opacity md:min-w-[40rem] max-md:block ${isFetching ? "opacity-60" : ""}`}>
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="max-md:sr-only">
          <tr role="row" className="border-y border-line-strong bg-surface-2 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-muted">
            {columns.map((col) => (
              <th key={col.key} role="columnheader" scope="col" className={`h-10 px-5 font-semibold ${col.headerClassName ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="divide-y divide-line max-md:block">
          {rows.map((row) => (
            <tr key={getRowKey(row)} role="row" className="align-top hover:bg-surface-2/60 max-md:block max-md:px-4 max-md:py-3.5">
              {columns.map((col) => {
                const label = col.label ?? (typeof col.header === "string" ? col.header : undefined);
                return (
                  <td key={col.key} role="cell" className={`px-5 py-3.5 max-md:flex max-md:items-baseline max-md:gap-2 max-md:px-0 max-md:py-1 ${col.className ?? ""}`}>
                    {label && (
                      <span aria-hidden="true" className="w-[6.5rem] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted md:hidden">
                        {label}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">{col.cell(row)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
