import { Link } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { buttonClasses } from "@/components/Button";
import { PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/States";
import { formatDay } from "@/components/pdv/dates";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useRelatorioPerdas, type LinhaPerdas, type RelatorioPerdasOut } from "./api";
import { TopBarList } from "./components/BarList";
import { PeriodFilter } from "./components/FilterBar";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { PeriodLine } from "./components/PeriodLine";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ChartTable, ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";
import { useReportPeriod } from "./period";

function Resultado({ data }: { data: RelatorioPerdasOut }) {
  const { can } = usePermissions();
  const { linhas, janela } = data;
  const columns: Column<LinhaPerdas>[] = [
    { key: "produto", header: "Produto", cell: (l) => <span className="break-words font-medium text-fg">{l.produto}</span> },
    { key: "quantidade", header: "Quantidade perdida", cell: (l) => `${formatDecimal(l.quantidade)} ${l.unidade}`, ...NUMERIC_COLUMN },
    { key: "ocorrencias", header: "Ocorrências", cell: (l) => formatDecimal(String(l.ocorrencias)), ...NUMERIC_COLUMN },
    { key: "custo", header: "Custo estimado", cell: (l) => <span className="font-medium text-fg">{formatMoney(l.custo_estimado)}</span>, ...NUMERIC_COLUMN },
  ];
  const movimentos = `/estoque?${new URLSearchParams({ aba: "movimentos", mtipo: "perda", de: janela.de, ate: janela.ate }).toString()}`;

  return (
    <>
      <PeriodLine de={janela.de} ate={janela.ate} />
      {linhas.length === 0 && data.ocorrencias === 0 ? (
        <ReportSection title="Sem perdas no período" flush>
          <EmptyState title="Nenhuma perda neste período" description="Perdas, quebras e vencimentos registrados no estoque aparecem aqui." />
        </ReportSection>
      ) : (
        <>
          <KpiGrid>
            <KpiCard featured label="Custo total das perdas" value={formatMoney(data.custo_total)} hint="Quantidade perdida vezes o custo do produto" />
            <KpiCard label="Ocorrências" value={formatDecimal(String(data.ocorrencias))} hint="Baixas por perda registradas no período" />
            <KpiCard label="Produtos com perda" value={formatDecimal(String(linhas.length))} />
          </KpiGrid>
          <Alert tone="info" title="Custo estimado">
            O custo usa o custo do produto na hora da baixa; quando ele não foi informado, o custo médio atual.
          </Alert>
          <ReportSection
            title="Perdas por produto"
            description="Do maior custo para o menor."
            flush
            actions={
              can("estoque.listar") && (
                <Link to={movimentos} className={buttonClasses({ size: "sm" })}>
                  Ver movimentos de perda
                </Link>
              )
            }
          >
            <ChartTable
              chart={<TopBarList subject="custo estimado das perdas por produto" items={linhas.map((l) => ({ key: l.produto_id, label: l.produto, value: l.custo_estimado, valueText: formatMoney(l.custo_estimado) }))} />}
              table={
                <DataTable
                  caption={`Perdas por produto, de ${formatDay(janela.de)} a ${formatDay(janela.ate)}`}
                  columns={columns}
                  rows={linhas}
                  getRowKey={(l) => l.produto_id}
                  emptyTitle="Nenhuma perda"
                />
              }
            />
          </ReportSection>
        </>
      )}
    </>
  );
}

/** Relatório de perdas: o que se perdeu no estoque no período e quanto isso custou. */
export function RelatorioPerdasPage() {
  usePageTitle("Relatório de perdas");
  const { update, reset, de, ate, error, valid } = useReportPeriod();
  const query = useRelatorioPerdas({ de: de || undefined, ate: ate || undefined }, valid);
  const printable = printableData(query, valid);

  return (
    <div>
      <PageHeader
        title="Relatório de perdas"
        description="O que foi perdido no estoque no período (perda, quebra ou vencimento) e quanto custou."
        actions={
          printable && (
            <PrintReport title="Relatório de perdas">
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <PeriodFilter label="Filtrar relatório de perdas" de={de} ate={ate} error={error} onChange={update} onClear={() => reset()} />
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
