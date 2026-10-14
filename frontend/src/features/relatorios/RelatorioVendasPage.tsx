import { Alert } from "@/components/Alert";
import { PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/States";
import { formatDay } from "@/components/pdv/dates";
import { Choice } from "@/components/pdv/Choice";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useRelatorioVendas, type Agrupar, type LinhaVendas, type RelatorioVendasOut } from "./api";
import { TopBarList } from "./components/BarList";
import { DayColumnChart } from "./components/DayColumnChart";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { PeriodFilter } from "./components/FilterBar";
import { PeriodLine } from "./components/PeriodLine";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ChartTable, ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";
import { useReportPeriod } from "./period";

const AGRUPAR_OPTIONS: [Agrupar, string][] = [
  ["dia", "Dia"],
  ["forma_pagamento", "Forma de pagamento"],
  ["produto", "Produto"],
  ["operador", "Operador"],
];

export function parseAgrupar(value: string | null | undefined): Agrupar {
  return value === "forma_pagamento" || value === "produto" || value === "operador" ? value : "dia";
}

const SECTION_TITLE: Record<Agrupar, string> = {
  dia: "Faturamento por dia",
  forma_pagamento: "Total por forma de pagamento",
  produto: "Total por produto",
  operador: "Total por operador",
};

function columnsFor(agrupar: Agrupar): Column<LinhaVendas>[] {
  const label: Column<LinhaVendas> = {
    key: "rotulo",
    header: { dia: "Data", forma_pagamento: "Forma de pagamento", produto: "Produto", operador: "Operador" }[agrupar],
    cell: (l) => <span className="break-words font-medium text-fg">{l.rotulo}</span>,
  };
  // Por forma de pagamento, `vendas_qtd` conta pagamentos (uma venda pode ter vários).
  const count: Column<LinhaVendas> = {
    key: "vendas",
    header: agrupar === "forma_pagamento" ? "Pagamentos" : "Vendas",
    cell: (l) => formatDecimal(String(l.vendas_qtd)),
    ...NUMERIC_COLUMN,
  };
  const quantity: Column<LinhaVendas> = { key: "quantidade", header: "Quantidade", cell: (l) => formatDecimal(l.quantidade), ...NUMERIC_COLUMN };
  const total: Column<LinhaVendas> = { key: "total", header: "Total", cell: (l) => <span className="font-medium text-fg">{formatMoney(l.total)}</span>, ...NUMERIC_COLUMN };
  return agrupar === "produto" ? [label, quantity, count, total] : [label, count, total];
}

function Grafico({ data, agrupar }: { data: RelatorioVendasOut; agrupar: Agrupar }) {
  if (agrupar === "dia" && data.linhas.length > 0) {
    return <DayColumnChart janela={data.janela} linhas={data.linhas.map((l) => ({ chave: l.chave, valor: l.total }))} subject="faturamento por dia" />;
  }
  return <TopBarList subject={SECTION_TITLE[agrupar].toLowerCase()} items={data.linhas.map((l) => ({ key: l.chave, label: l.rotulo, value: l.total, valueText: formatMoney(l.total) }))} />;
}

function Resultado({ data }: { data: RelatorioVendasOut }) {
  const { resumo, linhas, janela } = data;
  // A tabela segue o agrupamento que a API devolveu: ao trocar o filtro, a resposta anterior continua coerente.
  const agrupar = parseAgrupar(data.agrupado_por);
  const columns = columnsFor(agrupar);
  const empty = resumo.vendas_qtd === 0 && resumo.estornos_qtd === 0;

  return (
    <>
      <PeriodLine de={janela.de} ate={janela.ate} />
      {empty ? (
        <ReportSection title="Sem vendas no período" flush>
          <EmptyState title="Nenhuma venda neste período" description="Ajuste as datas para ver outro período. As vendas aparecem aqui quando uma conta é fechada." />
        </ReportSection>
      ) : (
        <>
          <KpiGrid>
            <KpiCard featured label="Faturamento" value={formatMoney(resumo.faturamento)} hint="Vendas válidas, sem estornos" />
            <KpiCard label="Vendas" value={formatDecimal(String(resumo.vendas_qtd))} />
            <KpiCard label="Ticket médio" value={formatMoney(resumo.ticket_medio)} hint="Faturamento dividido pelas vendas" />
            <KpiCard label="Subtotal dos itens" value={formatMoney(resumo.subtotal_itens)} />
            <KpiCard label="Descontos" value={formatMoney(resumo.descontos)} />
            <KpiCard label="Acréscimos" value={formatMoney(resumo.acrescimos)} />
            <KpiCard label="Taxa de serviço" value={formatMoney(resumo.taxa_servico)} />
            <KpiCard
              label="Estornos"
              value={formatMoney(resumo.estornos_total)}
              tone={resumo.estornos_qtd > 0 ? "warning" : "neutral"}
              hint={`${resumo.estornos_qtd} ${resumo.estornos_qtd === 1 ? "venda estornada" : "vendas estornadas"}, fora do faturamento`}
            />
          </KpiGrid>
          <ReportSection title={SECTION_TITLE[agrupar]} flush>
            <ChartTable
              chart={linhas.length > 0 ? <Grafico data={data} agrupar={agrupar} /> : <p className="text-sm text-muted">Sem vendas válidas para o gráfico.</p>}
              table={
                <DataTable
                  caption={`${SECTION_TITLE[agrupar]}, de ${formatDay(janela.de)} a ${formatDay(janela.ate)}`}
                  columns={columns}
                  rows={linhas}
                  getRowKey={(l) => l.chave}
                  emptyTitle="Nenhuma linha"
                />
              }
            />
          </ReportSection>
        </>
      )}
    </>
  );
}

/** Relatório de vendas: totais do período e o detalhe por dia, forma de pagamento, produto ou operador. */
export function RelatorioVendasPage() {
  usePageTitle("Relatório de vendas");
  const { params, update, reset, de, ate, error, valid } = useReportPeriod();
  const agrupar = parseAgrupar(params.get("agrupar"));
  const query = useRelatorioVendas({ de: de || undefined, ate: ate || undefined, agrupar }, valid);
  const printable = printableData(query, valid);

  return (
    <div>
      <PageHeader
        title="Relatório de vendas"
        description="Quanto foi vendido no período: por dia, forma de pagamento, produto ou operador."
        actions={
          printable && (
            <PrintReport title="Relatório de vendas">
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <PeriodFilter label="Filtrar relatório de vendas" de={de} ate={ate} error={error} onChange={update} onClear={() => reset(["agrupar"])}>
        <div className="sm:col-span-2 lg:col-span-4">
          <Choice<Agrupar> legend="Agrupar por" name="agrupar" columns={4} value={agrupar} onChange={(value) => update({ agrupar: value === "dia" ? undefined : value })} options={AGRUPAR_OPTIONS} />
        </div>
      </PeriodFilter>
      {valid ? (
        <ReportBoundary query={query}>{(data) => <Resultado data={data} />}</ReportBoundary>
      ) : (
        <Alert tone="warning" title="Ajuste o período">
          Corrija as datas acima para atualizar o relatório.
        </Alert>
      )}
    </div>
  );
}
