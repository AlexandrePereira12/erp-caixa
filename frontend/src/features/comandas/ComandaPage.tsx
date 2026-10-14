import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ArrowLeftIcon } from "@/components/icons";
import { positiveIntParam } from "@/components/pdv/forms";
import { BanIcon, ClockIcon, PencilIcon, PrinterIcon, SplitIcon, SwapIcon, UserIcon } from "@/components/pdv/icons";
import type { Comanda } from "@/components/pdv/types";
import { comandaLocal, comandaStatusLabel, comandaStatusTone } from "@/components/pdv/labels";
import { usePrint } from "@/components/pdv/PrintArea";
import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { useNow } from "@/components/pdv/useNow";
import { elapsedLabel } from "@/components/pdv/dates";
import { ErrorState, LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { useComanda, useComandaActions } from "./api";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { ComandaReceipt } from "./ComandaReceipt";
import { DivideDialog, HeaderDialog, TransferDialog } from "./ComandaDialogs";
import { FecharContaDialog } from "./FecharContaDialog";
import { ItemsPanel } from "./ItemsPanel";
import { ProductPanel } from "./ProductPanel";
import { TotalsBox } from "./TotalsBox";

type DialogKind = "fechar" | "dados" | "transferir" | "dividir" | "cancelar" | null;
type Tab = "produtos" | "comanda";

/** Tela de atendimento: produtos, itens, ajustes, totais da API e ações da comanda. */
export function ComandaPage() {
  const id = positiveIntParam(useParams().id);
  usePageTitle(id ? `Comanda #${id}` : "Comanda");
  const toast = useToast();
  const { can } = usePermissions();
  const now = useNow();
  const query = useComanda(id);
  const actions = useComandaActions(id ?? 0);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const { print, printArea } = usePrint();

  if (id === undefined) return <ErrorState error={new Error("Comanda inválida")} title="Comanda não encontrada" />;
  if (query.isLoading) return <LoadingBlock label="Carregando comanda…" />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a comanda" />;

  const comanda = query.data;
  const aberta = comanda.status === "aberta";
  const aguardando = comanda.status === "aguardando_pagamento";
  const emAndamento = aberta || aguardando;
  const itensAtivos = comanda.itens.filter((i) => i.status === "ativo").length;
  // No celular: comanda vazia abre em Produtos; comanda com itens abre na lista (quem volta à mesa quer conferir).
  const tab: Tab = chosenTab ?? (itensAtivos > 0 ? "comanda" : "produtos");

  const canLancar = aberta && can("comandas.lancar");
  const showProducts = canLancar && can("catalogo.listar");

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const primary: ReactNode = emAndamento && (
    <>
      {aberta && can("comandas.lancar") && (
        <Button className="min-h-11 flex-1" disabled={itensAtivos === 0 || actions.askBill.isPending} loading={actions.askBill.isPending} onClick={() => void run(() => actions.askBill.mutateAsync())}>
          Pedir conta
        </Button>
      )}
      {aguardando && can("comandas.lancar") && (
        <Button className="min-h-11 flex-1" loading={actions.reopen.isPending} onClick={() => void run(() => actions.reopen.mutateAsync())}>
          Reabrir comanda
        </Button>
      )}
      {can("comandas.fechar") && (
        <Button variant="primary" className="min-h-11 flex-[2]" disabled={itensAtivos === 0} onClick={() => setDialog("fechar")}>
          Fechar conta
        </Button>
      )}
    </>
  );

  return (
    <div className="pb-44 lg:pb-0">
      <Header
        comanda={comanda}
        now={now}
        canEditHeader={emAndamento && can("comandas.lancar")}
        canTransfer={emAndamento && comanda.tipo === "mesa" && can("comandas.transferir")}
        canCancel={emAndamento && can("comandas.cancelar")}
        onOpen={setDialog}
        onPrint={print}
      />

      {!emAndamento && (
        <Alert tone={comanda.status === "fechada" ? "success" : "info"} title={`Comanda ${comandaStatusLabel(comanda.status).toLowerCase()} — somente leitura`} className="mb-4">
          {comanda.status === "fechada" && comanda.venda_id !== null && (
            <p>
              Fechada em {formatDateTime(comanda.fechada_em)}.{" "}
              {can("vendas.listar") ? (
                <Link to={`/vendas/${comanda.venda_id}`} className="font-medium underline">
                  Ver venda #{comanda.venda_id}
                </Link>
              ) : (
                <>Venda #{comanda.venda_id}</>
              )}
            </p>
          )}
          {comanda.status === "cancelada" && (
            <p>
              Cancelada em {formatDateTime(comanda.fechada_em)}. Motivo: {comanda.cancelada_motivo ?? "—"}
            </p>
          )}
        </Alert>
      )}
      {aguardando && (
        <Alert tone="warning" title="Conta pedida: itens travados" className="mb-4">
          Não é possível lançar, editar ou cancelar itens enquanto a conta estiver pedida. Ajustes de desconto continuam disponíveis. Use “Reabrir comanda” para alterar os itens.
        </Alert>
      )}
      {aberta && !can("comandas.lancar") && <Alert tone="info" className="mb-4">Seu perfil pode consultar esta comanda, mas não lançar itens.</Alert>}

      {showProducts && (
        <div role="tablist" aria-label="Seções da comanda" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 lg:hidden">
          {(["produtos", "comanda"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`painel-${t}`}
              onClick={() => setTab(t)}
              className={`min-h-11 rounded-md text-sm font-semibold ${tab === t ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {t === "produtos" ? "Produtos" : `Comanda (${itensAtivos})`}
            </button>
          ))}
        </div>
      )}

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${showProducts ? "lg:grid-cols-[minmax(0,1fr)_26rem]" : "mx-auto max-w-3xl"} lg:items-start`}>
        {showProducts && (
          <div id="painel-produtos" role="tabpanel" aria-labelledby="tab-produtos" className={tab === "produtos" ? "" : "hidden lg:block"}>
            <ProductPanel onAdd={(produto, quantidade, observacao) => {
              // Quem está lançando segue em Produtos: o 1º item não pode virar a tela para a lista.
              setTab((atual) => atual ?? "produtos");
              return actions.add(produto, quantidade, observacao);
            }} />
          </div>
        )}

        <div className="space-y-4 lg:sticky lg:top-20">
          <div
            id="painel-comanda"
            role={showProducts ? "tabpanel" : undefined}
            aria-labelledby={showProducts ? "tab-comanda" : undefined}
            className={`${showProducts && tab === "produtos" ? "hidden lg:block" : ""} lg:max-h-[calc(100dvh-22rem)] lg:overflow-y-auto lg:pr-1`}
          >
            <ItemsPanel
              items={comanda.itens}
              pending={actions.pending}
              canEdit={canLancar}
              canCancel={aberta && can("comandas.cancelar_item_proprio")}
              onEdit={(itemId, body) => actions.editItem.mutateAsync({ itemId, body })}
              onCancel={(itemId, motivo) => actions.cancelItem.mutateAsync({ itemId, motivo })}
            />
            <AdjustmentsPanel
              ajustes={comanda.ajustes}
              canEdit={emAndamento && can("comandas.desconto")}
              onAdd={(body) => actions.addAdjustment.mutateAsync(body)}
              onRemove={(ajusteId) => actions.removeAdjustment.mutateAsync(ajusteId)}
            />
          </div>
          <TotalsBox comanda={comanda} busy={actions.busy} actions={primary} />
        </div>
      </div>

      {dialog === "fechar" && <FecharContaDialog comanda={comanda} onClose={() => setDialog(null)} />}
      {dialog === "dados" && <HeaderDialog comanda={comanda} onClose={() => setDialog(null)} onSubmit={(body) => actions.editHeader.mutateAsync(body)} />}
      {dialog === "transferir" && <TransferDialog comanda={comanda} onClose={() => setDialog(null)} onSubmit={(mesaId) => actions.transfer.mutateAsync(mesaId)} />}
      {dialog === "dividir" && <DivideDialog comanda={comanda} onClose={() => setDialog(null)} />}
      <ReasonDialog
        open={dialog === "cancelar"}
        title="Cancelar comanda"
        description={<>Cancelar a comanda #{comanda.id}? Ela deixa de aceitar pedidos e a mesa é liberada. Isto não pode ser desfeito.</>}
        label="Motivo do cancelamento"
        confirmLabel="Cancelar comanda"
        onClose={() => setDialog(null)}
        onSubmit={(motivo) => actions.cancel.mutateAsync(motivo)}
      />
      {printArea(<ComandaReceipt comanda={comanda} />)}
    </div>
  );
}

function Header({
  comanda,
  now,
  canEditHeader,
  canTransfer,
  canCancel,
  onOpen,
  onPrint,
}: {
  comanda: Comanda;
  now: number;
  canEditHeader: boolean;
  canTransfer: boolean;
  canCancel: boolean;
  onOpen: (dialog: DialogKind) => void;
  onPrint: () => void;
}) {
  const { can } = usePermissions();
  const cliente = comanda.cliente?.nome ?? comanda.nome_cliente;
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={can("mesas.listar") ? "/mesas" : "/comandas"} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm text-brand-text hover:underline">
            <ArrowLeftIcon width={16} height={16} />
            {can("mesas.listar") ? "Salão" : "Comandas"}
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            Comanda #{comanda.id}
            <span className="text-muted">· {comandaLocal(comanda)}</span>
            <Badge tone={comandaStatusTone(comanda.status)} className="text-sm">
              {comandaStatusLabel(comanda.status)}
            </Badge>
          </h1>
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Cliente</dt>
          <UserIcon width={16} height={16} />
          <dd className="text-fg">{cliente ?? "Sem cliente"}</dd>
        </div>
        {comanda.num_pessoas && (
          <div className="flex items-center gap-1.5">
            <dt>Pessoas:</dt>
            <dd className="text-fg">{comanda.num_pessoas}</dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <ClockIcon width={16} height={16} />
          <dt className="sr-only">Aberta há</dt>
          <dd className="text-fg" title={formatDateTime(comanda.aberta_em)}>
            {comanda.fechada_em ? `Aberta em ${formatDateTime(comanda.aberta_em)}` : `Aberta há ${elapsedLabel(comanda.aberta_em, now)}`}
          </dd>
        </div>
        {comanda.endereco_entrega && (
          <div className="flex gap-1.5">
            <dt>Entrega:</dt>
            <dd className="text-fg">{comanda.endereco_entrega}</dd>
          </div>
        )}
      </dl>
      {comanda.observacao && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm italic text-fg">{comanda.observacao}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {canEditHeader && (
          <Button className="min-h-11" onClick={() => onOpen("dados")}>
            <PencilIcon width={16} height={16} />
            Dados
          </Button>
        )}
        {canTransfer && (
          <Button className="min-h-11" onClick={() => onOpen("transferir")}>
            <SwapIcon width={16} height={16} />
            Transferir de mesa
          </Button>
        )}
        {(comanda.status === "aberta" || comanda.status === "aguardando_pagamento") && (
          <Button className="min-h-11" onClick={() => onOpen("dividir")}>
            <SplitIcon width={16} height={16} />
            Dividir conta
          </Button>
        )}
        <Button className="min-h-11" onClick={onPrint}>
          <PrinterIcon width={16} height={16} />
          Imprimir resumo
        </Button>
        {canCancel && (
          <Button variant="ghost" className="min-h-11 text-danger-text" onClick={() => onOpen("cancelar")}>
            <BanIcon width={16} height={16} />
            Cancelar comanda
          </Button>
        )}
      </div>
    </Card>
  );
}
