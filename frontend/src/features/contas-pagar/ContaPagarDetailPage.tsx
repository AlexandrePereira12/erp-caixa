import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ArrowLeftIcon } from "@/components/icons";
import { formatDay } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import { ErrorState, LoadingBlock } from "@/components/States";
import { ApiError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useContaPagar, type BaixaPagar } from "./api";
import { BaixaPagarDialog } from "./BaixaPagarDialog";
import { CancelarContaDialog } from "./CancelarContaDialog";
import { ContaFormDialog } from "./ContaFormDialog";
import { EstornarBaixaDialog } from "./EstornarBaixaDialog";
import { HINT_CLASS, SITUACAO_LABEL, saldoVisivel, situacaoTone, vencimentoHint } from "./labels";

type Dialog = { kind: "pagar" | "editar" | "cancelar" } | { kind: "estornar"; baixaId: number } | null;

function Info({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

const isEstorno = (b: BaixaPagar) => b.estorno_de_id !== null || compareDecimal(b.valor, "0") < 0;

/** Detalhe da conta a pagar: dados, valores, pagamentos (estornos entram como linha negativa) e as ações do estado atual. */
export function ContaPagarDetailPage() {
  const id = positiveIntParam(useParams().id);
  usePageTitle(id ? `Conta a pagar #${id}` : "Conta a pagar");
  const { can } = usePermissions();
  const query = useContaPagar(id);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (id === undefined) return <ErrorState error={new ApiError(404, "nao_encontrado", "O número da conta no endereço da página não é válido.")} title="Conta não encontrada" />;
  if (query.isLoading) return <LoadingBlock />;
  if (!query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a conta" />;

  const t = query.data;
  const aberta = t.status === "aberto";
  const podePagar = can("contas_pagar.baixar") && aberta;
  const podeEditar = can("contas_pagar.editar") && t.status !== "cancelado";
  // Só sem pagamento líquido: com pagamento vigente é preciso estornar antes (o backend confere).
  const podeCancelar = can("contas_pagar.cancelar") && aberta && compareDecimal(t.valor_pago, "0") === 0;
  const podeEstornar = can("contas_pagar.cancelar") && t.status !== "cancelado";
  const hint = vencimentoHint(t);
  const estornando = dialog?.kind === "estornar" ? t.baixas.find((b) => b.id === dialog.baixaId) : undefined;

  const columns: Column<BaixaPagar>[] = [
    {
      key: "data",
      header: "Data",
      cell: (b) => <span className="whitespace-nowrap font-medium text-fg">{formatDay(b.data_pagamento)}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (b) => (
        <div className="flex flex-wrap gap-1">
          {isEstorno(b) ? <Badge tone="danger">Estorno</Badge> : <Badge>Pagamento</Badge>}
          {b.estornada && <Badge tone="warning">Estornado</Badge>}
        </div>
      ),
    },
    { key: "forma", header: "Forma", cell: (b) => <span>{b.forma}</span> },
    {
      key: "valor",
      header: "Valor",
      cell: (b) => <span className={`font-semibold tabular-nums ${isEstorno(b) ? "text-danger-text" : b.estornada ? "text-muted line-through" : "text-fg"}`}>{formatMoney(b.valor)}</span>,
      className: "md:text-right",
      headerClassName: "md:text-right",
    },
    {
      key: "registrado",
      header: "Registrado por",
      cell: (b) => (
        <div>
          <p>{b.usuario_nome ?? "—"}</p>
          <p className="text-xs text-muted">{formatDateTime(b.created_at)}</p>
        </div>
      ),
    },
    { key: "observacao", header: "Observação", cell: (b) => (b.observacao ? <span>{b.observacao}</span> : <span className="text-muted">—</span>) },
  ];
  if (podeEstornar) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (b) =>
        !isEstorno(b) && !b.estornada ? (
          <Button variant="ghost" className="min-h-11 text-danger-text" aria-label={`Estornar pagamento de ${formatMoney(b.valor)} em ${formatDay(b.data_pagamento)}`} onClick={() => setDialog({ kind: "estornar", baixaId: b.id })}>
            Estornar
          </Button>
        ) : null,
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Conta a pagar #${t.id}`}
        description={t.descricao}
        actions={
          <>
            <Link to="/contas-pagar" className={buttonClasses({ className: "min-h-11" })}>
              <ArrowLeftIcon width={16} height={16} />
              Contas a pagar
            </Link>
            {podePagar && (
              <Button variant="primary" className="min-h-11" onClick={() => setDialog({ kind: "pagar" })}>
                Pagar
              </Button>
            )}
            {podeEditar && (
              <Button className="min-h-11" onClick={() => setDialog({ kind: "editar" })}>
                Editar
              </Button>
            )}
            {podeCancelar && (
              <Button variant="danger" className="min-h-11" onClick={() => setDialog({ kind: "cancelar" })}>
                Cancelar conta
              </Button>
            )}
          </>
        }
      />

      {t.status === "cancelado" && (
        <Alert tone="info" title="Conta cancelada">
          {t.cancelado_motivo ?? "Sem motivo informado."}
        </Alert>
      )}

      <Card className="p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Fornecedor">{t.fornecedor ? t.fornecedor.nome : <span className="text-muted">Despesa avulsa</span>}</Info>
          <Info label="Categoria">{t.categoria ? t.categoria.nome : <span className="text-muted">Sem categoria</span>}</Info>
          <Info label="Documento">{t.documento ?? <span className="text-muted">—</span>}</Info>
          <Info label="Situação">
            <Badge tone={situacaoTone(t)}>{SITUACAO_LABEL[t.situacao]}</Badge>
          </Info>
          <Info label="Vencimento">
            {formatDay(t.vencimento)}
            {hint && <span className={`block text-xs ${HINT_CLASS[hint.tone]}`}>{hint.text}</span>}
          </Info>
          <Info label="Paga em">{t.pago_em ? formatDay(t.pago_em) : <span className="text-muted">—</span>}</Info>
          <Info label="Lançada em">{formatDateTime(t.created_at)}</Info>
          {t.observacao && (
            <Info label="Observação" className="sm:col-span-2 lg:col-span-4">
              <span className="whitespace-pre-line">{t.observacao}</span>
            </Info>
          )}
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="sr-only">Valores</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Info label="Valor original">
            <span className="text-xl font-bold tabular-nums">{formatMoney(t.valor_original)}</span>
          </Info>
          <Info label="Valor pago">
            <span className="text-xl font-bold tabular-nums">{formatMoney(t.valor_pago)}</span>
          </Info>
          <Info label="Saldo a pagar">
            <span className="text-2xl font-bold tabular-nums">{formatMoney(saldoVisivel(t))}</span>
          </Info>
        </dl>
      </Card>

      <Card>
        <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-fg">Pagamentos</h2>
        <DataTable
          caption="Pagamentos e estornos da conta"
          columns={columns}
          rows={t.baixas}
          getRowKey={(b) => b.id}
          emptyTitle="Nenhum pagamento registrado"
          emptyDescription={podePagar ? "Use “Pagar” para registrar o primeiro pagamento." : "Esta conta ainda não teve pagamentos."}
        />
      </Card>

      {dialog?.kind === "pagar" && <BaixaPagarDialog titulo={t} onClose={() => setDialog(null)} />}
      {dialog?.kind === "editar" && <ContaFormDialog titulo={t} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cancelar" && <CancelarContaDialog titulo={t} onClose={() => setDialog(null)} />}
      {dialog?.kind === "estornar" && estornando && <EstornarBaixaDialog titulo={t} baixa={estornando} onClose={() => setDialog(null)} />}
    </div>
  );
}
