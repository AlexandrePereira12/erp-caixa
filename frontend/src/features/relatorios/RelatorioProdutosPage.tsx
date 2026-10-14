import { Alert } from "@/components/Alert";
import { Badge, type BadgeTone } from "@/components/Badge";
import { PageHeader } from "@/components/Card";
import { Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/States";
import { formatDay } from "@/components/pdv/dates";
import { Choice } from "@/components/pdv/Choice";
import { useCategories } from "@/features/catalogo/api";
import { productTypeLabel } from "@/features/catalogo/types";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useRelatorioProdutos, type LinhaProdutos, type OrdenarProdutos, type ProdutoSemVendaOut, type RelatorioProdutosOut } from "./api";
import { TopBarList } from "./components/BarList";
import { PeriodFilter } from "./components/FilterBar";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { PeriodLine } from "./components/PeriodLine";
import { PrintReport } from "./components/PrintReport";
import { CategoriaSelect, TipoSelect, parseCategoria, parseTipo } from "./components/ProductFilters";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";
import { formatPercent } from "./format";
import { useReportPeriod } from "./period";

const ORDENAR_OPTIONS: [OrdenarProdutos, string][] = [
  ["receita", "Receita"],
  ["quantidade", "Quantidade"],
  ["margem", "Margem"],
];
const ORDENAR_LABEL: Record<OrdenarProdutos, string> = { receita: "receita", quantidade: "quantidade", margem: "margem" };

/** Limites de linhas oferecidos (o backend aceita de 1 a 500); 100 é o padrão. */
export const LIMITES = [25, 50, 100, 500] as const;
export const LIMITE_PADRAO = 100;

export function parseOrdenar(value: string | null | undefined): OrdenarProdutos {
  return value === "quantidade" || value === "margem" ? value : "receita";
}

export function parseLimite(value: string | null | undefined): number {
  return LIMITES.find((limite) => String(limite) === value) ?? LIMITE_PADRAO;
}

const CURVA_TONE: Record<LinhaProdutos["curva"], BadgeTone> = { A: "brand", B: "warning", C: "neutral" };

/** O que cada classe da curva ABC quer dizer (cortes do backend: 80% e 95% da receita acumulada). */
const CURVA_LEGENDA: [LinhaProdutos["curva"], string][] = [
  ["A", "até 80% da receita acumulada"],
  ["B", "até 95%"],
  ["C", "o restante"],
];

function CurvaLegenda() {
  return (
    <ul aria-label="Legenda da curva ABC" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      {CURVA_LEGENDA.map(([curva, text]) => (
        <li key={curva} className="flex items-center gap-1.5">
          <Badge tone={CURVA_TONE[curva]}>Curva {curva}</Badge>
          {text}
        </li>
      ))}
    </ul>
  );
}

