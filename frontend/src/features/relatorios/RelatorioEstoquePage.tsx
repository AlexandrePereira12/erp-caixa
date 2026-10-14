import { Link } from "react-router-dom";
import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/Card";
import { Checkbox } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState } from "@/components/States";
import { useCategories } from "@/features/catalogo/api";
import { formatCost } from "@/features/catalogo/decimalInput";
import { productTypeLabel } from "@/features/catalogo/types";
import { buttonClasses } from "@/components/Button";
import { useListParams } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useRelatorioEstoque, type LinhaEstoque, type RelatorioEstoqueOut } from "./api";
import { FilterBar } from "./components/FilterBar";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { CategoriaSelect, TipoSelect, parseCategoria, parseTipo } from "./components/ProductFilters";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";

function Situacao({ linha }: { linha: LinhaEstoque }) {
  if (linha.abaixo_minimo) return <Badge tone="danger">Abaixo do mínimo</Badge>;
  if (compareDecimal(linha.estoque_minimo, "0") === 0) return <span className="text-xs text-muted">Sem mínimo definido</span>;
  return <Badge tone="success">Em dia</Badge>;
}

function Resultado({ data }: { data: RelatorioEstoqueOut }) {
  const { can } = usePermissions();
  const { linhas } = data;
  const columns: Column<LinhaEstoque>[] = [
    {
      key: "produto",
      header: "Produto",
      cell: (l) => (
        <div className="min-w-40">
          <p className="break-words font-medium text-fg">{l.produto}</p>
          <p className="text-xs text-muted">
            {productTypeLabel(l.tipo)}
            {l.categoria ? ` · ${l.categoria}` : ""}
          </p>
        </div>
      ),
    },
    { key: "situacao", header: "Situação", cell: (l) => <Situacao linha={l} /> },
    {
      key: "saldo",
      header: "Saldo",
      cell: (l) => (
        <span className={l.abaixo_minimo ? "font-semibold text-danger-text" : "text-fg"}>
          {formatDecimal(l.saldo)} {l.unidade}
        </span>
      ),
      ...NUMERIC_COLUMN,
    },
    { key: "minimo", header: "Mínimo", cell: (l) => `${formatDecimal(l.estoque_minimo)} ${l.unidade}`, ...NUMERIC_COLUMN },
    { key: "custo", header: "Custo médio", cell: (l) => formatCost(l.custo_medio), ...NUMERIC_COLUMN },
    { key: "valor", header: "Valor em estoque", cell: (l) => <span className="font-medium text-fg">{formatMoney(l.valor_em_estoque)}</span>, ...NUMERIC_COLUMN },
  ];

  return (
    <>
      <KpiGrid>
        <KpiCard featured label="Valor em estoque" value={formatMoney(data.valor_total_em_estoque)} hint="Saldo de cada produto vezes o custo médio" />
        <KpiCard label="Produtos" value={formatDecimal(String(data.produtos_qtd))} hint="Com controle de estoque, nos filtros escolhidos" />
        <KpiCard
          label="Abaixo do mínimo"
          value={formatDecimal(String(data.abaixo_minimo_qtd))}
          tone={data.abaixo_minimo_qtd > 0 ? "danger" : "success"}
          hint={data.abaixo_minimo_qtd > 0 ? "No mínimo ou abaixo: hora de repor" : "Nenhum produto precisa de reposição"}
        />
      </KpiGrid>
      <ReportSection
        title="Posição do estoque"
        description="Saldo, mínimo e valor de cada produto."
        flush
        actions={
          can("estoque.listar") && (
            <Link to="/estoque" className={buttonClasses({ size: "sm" })}>
              Ver saldos e movimentos
            </Link>
          )
        }
      >
        {linhas.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado" description="Ajuste ou limpe os filtros para ver mais produtos." />
        ) : (
          <DataTable caption="Posição do estoque por produto" columns={columns} rows={linhas} getRowKey={(l) => l.produto_id} emptyTitle="Nenhum produto" />
        )}
      </ReportSection>
    </>
  );
}

/** Relatório de estoque: posição e valor do estoque, com os itens abaixo do mínimo em destaque. */
export function RelatorioEstoquePage() {
  usePageTitle("Relatório de estoque");
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();
  const tipo = parseTipo(params.get("tipo"));
  const categoriaId = parseCategoria(params.get("categoria"));
  const abaixoMinimo = params.get("abaixo_minimo") === "1";
  const categorias = useCategories({ enabled: can("catalogo.listar") });
  const query = useRelatorioEstoque({ tipo, categoriaId, abaixoMinimo });
  const printable = printableData(query);
  const categoriaNome = (categorias.data ?? []).find((c) => c.id === categoriaId)?.nome;
  const filtros = [tipo && `Tipo: ${productTypeLabel(tipo)}`, categoriaId && `Categoria: ${categoriaNome ?? `nº ${categoriaId}`}`, abaixoMinimo && "Só abaixo do mínimo"].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader
        title="Relatório de estoque"
        description="Quanto há de cada produto, quanto vale e o que está abaixo do mínimo."
        actions={
          printable && (
            <PrintReport title="Relatório de estoque" subtitle={filtros || "Sem filtros: todos os produtos com controle de estoque."}>
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <FilterBar label="Filtrar relatório de estoque" hasFilters={Boolean(tipo || categoriaId || abaixoMinimo)} onClear={() => reset()}>
        <TipoSelect value={tipo} onChange={(value) => update({ tipo: value })} />
        <CategoriaSelect value={categoriaId} onChange={(value) => update({ categoria: value })} />
        <div className="flex items-end pb-2.5">
          <Checkbox label="Só abaixo do mínimo" checked={abaixoMinimo} onChange={(e) => update({ abaixo_minimo: e.target.checked ? "1" : undefined })} />
        </div>
      </FilterBar>
      <ReportBoundary query={query}>{(data) => <Resultado data={data} />}</ReportBoundary>
    </div>
  );
}
