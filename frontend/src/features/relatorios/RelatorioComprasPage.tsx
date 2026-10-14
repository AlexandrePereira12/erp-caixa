import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/States";
import { formatDay } from "@/components/pdv/dates";
import { Choice } from "@/components/pdv/Choice";
import { positiveIntParam } from "@/components/pdv/forms";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useRelatorioCompras, type AgruparCompras, type LinhaCompras, type RelatorioComprasOut } from "./api";
import { TopBarList } from "./components/BarList";
import { DayColumnChart } from "./components/DayColumnChart";
import { PeriodFilter } from "./components/FilterBar";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { PeriodLine } from "./components/PeriodLine";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ChartTable, ReportSection } from "./components/ReportSection";
import { SupplierFilter } from "./components/SupplierFilter";
import { NUMERIC_COLUMN } from "./columns";
import { useReportPeriod } from "./period";

const AGRUPAR_OPTIONS: [AgruparCompras, string][] = [
  ["dia", "Dia"],
  ["fornecedor", "Fornecedor"],
  ["produto", "Produto"],
  ["categoria", "Categoria"],
];

export function parseAgruparCompras(value: string | null | undefined): AgruparCompras {
  return value === "fornecedor" || value === "produto" || value === "categoria" ? value : "dia";
}

const SECTION_TITLE: Record<AgruparCompras, string> = {
  dia: "Compras por dia",
  fornecedor: "Compras por fornecedor",
  produto: "Compras por produto",
  categoria: "Compras por categoria",
};

const CHART_SUBJECT: Record<AgruparCompras, string> = {
  dia: "valor das compras por dia",
  fornecedor: "valor das compras por fornecedor",
  produto: "valor das compras por produto",
  categoria: "valor das compras por categoria",
};

/** Linhas que a API cria para o que não tem fornecedor/categoria: aparecem em tom de texto secundário. */
const SPECIAL_KEYS = new Set(["sem_fornecedor", "sem_categoria"]);

function columnsFor(agrupar: AgruparCompras): Column<LinhaCompras>[] {
  const label: Column<LinhaCompras> = {
    key: "rotulo",
    header: { dia: "Data", fornecedor: "Fornecedor", produto: "Produto", categoria: "Categoria" }[agrupar],
    cell: (l) => <span className={`break-words font-medium ${SPECIAL_KEYS.has(l.chave) ? "text-muted" : "text-fg"}`}>{l.rotulo}</span>,
  };
  // A quantidade só faz sentido por produto: somar unidades diferentes (kg e un) não tem significado.
  const quantity: Column<LinhaCompras> = {
    key: "quantidade",
    header: "Quantidade",
    cell: (l) => `${formatDecimal(l.quantidade)} ${l.unidade ?? ""}`.trim(),
    ...NUMERIC_COLUMN,
  };
  const entries: Column<LinhaCompras> = { key: "entradas", header: "Entradas", cell: (l) => formatDecimal(String(l.entradas_qtd)), ...NUMERIC_COLUMN };
  const value: Column<LinhaCompras> = {
    key: "valor",
    header: "Valor",
    cell: (l) => (
      <div className="space-y-1">
        <p className="font-medium text-fg">{formatMoney(l.valor)}</p>
        {l.entradas_sem_custo > 0 && <Badge tone="warning">{l.entradas_sem_custo} sem custo</Badge>}
      </div>
    ),
    ...NUMERIC_COLUMN,
  };
  return agrupar === "produto" ? [label, quantity, entries, value] : [label, entries, value];
}

function Grafico({ data, agrupar }: { data: RelatorioComprasOut; agrupar: AgruparCompras }) {
  if (agrupar === "dia" && data.linhas.length > 0) {
    return <DayColumnChart janela={data.janela} linhas={data.linhas.map((l) => ({ chave: l.chave, valor: l.valor }))} subject={CHART_SUBJECT.dia} />;
  }
  return <TopBarList subject={CHART_SUBJECT[agrupar]} items={data.linhas.map((l) => ({ key: l.chave, label: l.rotulo, value: l.valor, valueText: formatMoney(l.valor) }))} />;
}

