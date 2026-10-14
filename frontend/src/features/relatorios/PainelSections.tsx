import { Link } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { formaTipoLabel } from "@/components/pdv/labels";
import { usePermissions } from "@/lib/auth/hooks";
import { sumDecimals } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import type { DashboardOut } from "./api";
import { BarList } from "./components/BarList";
import { ChartTable, ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";

type MaisVendido = DashboardOut["mais_vendidos"][number];
type Forma = DashboardOut["formas_pagamento"][number];

const SEM_VENDAS = <p className="p-4 text-sm text-muted">Nenhuma venda neste período.</p>;

/** Ranking por quantidade vendida no período escolhido (a API manda os 5 primeiros). */
export function MaisVendidosSection({ itens }: { itens: MaisVendido[] }) {
  const rows = itens.map((item, index) => ({ ...item, rank: index + 1 }));
  const columns: Column<(typeof rows)[number]>[] = [
    { key: "rank", header: "Posição", cell: (r) => <span className="text-muted">{r.rank}º</span> },
    { key: "produto", header: "Produto", cell: (r) => <span className="break-words font-medium text-fg">{r.produto}</span> },
    { key: "quantidade", header: "Quantidade", cell: (r) => formatDecimal(r.quantidade), ...NUMERIC_COLUMN },
    { key: "total", header: "Total vendido", cell: (r) => formatMoney(r.total), ...NUMERIC_COLUMN },
  ];
  return (
    <ReportSection title="Mais vendidos" description="Produtos que mais saíram no período, por quantidade." flush>
      {rows.length === 0 ? (
        SEM_VENDAS
      ) : (
        <ChartTable
          chart={
            <BarList
              ariaLabel={`Gráfico de barras: quantidade vendida por produto. Mais vendido: ${rows[0]!.produto}, ${formatDecimal(rows[0]!.quantidade)}.`}
              items={rows.map((r) => ({ key: r.produto_id, label: r.produto, value: r.quantidade, valueText: formatDecimal(r.quantidade) }))}
            />
          }
          table={<DataTable caption="Produtos mais vendidos no período" columns={columns} rows={rows} getRowKey={(r) => r.produto_id} emptyTitle="Nenhuma venda" />}
        />
      )}
    </ReportSection>
  );
}

/** Total recebido por forma de pagamento no período escolhido. */
export function FormasPagamentoSection({ formas }: { formas: Forma[] }) {
  const columns: Column<Forma>[] = [
    {
      key: "forma",
      header: "Forma",
      cell: (f) => (
        <div>
          <p className="break-words font-medium text-fg">{f.forma}</p>
          {formaTipoLabel(f.tipo) !== f.forma && <p className="text-xs text-muted">{formaTipoLabel(f.tipo)}</p>}
        </div>
      ),
    },
    { key: "pagamentos", header: "Pagamentos", cell: (f) => formatDecimal(String(f.pagamentos_qtd)), ...NUMERIC_COLUMN },
    { key: "total", header: "Total", cell: (f) => formatMoney(f.total), ...NUMERIC_COLUMN },
  ];
  return (
    <ReportSection title="Formas de pagamento" description="Quanto entrou em cada forma de pagamento no período." flush>
      {formas.length === 0 ? (
        SEM_VENDAS
      ) : (
        <ChartTable
          chart={
            <BarList
              ariaLabel={`Gráfico de barras: total por forma de pagamento. Maior: ${formas[0]!.forma}, ${formatMoney(formas[0]!.total)}.`}
              items={formas.map((f) => ({ key: f.forma_pagamento_id, label: f.forma, value: f.total, valueText: formatMoney(f.total) }))}
            />
          }
          table={<DataTable caption="Total por forma de pagamento no período" columns={columns} rows={formas} getRowKey={(f) => f.forma_pagamento_id} emptyTitle="Nenhum pagamento" />}
        />
      )}
    </ReportSection>
  );
}

/** Caixas abertos agora, com o valor que deveria haver em cada um (soma do esperado por forma). */
export function CaixasAbertosSection({ caixas }: { caixas: DashboardOut["caixas_abertos"] }) {
  const { can } = usePermissions();
  return (
    <ReportSection headingLevel={3} title="Caixas abertos" description="Situação de agora, não depende do período.">
      {caixas.length === 0 ? (
        <p className="text-sm text-muted">Nenhum caixa aberto agora.</p>
      ) : (
        <ul className="space-y-3">
          {caixas.map((caixa) => (
            <li key={caixa.caixa_id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 break-words font-medium text-fg">
                  {can("caixa.listar") ? (
                    <Link to={`/caixas/${caixa.caixa_id}`} className="font-semibold text-brand-text underline-offset-2 hover:underline">
                      Caixa #{caixa.caixa_id}
                    </Link>
                  ) : (
                    <span>Caixa #{caixa.caixa_id}</span>
                  )}{" "}
                  · {caixa.operador}
                </p>
                <p className="text-right">
                  <span className="mr-1.5 text-xs text-muted">Esperado</span>
                  <span className="font-display text-lg font-semibold tabular-nums text-fg">{formatMoney(sumDecimals(caixa.esperado.map((e) => e.total)))}</span>
                </p>
              </div>
              <p className="text-xs text-muted">Aberto em {formatDateTime(caixa.aberto_em)}</p>
              {caixa.esperado.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                  {caixa.esperado.map((e) => (
                    <li key={e.forma_pagamento_id}>
                      {e.forma}: <span className="tabular-nums text-fg">{formatMoney(e.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}

/** Produtos no estoque mínimo ou abaixo: alerta com texto e ícone (nunca só cor) e atalho para o estoque. */
export function EstoqueBaixoSection({ itens, total }: { itens: DashboardOut["estoque_baixo"]; total: number }) {
  const { can } = usePermissions();
  return (
    <ReportSection headingLevel={3} title="Estoque baixo" description="Situação de agora, não depende do período.">
      {total === 0 ? (
        <Alert tone="success" title="Estoque em dia">
          Nenhum produto está no mínimo ou abaixo dele.
        </Alert>
      ) : (
        <>
          <Alert tone="warning" title={`${total} ${total === 1 ? "produto no mínimo ou abaixo" : "produtos no mínimo ou abaixo"}`}>
            Reponha para não faltar na hora do pedido.
          </Alert>
          <ul className="mt-3 divide-y divide-line text-sm">
            {itens.map((item) => (
              <li key={item.produto_id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 break-words text-fg">{item.produto}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  <strong className="font-semibold text-danger-text">{formatDecimal(item.saldo)}</strong> de {formatDecimal(item.estoque_minimo)} {item.unidade}
                </span>
              </li>
            ))}
          </ul>
          {total > itens.length && <p className="mt-2 text-xs text-muted">Mostrando os {itens.length} mais críticos.</p>}
          {can("estoque.listar") && (
            <Link to="/estoque?abaixo_minimo=1" className={buttonClasses({ className: "mt-3 min-h-11" })}>
              Ver no estoque
            </Link>
          )}
        </>
      )}
    </ReportSection>
  );
}
