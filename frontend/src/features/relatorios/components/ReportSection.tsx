import { useId, type ReactNode } from "react";
import { Card } from "@/components/Card";

export interface ReportSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Sem espaçamento interno (para tabelas que vão de ponta a ponta do cartão). */
  flush?: boolean;
  className?: string;
  /** Nível do título: 2 (padrão) ou 3 quando o bloco fica dentro de outra seção com h2. */
  headingLevel?: 2 | 3;
  children: ReactNode;
}

/** Bloco de um relatório: cartão com título (h2 ou h3) e região nomeada por ele. */
export function ReportSection({ title, description, actions, flush = false, className = "", headingLevel = 2, children }: ReportSectionProps) {
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={`min-w-0 ${className}`}>
      <Card className="h-full">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <Heading id={id} className="text-lg font-semibold leading-snug text-fg">
              {title}
            </Heading>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div className={flush ? "" : "p-4"}>{children}</div>
      </Card>
    </section>
  );
}

/**
 * Gráfico e a tabela com os mesmos números, um sobre o outro, dentro de um `ReportSection flush`.
 * A tabela aqui tem poucas colunas: sem a largura mínima de 40 rem do DataTable, cabe em cartões estreitos.
 */
export function ChartTable({ chart, table }: { chart: ReactNode; table: ReactNode }) {
  return (
    <>
      <div className="rp-chart p-4">{chart}</div>
      <div className="border-t border-line md:[&_table]:min-w-0">{table}</div>
    </>
  );
}
