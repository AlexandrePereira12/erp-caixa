import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { ErrorState, LoadingBlock } from "@/components/States";

export interface ReportBoundaryProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}

/**
 * Estados da consulta no nível da página: carregando, erro (com "Tentar novamente") e dados. Uma
 * única mensagem de erro por tela; durante uma nova consulta os dados anteriores ficam esmaecidos.
 */
export function ReportBoundary<T>({ query, children }: ReportBoundaryProps<T>) {
  if (query.error) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Card>
    );
  }
  if (query.isLoading || query.data === undefined) {
    return (
      <Card>
        <LoadingBlock />
      </Card>
    );
  }
  return (
    <div aria-busy={query.isFetching || undefined} className={`space-y-5 transition-opacity ${query.isFetching ? "opacity-60" : ""}`}>
      {children(query.data)}
    </div>
  );
}

/** Dados que podem ir para a impressão: os da consulta atual (nunca os do filtro anterior nem de uma consulta que falhou). */
export function printableData<T>(query: UseQueryResult<T>, valid = true): T | undefined {
  return valid && !query.error && !query.isPlaceholderData ? query.data : undefined;
}