function Resultado({ data }: { data: RelatorioComprasOut }) {
  const { resumo, linhas, janela } = data;
  // A tabela segue o agrupamento que a API devolveu: ao trocar o filtro, a resposta anterior continua coerente.
  const agrupar = parseAgruparCompras(data.agrupado_por);
  const sem = resumo.entradas_sem_custo;

  return (
    <>
      <PeriodLine de={janela.de} ate={janela.ate} />
      {resumo.quantidade_entradas === 0 ? (
        <ReportSection title="Sem compras no período" flush>
          <EmptyState title="Nenhuma compra neste período" description="Compra é uma entrada de estoque. Ajuste as datas ou o fornecedor, ou registre a entrada em Estoque." />
        </ReportSection>
      ) : (
        <>
          <KpiGrid>
            <KpiCard featured label="Valor total" value={formatMoney(resumo.valor_total)} hint="Quantidade vezes o custo de cada entrada" />
            <KpiCard label="Entradas" value={formatDecimal(String(resumo.quantidade_entradas))} hint="Entradas de estoque no período" />
            <KpiCard label="Itens" value={formatDecimal(String(resumo.itens))} hint="Produtos diferentes comprados" />
          </KpiGrid>
          {sem > 0 && (
            <Alert tone="warning" title={`${sem} ${sem === 1 ? "entrada sem custo informado" : "entradas sem custo informado"}`}>
              Elas valem R$ 0,00 no valor total e nas linhas abaixo, então o valor das compras pode estar menor que o real. Informe o custo ao registrar a entrada de estoque.
            </Alert>
          )}
          <ReportSection title={SECTION_TITLE[agrupar]} flush>
            <ChartTable
              chart={linhas.length > 0 ? <Grafico data={data} agrupar={agrupar} /> : <p className="text-sm text-muted">Sem linhas para o gráfico.</p>}
              table={
                <DataTable
                  caption={`${SECTION_TITLE[agrupar]}, de ${formatDay(janela.de)} a ${formatDay(janela.ate)}`}
                  columns={columnsFor(agrupar)}
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

/** Relatório de compras: o que entrou no estoque no período e quanto custou, por dia, fornecedor, produto ou categoria. */
export function RelatorioComprasPage() {
  usePageTitle("Relatório de compras");
  const { params, update, reset, de, ate, error, valid } = useReportPeriod();
  const agrupar = parseAgruparCompras(params.get("agrupar"));
  const fornecedorId = positiveIntParam(params.get("fornecedor"));
  const fornecedorNome = params.get("fnome") ?? "";
  const query = useRelatorioCompras({ de: de || undefined, ate: ate || undefined, agrupar, fornecedorId }, valid);
  const printable = printableData(query, valid);
  const fornecedor = fornecedorId ? { id: fornecedorId, nome: fornecedorNome || `Fornecedor nº ${fornecedorId}` } : null;

  return (
    <div>
      <PageHeader
        title="Relatório de compras"
        description="O que entrou no estoque no período e quanto custou: por dia, fornecedor, produto ou categoria."
        actions={
          printable && (
            <PrintReport title="Relatório de compras" subtitle={fornecedor ? `Fornecedor: ${fornecedor.nome}` : undefined}>
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <PeriodFilter label="Filtrar relatório de compras" de={de} ate={ate} error={error} onChange={update} onClear={() => reset(["agrupar"])} hasOtherFilters={Boolean(fornecedorId)}>
        <SupplierFilter value={fornecedor} onChange={(supplier) => update({ fornecedor: supplier ? String(supplier.id) : undefined, fnome: supplier?.nome })} />
        <div className="sm:col-span-2 lg:col-span-4">
          <Choice<AgruparCompras> legend="Agrupar por" name="agrupar" columns={4} value={agrupar} onChange={(value) => update({ agrupar: value === "dia" ? undefined : value })} options={AGRUPAR_OPTIONS} />
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
