import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Button, buttonClasses } from "@/components/Button";
import { Checkbox, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { PlusIcon } from "@/components/icons";
import { PrinterIcon } from "@/components/pdv/icons";
import { estoqueInsuficienteDe, pagamentoDiferenteDe } from "@/components/pdv/errorInfo";
import { usePrint } from "@/components/pdv/PrintArea";
import type { Comanda, Venda } from "@/components/pdv/types";
import { LoadingBlock } from "@/components/States";
import { useCaixaAtual } from "@/features/caixa/api";
import { useSaldoAberto } from "@/features/financeiro/api";
import { useFormas } from "@/features/formas-pagamento/api";
import { VendaReceipt } from "@/features/vendas/VendaReceipt";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";
import { comandaKey, useFecharComanda } from "./api";
import { calcularPrevia, checkLinhas, montarCorpo, novaLinha, podeConfirmar, toInputText, type Linha } from "./fechamento";
import { PagamentoLinha } from "./PagamentoLinha";

export interface FecharContaDialogProps {
  comanda: Comanda;
  onClose: () => void;
}

/**
 * Fechar conta. O total vem da API (comanda.totais.total). A "falta cobrir" e o "troco previsto"
 * são prévias de exibição; ao confirmar o backend valida de novo e devolve a venda com o troco real.
 */
export function FecharContaDialog({ comanda, onClose }: FecharContaDialogProps) {
  const formId = useId();
  const client = useQueryClient();
  const { can } = usePermissions();
  const total = comanda.totais.total;
  const totalZero = compareDecimal(total, "0") === 0;

  const canListFormas = can("formas_pagamento.listar");
  const formasQuery = useFormas({ ativa: true, enabled: canListFormas });
  const caixaQuery = useCaixaAtual({ enabled: can("caixa.operar") });
  const fechar = useFecharComanda();

  const formas = useMemo(() => (formasQuery.data ?? []).filter((f) => f.tipo !== "fiado" || can("vendas.fiado")), [formasQuery.data, can]);

  const seq = useRef(0);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [cliente, setCliente] = useState<ClientValue | null>(comanda.cliente);
  const [error, setError] = useState<unknown>(null);
  const [estoque, setEstoque] = useState<ApiError | null>(null);
  const [autorizar, setAutorizar] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [venda, setVenda] = useState<Venda | null>(null);
  const { print, printArea } = usePrint();

  const checks = useMemo(() => checkLinhas(linhas, formas), [linhas, formas]);
  const previa = useMemo(() => calcularPrevia(total, checks), [total, checks]);
  const temFiado = checks.some((c) => c.forma?.tipo === "fiado");
  const semCaixa = caixaQuery.data === null;
  const justificativaOk = !autorizar || justificativa.trim().length >= 1;
  const pronto = podeConfirmar(total, linhas, checks, previa) && !semCaixa && justificativaOk && (!temFiado || cliente !== null);

  const saldo = useSaldoAberto(cliente?.id, temFiado && can("financeiro.listar"));

  function add(init: Partial<Linha> = {}) {
    const key = ++seq.current;
    setLinhas((list) => [...list, novaLinha(key, init)]);
  }

  function payAll(formaId: number) {
    const key = ++seq.current;
    setLinhas([novaLinha(key, { formaId: String(formaId), valor: toInputText(total) })]);
    setError(null);
  }

  function patch(key: number, change: Partial<Linha>) {
    setLinhas((list) => list.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  async function submit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!pronto || fechar.isPending) return;
    setError(null);
    try {
      const body = montarCorpo(linhas, checks, {
        clienteId: cliente?.id,
        ...(estoque && autorizar ? { permitirEstoqueNegativo: true, justificativaEstoque: justificativa.trim() } : {}),
      });
      setVenda(await fechar.mutateAsync({ id: comanda.id, body }));
    } catch (err) {
      setError(err);
      if (err instanceof ApiError) {
        if (err.codigo === "estoque_insuficiente") setEstoque(err);
        // O total pode ter mudado (outro aparelho) ou a comanda já foi fechada: relê a comanda.
        if (err.codigo === "pagamento_diferente_do_total" || err.codigo === "comanda_nao_aberta") void client.invalidateQueries({ queryKey: comandaKey(comanda.id) });
      }
    }
  }

  const pending = fechar.isPending;

  if (venda) {
    return (
      <Dialog
        open
        onClose={onClose}
        size="md"
        title={`Venda #${venda.id} concluída`}
        footer={
          <>
            <Button className="min-h-11" onClick={print}>
              <PrinterIcon width={16} height={16} />
              Imprimir recibo
            </Button>
            {can("vendas.listar") && (
              <Link to={`/vendas/${venda.id}`} className={buttonClasses({ className: "min-h-11" })}>
                Ver venda
              </Link>
            )}
            <Button variant="primary" className="min-h-11" data-autofocus onClick={onClose}>
              Concluir
            </Button>
          </>
        }
      >
        <SaleSuccess venda={venda} />
        {printArea(<VendaReceipt venda={venda} />)}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      dismissible={!pending}
      title="Fechar conta"
      description={`Comanda #${comanda.id}. Os valores abaixo vêm do sistema; confira antes de confirmar.`}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending} disabled={!pronto}>
            {estoque && autorizar ? "Confirmar com estoque negativo" : totalZero ? "Fechar sem pagamento" : "Confirmar fechamento"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <section aria-label="Resumo do pagamento" className="rounded-md border border-line bg-surface-2 p-3" aria-live="polite">
          <p className="text-sm font-semibold text-muted">Total da comanda</p>
          <p className="font-display text-4xl font-semibold tabular-nums text-fg">{formatMoney(total)}</p>
          {!totalZero && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Pagamentos informados (prévia)</dt>
              <dd className="text-right font-medium tabular-nums">{formatMoney(previa.soma)}</dd>
              {compareDecimal(previa.excesso, "0") > 0 ? (
                <>
                  <dt className="font-medium text-danger-text">Excede o total em</dt>
                  <dd className="text-right font-semibold tabular-nums text-danger-text">{formatMoney(previa.excesso)}</dd>
                </>
              ) : (
                <>
                  <dt className="font-medium text-fg">{previa.bate ? "Total coberto" : "Falta cobrir (prévia)"}</dt>
                  <dd className={`text-right font-semibold tabular-nums ${previa.bate ? "text-success-text" : "text-warning-text"}`}>{formatMoney(previa.falta)}</dd>
                </>
              )}
              {compareDecimal(previa.troco, "0") > 0 && (
                <>
                  <dt className="text-muted">Troco previsto (prévia)</dt>
                  <dd className="text-right font-medium tabular-nums">{formatMoney(previa.troco)}</dd>
                </>
              )}
            </dl>
          )}
          {totalZero && <p className="mt-1 text-sm text-muted">Comanda sem valor a pagar: confirme sem informar pagamentos.</p>}
          <p className="mt-2 text-xs text-muted">Prévia de conferência: o sistema valida e recalcula tudo ao confirmar.</p>
        </section>

        {semCaixa && (
          <Alert tone="warning" title="Você não tem caixa aberto">
            Abra o seu caixa para receber valores.{" "}
            <Link to="/caixa" className="font-medium underline">
              Ir para o Caixa
            </Link>
          </Alert>
        )}
        {!canListFormas && <Alert tone="warning">Você não tem permissão para listar as formas de pagamento; não é possível registrar pagamentos aqui. Peça acesso a um gerente.</Alert>}
        {canListFormas && formasQuery.isLoading && <LoadingBlock label="Carregando formas de pagamento…" />}
        {formasQuery.error && <Alert tone="danger">{errorMessage(formasQuery.error)}</Alert>}

        {!totalZero && formas.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-fg">Pagamento rápido</p>
            <div className="flex flex-wrap gap-2">
              {formas.map((f) => (
                <Button key={f.id} className="min-h-11" disabled={pending} onClick={() => payAll(f.id)}>
                  Pagar tudo em {f.nome}
                </Button>
              ))}
            </div>
          </div>
        )}

        {linhas.length > 0 && (
          <div className="space-y-3">
            {linhas.map((linha, i) => (
              <PagamentoLinha
                key={linha.key}
                index={i}
                linha={linha}
                check={checks[i]!}
                formas={formas}
                onChange={(change) => patch(linha.key, change)}
                onRemove={() => setLinhas((list) => list.filter((l) => l.key !== linha.key))}
              />
            ))}
          </div>
        )}

        {!totalZero && formas.length > 0 && (
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() => add(compareDecimal(previa.falta, "0") > 0 && linhas.length > 0 ? { valor: toInputText(previa.falta) } : {})}
          >
            <PlusIcon width={16} height={16} />
            {linhas.length === 0 ? "Adicionar pagamento" : "Dividir por valor (outra forma)"}
          </Button>
        )}

        <div className="space-y-2">
          <ClientPicker
            label={temFiado ? "Cliente (obrigatório para fiado)" : "Cliente da venda (opcional)"}
            value={cliente}
            onChange={setCliente}
            disabled={pending}
            error={temFiado && cliente === null ? "Informe o cliente para vender em fiado." : undefined}
          />
          {temFiado && cliente && <FiadoHint cliente={cliente} saldo={saldo.data} loading={saldo.isLoading} />}
        </div>

        {estoque && (
          <div className="space-y-2 rounded-md border-l-4 border-warning-text bg-warning-soft p-3 text-sm text-warning-text">
            <p className="font-semibold">Estoque insuficiente</p>
            <EstoqueMensagem error={estoque} />
            {can("estoque.permitir_negativo") ? (
              <>
                <Checkbox
                  label="Autorizar estoque negativo para esta venda"
                  description="O saldo ficará negativo e a justificativa fica registrada."
                  checked={autorizar}
                  onChange={(e) => setAutorizar(e.target.checked)}
                />
                {autorizar && (
                  <FormField label="Justificativa do estoque negativo" error={!justificativaOk ? "Informe a justificativa." : undefined} required>
                    <Textarea rows={2} maxLength={300} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
                  </FormField>
                )}
              </>
            ) : (
              <p>Você não tem permissão para autorizar estoque negativo. Peça a um gerente ou ajuste os itens da comanda.</p>
            )}
          </div>
        )}

        {error !== null && !(estoque && error instanceof ApiError && error.codigo === "estoque_insuficiente") && <ErroFechamento error={error} />}
      </form>
    </Dialog>
  );
}

