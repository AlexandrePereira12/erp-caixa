import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ArrowLeftIcon } from "@/components/icons";
import { formatDay } from "@/components/pdv/dates";
import { positiveIntParam } from "@/components/pdv/forms";
import { comandaStatusLabel, comandaTipoLabel, tituloStatusLabel, tituloStatusTone } from "@/components/pdv/labels";
import { ErrorState, LoadingBlock } from "@/components/States";
import { errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useHistoricoCliente, useSaldoAberto, useTitulo } from "./api";
import { BaixaDialog } from "./BaixaDialog";

/** Detalhe da conta a receber: baixas (inclui estornos negativos), saldo/limite do cliente e histórico resumido. */
export function TituloDetailPage() {
  const id = positiveIntParam(useParams().id);
  usePageTitle(id ? `Conta #${id}` : "Conta a receber");
  const { can } = usePermissions();
  const query = useTitulo(id);
  const [baixando, setBaixando] = useState(false);

  if (id === undefined) return <ErrorState error={new Error("Conta inválida")} title="Conta não encontrada" />;
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a conta" />;

  const t = query.data;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Conta #${t.id}`}
        description={t.descricao}
        actions={
          <>
            <Link to="/contas-receber" className={buttonClasses({ className: "min-h-11" })}>
              <ArrowLeftIcon width={16} height={16} />
              Contas a receber
            </Link>
            {can("financeiro.baixar") && t.status === "aberto" && (
              <Button variant="primary" className="min-h-11" onClick={() => setBaixando(true)}>
                Registrar recebimento
              </Button>
            )}
          </>
        }
      />

      {t.status === "cancelado" && <Alert tone="info" title="Conta cancelada">{t.cancelado_motivo ?? "Sem motivo informado."}</Alert>}

      <Card className="p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Cliente">{t.pessoa.nome}</Info>
          <Info label="Situação">
            <Badge tone={tituloStatusTone(t.status)}>{tituloStatusLabel(t.status)}</Badge>
          </Info>
          <Info label="Vencimento">{formatDay(t.vencimento, "Sem vencimento")}</Info>
          <Info label="Venda de origem">
            {t.venda_id !== null && can("vendas.listar") ? (
              <Link to={`/vendas/${t.venda_id}`} className="text-brand-text underline-offset-2 hover:underline">
                Venda #{t.venda_id}
              </Link>
            ) : t.venda_id !== null ? (
              `Venda #${t.venda_id}`
            ) : (
              "—"
            )}
          </Info>
          <Info label="Valor original">{formatMoney(t.valor_original)}</Info>
          <Info label="Valor pago">{formatMoney(t.valor_pago)}</Info>
          <Info label="Saldo">
            <strong className="text-base text-fg">{formatMoney(t.saldo)}</strong>
          </Info>
          <Info label="Criada em">{formatDateTime(t.created_at)}</Info>
        </dl>
      </Card>

      <Card>
        <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-fg">Baixas</h2>
        {t.baixas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Nenhum recebimento registrado.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {t.baixas.map((b) => {
              const estorno = b.estorno_de_id !== null || compareDecimal(b.valor, "0") < 0;
              return (
                <li key={b.id} className="flex flex-wrap items-start justify-between gap-x-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">
                      {estorno ? "Estorno" : "Recebimento"} · {b.forma}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(b.created_at)} · {b.usuario_nome ?? "—"} · caixa #{b.caixa_id}
                      {b.observacao ? ` · ${b.observacao}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${estorno ? "text-danger-text" : "text-fg"}`}>{formatMoney(b.valor)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ClienteCard pessoaId={t.pessoa.id} nome={t.pessoa.nome} />
      {baixando && <BaixaDialog titulo={t} onClose={() => setBaixando(false)} />}
    </div>
  );
}

function ClienteCard({ pessoaId, nome }: { pessoaId: number; nome: string }) {
  const saldo = useSaldoAberto(pessoaId);
  const [showHistory, setShowHistory] = useState(false);
  const history = useHistoricoCliente(pessoaId, showHistory);

  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-fg">Cliente: {nome}</h2>
      {saldo.isLoading ? (
        <p className="mt-2 text-sm text-muted">Consultando saldo…</p>
      ) : saldo.error ? (
        <p className="mt-2 text-sm text-danger-text">{errorMessage(saldo.error)}</p>
      ) : saldo.data ? (
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Em aberto">
            {formatMoney(saldo.data.saldo_aberto)} <span className="text-muted">({saldo.data.titulos_abertos} {saldo.data.titulos_abertos === 1 ? "conta" : "contas"})</span>
          </Info>
          <Info label="Fiado">{saldo.data.aceita_fiado ? "Habilitado" : "Não habilitado"}</Info>
          <Info label="Limite de fiado">{compareDecimal(saldo.data.limite_fiado, "0") > 0 ? formatMoney(saldo.data.limite_fiado) : "Sem limite definido"}</Info>
          <Info label="Limite disponível">{saldo.data.limite_disponivel === null ? "—" : formatMoney(saldo.data.limite_disponivel)}</Info>
        </dl>
      ) : null}

      {!showHistory ? (
        <Button className="mt-3 min-h-11" onClick={() => setShowHistory(true)}>
          Ver histórico do cliente
        </Button>
      ) : history.isLoading ? (
        <p className="mt-3 text-sm text-muted">Carregando histórico…</p>
      ) : history.error ? (
        <p className="mt-3 text-sm text-danger-text">{errorMessage(history.error)}</p>
      ) : history.data ? (
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <HistoryList title="Últimas comandas" empty="Sem comandas.">
            {history.data.comandas.slice(0, 5).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>
                  #{c.id} · {comandaTipoLabel(c.tipo)} · {comandaStatusLabel(c.status)}
                </span>
                <span className="tabular-nums">{formatMoney(c.total)}</span>
              </li>
            ))}
          </HistoryList>
          <HistoryList title="Últimos pagamentos" empty="Sem pagamentos.">
            {history.data.pagamentos.slice(0, 5).map((p, i) => (
              <li key={`${p.venda_id}-${i}`} className="flex justify-between gap-2">
                <span>
                  Venda #{p.venda_id} · {p.forma}
                </span>
                <span className="tabular-nums">{formatMoney(p.valor)}</span>
              </li>
            ))}
          </HistoryList>
          <HistoryList title="Últimas contas" empty="Sem contas.">
            {history.data.titulos.slice(0, 5).map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <Link to={`/contas-receber/${t.id}`} className="text-brand-text underline-offset-2 hover:underline">
                  #{t.id} · {tituloStatusLabel(t.status)}
                </Link>
                <span className="tabular-nums">{formatMoney(t.saldo)}</span>
              </li>
            ))}
          </HistoryList>
        </div>
      ) : null}
    </Card>
  );
}

function HistoryList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-fg">{title}</h3>
      {children.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="space-y-1 text-sm">{children}</ul>}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}