function productColumns(): Column<LinhaProdutos>[] {
  return [
    {
      key: "produto",
      header: "Produto",
      cell: (l) => (
        <div className="min-w-36">
          <p className="break-words font-medium text-fg">{l.produto}</p>
          <p className="text-xs text-muted">
            {productTypeLabel(l.tipo)}
            {l.categoria ? ` · ${l.categoria}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "curva",
      header: "Curva ABC",
      cell: (l) => (
        <div className="space-y-1">
          <Badge tone={CURVA_TONE[l.curva]}>Curva {l.curva}</Badge>
          <p className="text-xs text-muted">{formatPercent(l.acumulado_pct)} acumulado</p>
        </div>
      ),
    },
    { key: "quantidade", header: "Quantidade", cell: (l) => `${formatDecimal(l.quantidade)} ${l.unidade}`, ...NUMERIC_COLUMN },
    { key: "receita", header: "Receita", cell: (l) => <span className="font-medium text-fg">{formatMoney(l.receita)}</span>, ...NUMERIC_COLUMN },
    {
      key: "custo",
      header: "Custo",
      // Sem custo conhecido o custo conta 0: dizer isso com texto, em vez de mostrar um "R$ 0,00" que parece real.
      cell: (l) => (l.sem_custo ? <Badge tone="warning">sem custo</Badge> : formatMoney(l.custo)),
      ...NUMERIC_COLUMN,
    },
    {
      key: "margem",
      header: "Margem",
      cell: (l) => (
        <div>
          <p className={l.sem_custo ? "text-muted" : "font-medium text-fg"}>{formatMoney(l.margem)}</p>
          <p className="text-xs text-muted">{formatPercent(l.margem_pct)}</p>
          {l.sem_custo && <p className="text-xs font-semibold text-warning-text">sem custo: margem cheia, não é real</p>}
        </div>
      ),
      ...NUMERIC_COLUMN,
    },
    { key: "participacao", header: "Participação", cell: (l) => formatPercent(l.participacao_pct), ...NUMERIC_COLUMN },
  ];
}

const SEM_VENDA_COLUMNS: Column<ProdutoSemVendaOut>[] = [
  {
    key: "produto",
    header: "Produto",
    cell: (p) => (
      <div>
        <p className="break-words font-medium text-fg">{p.produto}</p>
        <p className="text-xs text-muted">
          {productTypeLabel(p.tipo)}
          {p.categoria ? ` · ${p.categoria}` : ""}
        </p>
      </div>
    ),
  },
  {
    key: "saldo",
    header: "Saldo em estoque",
    cell: (p) => (p.saldo === null ? <span className="text-muted">Sem controle de estoque</span> : `${formatDecimal(p.saldo)} ${p.unidade}`),
    ...NUMERIC_COLUMN,
  },
];

function Resultado({ data }: { data: RelatorioProdutosOut }) {
  const { resumo, linhas, sem_venda: semVenda, janela } = data;
  const ordenar = parseOrdenar(data.ordenado_por);
  const sem = resumo.produtos_sem_custo;
  const margemNegativa = compareDecimal(resumo.margem_total, "0") < 0;

  return (
    <>
      <PeriodLine de={janela.de} ate={janela.ate}>
        {" · "}ordenado por {ORDENAR_LABEL[ordenar]}
      </PeriodLine>
      <KpiGrid>
        <KpiCard featured label="Receita" value={formatMoney(resumo.receita_total)} hint="Soma dos itens vendidos, antes de descontos e taxa de serviço" />
        <KpiCard label="Custo" value={formatMoney(resumo.custo_total)} hint="Custo do que foi vendido, na hora da venda" />
        <KpiCard
          label="Margem"
          value={formatMoney(resumo.margem_total)}
          tone={margemNegativa ? "danger" : "neutral"}
          hint={resumo.margem_pct_total === null ? "Sem receita no período" : `${formatPercent(resumo.margem_pct_total)} da receita`}
        />
        <KpiCard
          label="Produtos vendidos"
          value={formatDecimal(String(resumo.produtos_vendidos))}
          hint={sem > 0 ? `${sem} sem custo conhecido` : "Com venda válida no período"}
        />
      </KpiGrid>
      {sem > 0 && (
        <Alert tone="warning" title={`${sem} ${sem === 1 ? "produto sem custo conhecido" : "produtos sem custo conhecido"}`}>
          Para eles o custo conta R$ 0,00 e a margem aparece cheia, igual à receita; por isso a margem total pode estar acima da real. Na tabela, esses produtos vêm marcados com “sem custo”.
        </Alert>
      )}
      <ReportSection
        title="Produtos vendidos"
        description={
          linhas.length < resumo.produtos_vendidos
            ? `Mostrando ${linhas.length} de ${resumo.produtos_vendidos} produtos vendidos. A curva ABC e os totais consideram todos.`
            : "Vendas válidas, sem estornos."
        }
        flush
      >
        {linhas.length === 0 ? (
          <EmptyState title="Nenhum produto vendido neste período" description="Ajuste as datas, a categoria ou o tipo para ver outros produtos." />
        ) : (
          <>
            <div className="p-4">
              <TopBarList
                subject="receita dos primeiros produtos"
                noun="primeiros"
                items={linhas.map((l) => ({ key: l.produto_id, label: l.produto, value: l.receita, valueText: formatMoney(l.receita) }))}
              />
            </div>
            <div className="border-t border-line px-4 py-3">
              <CurvaLegenda />
            </div>
            <div className="border-t border-line">
              <DataTable
                caption={`Produtos vendidos, de ${formatDay(janela.de)} a ${formatDay(janela.ate)}, ordenados por ${ORDENAR_LABEL[ordenar]}`}
                columns={productColumns()}
                rows={linhas}
                getRowKey={(l) => l.produto_id}
                emptyTitle="Nenhum produto"
              />
            </div>
          </>
        )}
      </ReportSection>
      <ReportSection
        title="Produtos sem venda no período"
        description="Produtos ativos e à venda sem nenhuma venda válida no período, respeitando a categoria e o tipo escolhidos."
        flush
      >
        {semVenda.length === 0 ? (
          // Só é boa notícia quando houve venda: com tipo insumo/embalagem, por exemplo, nada é "à venda" e nada saiu.
          resumo.produtos_vendidos > 0 ? (
            <p className="p-4 text-sm text-success-text">Todos os produtos à venda tiveram saída no período.</p>
          ) : (
            <p className="p-4 text-sm text-muted">Nenhum produto à venda com esses filtros.</p>
          )
        ) : (
          <DataTable caption="Produtos sem venda no período" columns={SEM_VENDA_COLUMNS} rows={semVenda} getRowKey={(p) => p.produto_id} emptyTitle="Nenhum produto" />
        )}
      </ReportSection>
    </>
  );
}

/** Relatório de produtos: receita, custo, margem e curva ABC dos produtos vendidos, e os que não saíram. */
export function RelatorioProdutosPage() {
  usePageTitle("Relatório de produtos");
  const { params, update, reset, de, ate, error, valid } = useReportPeriod();
  const tipo = parseTipo(params.get("tipo"));
  const categoriaId = parseCategoria(params.get("categoria"));
  const ordenar = parseOrdenar(params.get("ordenar"));
  const limite = parseLimite(params.get("limite"));
  const { can } = usePermissions();
  const categorias = useCategories({ enabled: can("catalogo.listar") });
  const query = useRelatorioProdutos({ de: de || undefined, ate: ate || undefined, categoriaId, tipo, ordenar, limite }, valid);
  const printable = printableData(query, valid);
  const categoriaNome = categorias.data?.find((c) => c.id === categoriaId)?.nome;
  const filtros = [
    tipo && `Tipo: ${productTypeLabel(tipo)}`,
    categoriaId && `Categoria: ${categoriaNome ?? `nº ${categoriaId}`}`,
    `Ordenado por ${ORDENAR_LABEL[ordenar]}`,
    `Até ${limite} produtos`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title="Relatório de produtos"
        description="Receita, custo, margem e curva ABC dos produtos vendidos no período, e os produtos que não saíram."
        actions={
          printable && (
            <PrintReport title="Relatório de produtos" subtitle={filtros}>
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <PeriodFilter label="Filtrar relatório de produtos" de={de} ate={ate} error={error} onChange={update} onClear={() => reset()} hasOtherFilters={Boolean(tipo || categoriaId || ordenar !== "receita" || limite !== LIMITE_PADRAO)}>
        <TipoSelect value={tipo} onChange={(value) => update({ tipo: value })} />
        <CategoriaSelect value={categoriaId} onChange={(value) => update({ categoria: value })} />
        <FormField label="Quantas linhas">
          <Select className="min-h-11" value={String(limite)} onChange={(e) => update({ limite: e.target.value === String(LIMITE_PADRAO) ? undefined : e.target.value })}>
            {LIMITES.map((value) => (
              <option key={value} value={String(value)}>
                {value} produtos
              </option>
            ))}
          </Select>
        </FormField>
        <div className="sm:col-span-2 lg:col-span-4">
          <Choice<OrdenarProdutos> legend="Ordenar por" name="ordenar" columns={3} value={ordenar} onChange={(value) => update({ ordenar: value === "receita" ? undefined : value })} options={ORDENAR_OPTIONS} />
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
