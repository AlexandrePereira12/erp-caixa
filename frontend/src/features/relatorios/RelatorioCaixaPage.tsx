import { Link } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/Card";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/States";
import { positiveIntParam } from "@/components/pdv/forms";
import { caixaStatusLabel, caixaStatusTone } from "@/components/pdv/labels";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useOperadores, useRelatorioCaixa, type LinhaCaixa, type RelatorioCaixaOut } from "./api";
import { DIFERENCA_LABEL, DiferencaValue, diferencaKind, type DiferencaKind } from "./components/Diferenca";
import { PeriodFilter } from "./components/FilterBar";
import { KpiCard, KpiGrid, type KpiTone } from "./components/KpiCard";
import { PeriodLine } from "./components/PeriodLine";
import { PrintReport } from "./components/PrintReport";
import { ReportBoundary, printableData } from "./components/ReportBoundary";
import { ReportSection } from "./components/ReportSection";
import { NUMERIC_COLUMN } from "./columns";
import { useReportPeriod } from "./period";

type PorForma = RelatorioCaixaOut["por_forma"][number];

const DIFF_TONE: Record<DiferencaKind, KpiTone> = { sobra: "warning", falta: "danger", confere: "success" };
const DIFF_HINT: Record<DiferencaKind, string> = {
  sobra: "O contado passou do esperado.",
  falta: "O contado ficou abaixo do esperado.",
  confere: "O contado bate com o esperado.",
};

