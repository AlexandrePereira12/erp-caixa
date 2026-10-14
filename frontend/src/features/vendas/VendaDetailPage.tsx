import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ArrowLeftIcon } from "@/components/icons";
import { positiveIntParam } from "@/components/pdv/forms";
import { PrinterIcon } from "@/components/pdv/icons";
import { usePrint } from "@/components/pdv/PrintArea";
import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { ErrorState, LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { useCaixaAtual } from "@/features/caixa/api";
import { ApiError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";
import { useEstornarVenda, useVenda, vendasKey } from "./api";
import { VendaReceipt } from "./VendaReceipt";
import { useQueryClient } from "@tanstack/react-query";

/** Detalhe da venda: itens, pagamentos (com troco), totais, operador e estorno. */
export function VendaDetailPage() {
  const id = positiveIntParam(useParams().id);
  usePageTitle(id ? `Venda #${id}` : "Venda");
  const { can } = usePermissions();
  const toast = useToast();
  const client = useQueryClient();
  const query = useVenda(id);
  const estornar = useEstornarVenda();
  const caixa = useCaixaAtual({ enabled: can("caixa.operar") });
  const [estornando, setEstornando] = useState(false);
  const { print, printArea } = usePrint();

  if (id === undefined) return <ErrorState error={new Error("Venda inválida")} title="Venda não encontrada" />;
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a venda" />;

  const venda = query.data;
  const estornada = venda.estorno !== null;
  const temTroco = compareDecimal(venda.troco_total, "0") > 0;
  const semCaixa = caixa.data === null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Venda #${venda.id}`}
        description={`${formatDateTime(venda.created_at)} · operador ${venda.operador ?? "—"}`}
        actions={
          <>
            <Link to="/vendas" className={buttonClasses({ className: "min-h-11" })}>
              <ArrowLeftIcon width={16} height={16} />
              Vendas
            </Link>
            <Button className="min-h-11" onClick={print}>
              <PrinterIcon width={16} height={16} />
              Imprimir recibo
            </Button>
            {can("vendas.estornar") && !estornada && (
              <Button variant="danger" className="min-h-11" onClick={() => setEstornando(true)}>
                Estornar venda
              </Button>
            )}
          </>
        }
      />

      {estornada && venda.estorno && (
        <Alert tone="danger" title="Venda estornada">
          <p>
            Em {formatDateTime(venda.estorno.em)} por {venda.estorno.por ?? "—"}. Motivo: {venda.estorno.motivo}
          </p>
        </Alert>
      )}

      <Card className="p-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Cliente">{venda.cliente?.nome ?? "—"}</Info>
          <Info label="Comanda">
            {can("comandas.listar") ? (
              <Link to={`/comandas/${venda.comanda_id}`} className="text-brand-text underline-offset-2 hover:underline">
                #{venda.comanda_id}
              </Link>
            ) : (
              `#${venda.comanda_id}`
            )}
          </Info>
          <Info label="Caixa">
            {can("caixa.listar") ? (
              <Link to={`/caixas/${venda.caixa_id}`} className="text-brand-text underline-offset-2 hover:underline">
                #{venda.caixa_id}
              </Link>
            ) : (
              `#${venda.caixa_id}`
            )}
          </Info>
          <Info label="Situação">{estornada ? <Badge tone="danger">Estornada</Badge> : <Badge tone="success">Válida</Badge>}</Info>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-fg">Itens</h2>
          <ul className="divide-y divide-line">
            {venda.itens.map((item, i) => (
              <li key={`${item.produto_id}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-fg">
                    <span className="tabular-nums">{formatDecimal(item.quantidade, { maximumFractionDigits: 3 })}×</span> {item.descricao}
                  </p>
                  <p className="text-xs text-muted">{formatMoney(item.preco_unitario)} cada</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-fg">{formatMoney(item.total)}</p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-2 text-base font-semibold text-fg">Totais</h2>
            <dl className="space-y-1 text-sm">
              <Line label="Subtotal" value={formatMoney(venda.subtotal)} />
              <Line label="Desconto" value={compareDecimal(venda.desconto_total, "0") > 0 ? `− ${formatMoney(venda.desconto_total)}` : formatMoney(venda.desconto_total)} />
              <Line label="Acréscimo" value={formatMoney(venda.acrescimo_total)} />
              <Line label="Taxa de serviço" value={formatMoney(venda.taxa_servico)} />
              <div className="flex items-baseline justify-between border-t border-line pt-2 text-lg font-semibold text-fg">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(venda.total)}</dd>
              </div>
              <Line label="Troco" value={formatMoney(venda.troco_total)} strong={temTroco} />
            </dl>
          </Card>
          <Card>
            <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-fg">Pagamentos</h2>
            <ul className="divide-y divide-line text-sm">
              {venda.pagamentos.map((p) => (
                <li key={p.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-fg">
                      {p.forma}
                      {p.parcelas ? ` · ${p.parcelas}x` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.valor)}</span>
                  </div>
                  {p.valor_recebido && (
                    <p className="text-xs text-muted">
                      Recebido {formatMoney(p.valor_recebido)}
                      {p.troco ? ` · troco ${formatMoney(p.troco)}` : ""}
                    </p>
                  )}
                  {p.observacao && <p className="text-xs text-muted">{p.observacao}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={estornando}
        title={`Estornar venda #${venda.id}`}
        description={
          <div className="space-y-2">
            <p>
              O valor pago em dinheiro e demais formas volta pelo <strong>seu caixa aberto</strong> e o estoque dos itens é devolvido. Contas de fiado desta venda são canceladas. Esta ação não pode ser desfeita.
            </p>
            {semCaixa && (
              <p className="font-medium text-warning-text">
                Você não tem caixa aberto. Se a venda teve pagamento fora do fiado, o estorno será recusado até você{" "}
                <Link to="/caixa" className="underline">
                  abrir o caixa
                </Link>
                .
              </p>
            )}
          </div>
        }
        label="Motivo do estorno"
        confirmLabel="Estornar venda"
        errorHint={(error) =>
          error instanceof ApiError && error.codigo === "caixa_fechado" ? (
            <p className="mt-1">
              <Link to="/caixa" className="font-medium underline">
                Abra o seu caixa
              </Link>{" "}
              e tente de novo.
            </p>
          ) : error instanceof ApiError && error.codigo === "venda_ja_estornada" ? (
            <p className="mt-1">A venda foi atualizada na tela.</p>
          ) : null
        }
        onClose={() => setEstornando(false)}
        onSubmit={async (motivo) => {
          try {
            await estornar.mutateAsync({ id: venda.id, motivo });
            toast.success(`Venda #${venda.id} estornada.`);
          } catch (error) {
            if (error instanceof ApiError && error.codigo === "venda_ja_estornada") void client.invalidateQueries({ queryKey: vendasKey });
            throw error;
          }
        }}
      />
      {printArea(<VendaReceipt venda={venda} />)}
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

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "font-semibold text-fg" : ""}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
