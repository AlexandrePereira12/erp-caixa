import { useId } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/Card";
import { Input } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { formatDay } from "@/components/pdv/dates";
import { Choice } from "@/components/pdv/Choice";
import { useListParams } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useDashboard, type DashboardOut, type Periodo } from "./api";
import { FilterBar } from "./components/FilterBar";
import { KpiCard, KpiGrid } from "./components/KpiCard";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { validDay } from "./period";
import { CaixasAbertosSection, EstoqueBaixoSection, FormasPagamentoSection, MaisVendidosSection } from "./PainelSections";

function parsePeriodo(value: string | null): Periodo {
  return value === "semana" || value === "mes" ? value : "dia";
}

/** "Hoje, 14/10/2026" · "Semana de 12/10/2026 a 18/10/2026" · "Mês de 01/10/2026 a 31/10/2026". */
function periodTitle(periodo: Periodo, janela: { de: string; ate: string }, today: boolean): string {
  if (periodo === "dia") return `${today ? "Hoje" : "Dia"}, ${formatDay(janela.de)}`;
  return `${periodo === "semana" ? "Semana" : "Mês"} de ${formatDay(janela.de)} a ${formatDay(janela.ate)}`;
}

function Resumo({ data, today }: { data: DashboardOut; today: boolean }) {
  const { can } = usePermissions();
  const periodId = useId();
  const nowId = useId();
  // Os três períodos vêm na resposta; o ranking e as formas de pagamento seguem `periodo_detalhe`.
  const periodo = data[data.periodo_detalhe];
  const baixo = data.estoque_baixo_qtd;
  return (
    <>
      <section aria-labelledby={periodId} className="space-y-3">
        <h2 id={periodId} className="font-display text-xl font-semibold text-fg">
          {periodTitle(data.periodo_detalhe, periodo.janela, today)}
        </h2>
        <KpiGrid>
          <KpiCard featured label="Faturamento" value={formatMoney(periodo.faturamento)} hint="Vendas válidas, sem estornos" />
          <KpiCard label="Vendas" value={String(periodo.vendas_qtd)} hint="Contas fechadas no período" />
          <KpiCard label="Ticket médio" value={formatMoney(periodo.ticket_medio)} hint="Faturamento dividido pelas vendas" />
        </KpiGrid>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <MaisVendidosSection itens={data.mais_vendidos} />
        <FormasPagamentoSection formas={data.formas_pagamento} />
      </div>

      <section aria-labelledby={nowId} className="space-y-3">
        <h2 id={nowId} className="font-display text-xl font-semibold text-fg">
          Situação de agora
        </h2>
        <KpiGrid>
          <KpiCard
            label="A receber (fiado)"
            value={formatMoney(data.contas_a_receber.saldo_aberto)}
            hint={
              <>
                {data.contas_a_receber.titulos_abertos} {data.contas_a_receber.titulos_abertos === 1 ? "título em aberto" : "títulos em aberto"}
                {can("financeiro.listar") && (
                  <>
                    {" · "}
                    <Link to="/contas-receber" className="font-semibold text-brand-text underline-offset-2 hover:underline">
                      Ver contas
                    </Link>
                  </>
                )}
              </>
            }
          />
          <KpiCard label="Caixas abertos" value={String(data.caixas_abertos.length)} hint={data.caixas_abertos.length === 0 ? "Nenhum caixa aberto" : "Detalhes abaixo"} />
          <KpiCard
            label="Estoque baixo"
            value={String(baixo)}
            tone={baixo > 0 ? "warning" : "success"}
            hint={baixo > 0 ? (baixo === 1 ? "produto no mínimo ou abaixo" : "produtos no mínimo ou abaixo") : "Tudo acima do mínimo"}
          />
        </KpiGrid>
        <div className="grid gap-5 lg:grid-cols-2">
          <CaixasAbertosSection caixas={data.caixas_abertos} />
          <EstoqueBaixoSection itens={data.estoque_baixo} total={baixo} />
        </div>
      </section>
    </>
  );
}

/** Painel: o movimento do restaurante no dia, na semana ou no mês (GET /dashboard). */
export function PainelPage() {
  usePageTitle("Painel");
  const { params, update, reset } = useListParams();
  const periodo = parsePeriodo(params.get("periodo"));
  const referencia = validDay(params.get("referencia"));
  const query = useDashboard({ periodo, referencia: referencia || undefined });
  const printable = printableData(query);

  return (
    <div>
      <PageHeader
        title="Painel"
        description="O movimento do restaurante: faturamento, mais vendidos, formas de pagamento, caixas e estoque."
        actions={
          <>
            <Button onClick={() => void query.refetch()} loading={query.isFetching}>
              Atualizar
            </Button>
            {printable && (
              <PrintReport title="Painel">
                <Resumo data={printable} today={!referencia} />
              </PrintReport>
            )}
          </>
        }
      />
      <FilterBar label="Período do painel" hasFilters={Boolean(referencia)} onClear={() => reset(["periodo"])}>
        <div className="sm:col-span-2">
          <Choice<Periodo>
            legend="Período"
            name="periodo"
            columns={3}
            value={periodo}
            onChange={(value) => update({ periodo: value === "dia" ? undefined : value })}
            options={[
              ["dia", referencia ? "Dia" : "Hoje"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ]}
          />
        </div>
        <FormField label="Dia de referência" hint="Em branco: hoje. A semana e o mês são os que contêm este dia.">
          <Input type="date" className="min-h-11" value={referencia} onChange={(e) => update({ referencia: e.target.value || undefined })} />
        </FormField>
      </FilterBar>
      <ReportBoundary query={query}>{(data) => <Resumo data={data} today={!referencia} />}</ReportBoundary>
    </div>
  );
}
