import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { trimDecimalText } from "@/components/pdv/forms";
import { BanIcon, PencilIcon } from "@/components/pdv/icons";
import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { Stepper } from "@/components/pdv/Stepper";
import type { ComandaItem } from "@/components/pdv/types";
import { Spinner } from "@/components/Spinner";
import { LoadingBlock } from "@/components/States";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { api } from "@/lib/api/client";
import { compareDecimal, parseDecimalInput } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import { useQuery } from "@tanstack/react-query";
import type { PendingAdd } from "./api";

export interface ItemsPanelProps {
  items: ComandaItem[];
  pending: PendingAdd[];
  /** Itens podem ser editados (comanda aberta, com comandas.lancar). */
  canEdit: boolean;
  /** Itens podem ser cancelados (comanda aberta, com a permissão de cancelar o próprio item). */
  canCancel: boolean;
  onEdit: (itemId: number, body: { quantidade?: string; observacao?: string | null }) => Promise<unknown>;
  onCancel: (itemId: number, motivo: string) => Promise<unknown>;
}

const qty = (value: string) => formatDecimal(value, { maximumFractionDigits: 3 });

/** Lista de itens: ativos com editar/cancelar e cancelados riscados (com o motivo). */
export function ItemsPanel({ items, pending, canEdit, canCancel, onEdit, onCancel }: ItemsPanelProps) {
  const [editing, setEditing] = useState<ComandaItem | null>(null);
  const [canceling, setCanceling] = useState<ComandaItem | null>(null);
  const activeCount = items.filter((i) => i.status === "ativo").length;

  return (
    <section aria-label="Itens da comanda">
      <h2 className="mb-2 text-base font-semibold text-fg">
        Itens <span className="font-normal text-muted">({activeCount})</span>
      </h2>

      {items.length === 0 && pending.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Nenhum item lançado. Toque em um produto para lançar.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((item) => {
            const cancelled = item.status !== "ativo";
            return (
              <li key={item.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-medium ${cancelled ? "text-muted line-through" : "text-fg"}`}>
                      <span className="tabular-nums">{qty(item.quantidade)}×</span> {item.descricao}
                    </p>
                    <p className={`text-xs ${cancelled ? "text-muted line-through" : "text-muted"}`}>{formatMoney(item.preco_unitario)} cada</p>
                    {item.observacao && <p className={`text-sm italic ${cancelled ? "text-muted line-through" : "text-fg"}`}>{item.observacao}</p>}
                    {cancelled && (
                      <p className="mt-0.5 text-xs text-danger-text">
                        <Badge tone="danger" className="mr-1">
                          Cancelado
                        </Badge>
                        {item.cancelado_motivo}
                      </p>
                    )}
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums ${cancelled ? "text-muted line-through" : "text-fg"}`}>{formatMoney(item.total)}</p>
                </div>
                {!cancelled && (canEdit || canCancel) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {canEdit && (
                      <Button variant="ghost" className="min-h-11" onClick={() => setEditing(item)} aria-label={`Editar ${item.descricao}`}>
                        <PencilIcon width={16} height={16} />
                        Editar
                      </Button>
                    )}
                    {canCancel && (
                      <Button variant="ghost" className="min-h-11 text-danger-text" onClick={() => setCanceling(item)} aria-label={`Cancelar ${item.descricao}`}>
                        <BanIcon width={16} height={16} />
                        Cancelar item
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={`pending-${p.key}`} className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2.5 text-muted" aria-busy="true">
              <p className="min-w-0 truncate">
                <span className="tabular-nums">{qty(p.quantidade)}×</span> {p.descricao}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 text-xs">
                <Spinner />
                Enviando…
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && <EditItemDialog item={editing} onClose={() => setEditing(null)} onSubmit={(body) => onEdit(editing.id, body)} />}
      <ReasonDialog
        open={canceling !== null}
        title="Cancelar item"
        description={canceling ? <>Cancelar <strong>{canceling.descricao}</strong>? O item fica riscado na comanda e não entra no total.</> : undefined}
        label="Motivo do cancelamento"
        confirmLabel="Cancelar item"
        errorHint={(error) =>
          error instanceof ApiError && error.codigo === "cancelamento_exige_gerente" ? (
            <p className="mt-1 font-medium">Peça a um gerente para cancelar este item: o prazo para cancelar o próprio lançamento acabou ou o item foi lançado por outra pessoa.</p>
          ) : null
        }
        onClose={() => setCanceling(null)}
        onSubmit={(motivo) => (canceling ? onCancel(canceling.id, motivo) : Promise.resolve())}
      />
    </section>
  );
}

/** Casas decimais da unidade do produto do item (GET /produtos/{id}); sem acesso, aceita até 3 e o backend confere. */
function useCasasDoItem(produtoId: number) {
  return useQuery({
    queryKey: ["produtos", "detalhe", produtoId],
    queryFn: ({ signal }) => api.get("/produtos/{produto_id}", { path: { produto_id: produtoId }, signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function EditItemDialog({ item, onClose, onSubmit }: { item: ComandaItem; onClose: () => void; onSubmit: (body: { quantidade?: string; observacao?: string | null }) => Promise<unknown> }) {
  const formId = useId();
  const produto = useCasasDoItem(item.produto_id);
  const casas = produto.data?.unidade.casas_decimais ?? 3;
  const [quantidade, setQuantidade] = useState(() => trimDecimalText(item.quantidade));
  const [observacao, setObservacao] = useState(item.observacao ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDecimalInput(quantidade, casas);
    if (parsed === null || compareDecimal(parsed, "0") <= 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    if (compareDecimal(parsed, item.quantidade) < 0) {
      setError("Só é possível aumentar a quantidade. Para reduzir, cancele o item (com motivo) e lance de novo.");
      return;
    }
    const body: { quantidade?: string; observacao?: string | null } = {};
    if (compareDecimal(parsed, item.quantidade) !== 0) body.quantidade = parsed;
    const obs = observacao.trim();
    if (obs !== (item.observacao ?? "")) body.observacao = obs || null;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      dismissible={!pending}
      title={`Editar ${item.descricao}`}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending} disabled={produto.isLoading}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {produto.isLoading ? (
          <LoadingBlock label="Carregando…" />
        ) : (
          <div>
            <p className="mb-1 text-sm font-medium text-fg">Quantidade</p>
            <Stepper label="Quantidade" value={quantidade} onChange={setQuantidade} casas={casas} min={item.quantidade} />
            <p className="mt-1 text-xs text-muted">Só é possível aumentar. Para reduzir, cancele o item e lance de novo.</p>
          </div>
        )}
        <FormField label="Observação">
          <Textarea rows={2} maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </FormField>
        <p className="text-xs text-muted">Lançado em {formatDateTime(item.lancado_em)}.</p>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}