function SaleSuccess({ venda }: { venda: Venda }) {
  const temTroco = compareDecimal(venda.troco_total, "0") > 0;
  return (
    <div className="space-y-4" role="status">
      <div className="rounded-md border border-success-text/60 bg-success-soft p-4 text-center">
        <p className="text-sm font-semibold text-success-text">Total da venda</p>
        <p className="font-display text-4xl font-semibold tabular-nums text-fg">{formatMoney(venda.total)}</p>
      </div>
      <div className={`rounded-md border p-4 text-center ${temTroco ? "border-brand-text bg-brand-soft" : "border-line bg-surface-2"}`}>
        <p className="text-sm font-semibold text-muted">Troco</p>
        <p className="font-display text-5xl font-semibold tabular-nums text-fg">{formatMoney(venda.troco_total)}</p>
        {!temTroco && <p className="text-sm text-muted">Sem troco a devolver.</p>}
      </div>
      <ul className="divide-y divide-line rounded-md border border-line text-sm">
        {venda.pagamentos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
            <span className="font-medium text-fg">
              {p.forma}
              {p.parcelas ? ` · ${p.parcelas}x` : ""}
            </span>
            <span className="tabular-nums">{formatMoney(p.valor)}</span>
            {p.valor_recebido && (
              <span className="w-full text-xs text-muted">
                Recebido {formatMoney(p.valor_recebido)}
                {p.troco ? ` · troco ${formatMoney(p.troco)}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiadoHint({ cliente, saldo, loading }: { cliente: ClientValue; saldo: ReturnType<typeof useSaldoAberto>["data"]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted">Consultando limite de fiado…</p>;
  const aceita = saldo ? saldo.aceita_fiado : cliente.cliente?.aceita_fiado;
  return (
    <div className="space-y-1 text-sm">
      {aceita === false && <Alert tone="warning">{cliente.nome} não está habilitado para fiado. O backend vai recusar; habilite no cadastro do cliente (o cadastro rápido não habilita).</Alert>}
      {saldo && aceita !== false && (
        <p className="text-muted">
          Em aberto: <strong className="text-fg">{formatMoney(saldo.saldo_aberto)}</strong> ·{" "}
          {saldo.limite_disponivel === null ? "sem limite definido" : <>limite disponível: <strong className="text-fg">{formatMoney(saldo.limite_disponivel)}</strong></>}
        </p>
      )}
    </div>
  );
}

function EstoqueMensagem({ error }: { error: ApiError }) {
  const info = estoqueInsuficienteDe(error);
  if (!info) return <p>{error.message}</p>;
  return (
    <p>
      <strong>{info.produto}</strong>: saldo {info.saldo.replace(".", ",")}, necessário {info.necessario.replace(".", ",")}.
    </p>
  );
}

function ErroFechamento({ error }: { error: unknown }) {
  const codigo = error instanceof ApiError ? error.codigo : "";
  let hint: ReactNode = null;
  let message = errorMessage(error);
  if (codigo === "caixa_fechado") {
    hint = (
      <p className="mt-1">
        <Link to="/caixa" className="font-medium underline">
          Abrir o caixa
        </Link>{" "}
        e tentar de novo.
      </p>
    );
  } else if (codigo === "pagamento_diferente_do_total") {
    const info = error instanceof ApiError ? pagamentoDiferenteDe(error) : null;
    if (info) message = `Os pagamentos somam ${formatMoney(info.informado)} e o total da comanda é ${formatMoney(info.total)}.`;
    hint = <p className="mt-1">O total pode ter mudado: ele foi recarregado. Ajuste os valores e confirme de novo.</p>;
  } else if (codigo === "comanda_nao_aberta") {
    hint = <p className="mt-1">A comanda foi recarregada. Se ela já foi fechada, consulte a venda em Vendas.</p>;
  } else if (codigo === "fiado_sem_cliente") {
    hint = <p className="mt-1">Escolha o cliente na seção acima.</p>;
  } else if (codigo === "limite_fiado_excedido" || codigo === "cliente_sem_fiado") {
    hint = <p className="mt-1">Use outra forma de pagamento ou peça a um gerente para ajustar o fiado do cliente.</p>;
  }
  return (
    <Alert tone="danger">
      <p>{message}</p>
      {hint}
    </Alert>
  );
}