function Resultado({ data }: { data: RelatorioCaixaOut }) {
  const { can } = usePermissions();
  const { caixas, janela } = data;
  const fechados = caixas.filter((c) => c.status === "fechado").length;
  const abertos = caixas.length - fechados;
  // Só há o que conferir quando algum caixa fechou: sem fechamento, "confere" seria enganoso.
  const kind = fechados > 0 ? diferencaKind(data.diferenca_total) : undefined;

  const columns: Column<LinhaCaixa>[] = [
    {
      key: "caixa",
      header: "Caixa",
      cell: (c) => (
        <div className="min-w-32">
          {can("caixa.listar") ? (
            <Link to={`/caixas/${c.caixa_id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-text underline-offset-2 hover:underline md:min-h-0">
              #{c.caixa_id}
            </Link>
          ) : (
            <span className="font-semibold text-fg">#{c.caixa_id}</span>
          )}
          <p className="break-words text-xs text-muted">{c.operador}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (c) => (
        <div className="space-y-1">
          <Badge tone={caixaStatusTone(c.status)}>{caixaStatusLabel(c.status)}</Badge>
          <div className="whitespace-nowrap text-xs text-muted">
            <p>Abriu {formatDateTime(c.aberto_em)}</p>
            <p>{c.fechado_em ? `Fechou ${formatDateTime(c.fechado_em)}` : "Ainda aberto"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "vendas",
      header: "Vendas",
      cell: (c) => (
        <div>
          <p className="font-medium text-fg">{formatMoney(c.vendas_total)}</p>
          <p className="text-xs text-muted">
            {formatDecimal(String(c.vendas_qtd))} {c.vendas_qtd === 1 ? "venda" : "vendas"}
          </p>
        </div>
      ),
      ...NUMERIC_COLUMN,
    },
    {
      key: "movimentos",
      header: "Movimentos",
      cell: (c) => (
        <ul className="space-y-0.5 text-xs text-muted">
          <li>
            Sangrias <span className="tabular-nums text-fg">{formatMoney(c.sangrias)}</span>
          </li>
          <li>
            Reforços <span className="tabular-nums text-fg">{formatMoney(c.reforcos)}</span>
          </li>
          <li>
            Estornos <span className="tabular-nums text-fg">{formatMoney(c.estornos_total)}</span>
          </li>
        </ul>
      ),
    },
    {
      key: "esperado",
      header: "Esperado",
      cell: (c) => (
        <div>
          <p className="font-medium text-fg">{formatMoney(c.esperado_total)}</p>
          <p className="text-xs text-muted">Inicial {formatMoney(c.valor_abertura)}</p>
        </div>
      ),
      ...NUMERIC_COLUMN,
    },
    { key: "diferenca", header: "Diferença", cell: (c) => <DiferencaValue value={c.diferenca_total} />, ...NUMERIC_COLUMN },
  ];

  const formaColumns: Column<PorForma>[] = [
    { key: "forma", header: "Forma de pagamento", cell: (f) => <span className="break-words font-medium text-fg">{f.forma}</span> },
    { key: "esperado", header: "Esperado", cell: (f) => formatMoney(f.esperado), ...NUMERIC_COLUMN },
    { key: "contado", header: "Contado", cell: (f) => formatMoney(f.contado), ...NUMERIC_COLUMN },
    { key: "diferenca", header: "Diferença", cell: (f) => <DiferencaValue value={f.diferenca} />, ...NUMERIC_COLUMN },
  ];

  return (
    <>
      <PeriodLine de={janela.de} ate={janela.ate}>
        {" · "}considera os caixas que começaram neste período
      </PeriodLine>
      {caixas.length === 0 ? (
        <ReportSection title="Sem caixas no período" flush>
          <EmptyState title="Nenhum caixa neste período" description="Ajuste as datas ou o operador para ver outros caixas." />
        </ReportSection>
      ) : (
        <>
          <KpiGrid>
            <KpiCard
              featured
              label="Diferença total"
              value={kind ? formatMoney(data.diferenca_total) : "—"}
              tone={kind ? DIFF_TONE[kind] : "neutral"}
              hint={
                kind ? (
                  <>
                    <Badge tone={kind === "falta" ? "danger" : kind === "sobra" ? "warning" : "success"}>{DIFERENCA_LABEL[kind]}</Badge> {DIFF_HINT[kind]}
                  </>
                ) : (
                  "Nenhum caixa fechado no período: ainda não há o que conferir."
                )
              }
            />
            <KpiCard label="Caixas no período" value={formatDecimal(String(data.caixas_qtd))} hint={`${fechados} ${fechados === 1 ? "fechado" : "fechados"}, ${abertos} ${abertos === 1 ? "aberto" : "abertos"}`} />
          </KpiGrid>
          {abertos > 0 && (
            <Alert tone="info" title="Caixas abertos ficam fora da diferença">
              A diferença só existe depois do fechamento, quando o operador conta o dinheiro.
            </Alert>
          )}
          <ReportSection title="Fechamentos" description="Um caixa por linha, com o esperado e a diferença de cada um." flush>
            <DataTable caption="Caixas do período, por operador" columns={columns} rows={caixas} getRowKey={(c) => c.caixa_id} emptyTitle="Nenhum caixa" />
          </ReportSection>
          {data.por_forma.length > 0 && (
            <ReportSection title="Diferença por forma de pagamento" description="Somada em todos os caixas fechados do período." flush>
              <DataTable caption="Esperado, contado e diferença por forma de pagamento" columns={formaColumns} rows={data.por_forma} getRowKey={(f) => f.forma_pagamento_id} emptyTitle="Nenhuma forma" />
            </ReportSection>
          )}
        </>
      )}
    </>
  );
}

/** Lista de operadores, para quem pode listar usuários; sem a permissão, campo com o número do usuário. */
function OperadorField({ value, onChange }: { value: string; onChange: (value: string | undefined) => void }) {
  const { can } = usePermissions();
  const operadores = useOperadores(can("usuarios.listar"));
  if (can("usuarios.listar") && !operadores.isError) {
    const users = operadores.data?.itens ?? [];
    return (
      <FormField label="Operador">
        <Select className="min-h-11" value={value} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Todos os operadores</option>
          {value && !users.some((u) => String(u.id) === value) && <option value={value}>{`Operador nº ${value}`}</option>}
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.suspenso ? `${u.nome} (suspenso)` : u.nome}
            </option>
          ))}
        </Select>
      </FormField>
    );
  }
  const invalid = value !== "" && positiveIntParam(value) === undefined;
  return (
    <FormField label="Operador (nº do usuário)" hint="O número do usuário que operou o caixa. Em branco: todos." error={invalid ? "Use só números, maior que zero." : undefined}>
      <Input className="min-h-11" inputMode="numeric" autoComplete="off" placeholder="Ex.: 3" value={value} onChange={(e) => onChange(e.target.value.trim() || undefined)} />
    </FormField>
  );
}

/** Relatório de caixa: fechamentos do período, esperado x contado e a diferença por operador. */
export function RelatorioCaixaPage() {
  usePageTitle("Relatório de caixa");
  const { params, update, reset, de, ate, error, valid } = useReportPeriod();
  const operadorRaw = params.get("operador") ?? "";
  const operadorId = positiveIntParam(operadorRaw);
  const query = useRelatorioCaixa({ de: de || undefined, ate: ate || undefined, operadorId }, valid);
  const printable = printableData(query, valid);

  return (
    <div>
      <PageHeader
        title="Relatório de caixa"
        description="Fechamentos de caixa do período: quanto era esperado, quanto foi contado e a diferença."
        actions={
          printable && (
            <PrintReport title="Relatório de caixa" subtitle={operadorId ? `Operador nº ${operadorId}` : undefined}>
              <Resultado data={printable} />
            </PrintReport>
          )
        }
      />
      <PeriodFilter label="Filtrar relatório de caixa" de={de} ate={ate} error={error} onChange={update} onClear={() => reset()} hasOtherFilters={Boolean(operadorRaw)}>
        <OperadorField value={operadorRaw} onChange={(value) => update({ operador: value })} />
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
