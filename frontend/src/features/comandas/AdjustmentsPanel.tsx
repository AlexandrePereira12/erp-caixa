import { useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { Choice } from "@/components/pdv/Choice";
import { PlusIcon } from "@/components/icons";
import { TrashIcon } from "@/components/pdv/icons";
import { parseMoney } from "@/components/pdv/forms";
import type { ComandaAjuste } from "@/components/pdv/types";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { compareDecimal } from "@/lib/decimal";
import { formatDecimal, formatMoney } from "@/lib/money";

export interface AdjustmentsPanelProps {
  ajustes: ComandaAjuste[];
  /** Pode aplicar/remover (comandas.desconto e comanda em andamento). */
  canEdit: boolean;
  onAdd: (body: { tipo: "desconto" | "acrescimo"; modo: "valor" | "percentual"; valor: string; justificativa: string }) => Promise<unknown>;
  onRemove: (ajusteId: number) => Promise<unknown>;
}

/** Descontos e acréscimos da comanda. O valor calculado de cada ajuste vem da API. */
export function AdjustmentsPanel({ ajustes, canEdit, onAdd, onRemove }: AdjustmentsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ComandaAjuste | null>(null);
  const ativos = ajustes.filter((a) => !a.removido);
  if (ativos.length === 0 && !canEdit) return null;

  return (
    <section aria-label="Descontos e acréscimos" className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">Descontos e acréscimos</h2>
        {canEdit && (
          <Button className="min-h-11" onClick={() => setAdding(true)}>
            <PlusIcon width={16} height={16} />
            Desconto / acréscimo
          </Button>
        )}
      </div>
      {ativos.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {ativos.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-fg">
                  {a.tipo === "desconto" ? "Desconto" : "Acréscimo"} de {a.modo === "percentual" ? `${formatDecimal(a.valor, { maximumFractionDigits: 2 })}%` : formatMoney(a.valor)}
                </p>
                <p className="text-sm text-muted">{a.justificativa}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <p className="font-semibold tabular-nums text-fg">
                  {a.tipo === "desconto" ? "−" : "+"} {formatMoney(a.valor_calculado)}
                </p>
                {canEdit && (
                  <Button variant="ghost" className="min-h-11 min-w-11 px-0! text-danger-text" aria-label={`Remover ${a.tipo === "desconto" ? "desconto" : "acréscimo"} de ${formatMoney(a.valor_calculado)}`} onClick={() => setRemoving(a)}>
                    <TrashIcon width={16} height={16} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && <AdjustmentDialog onClose={() => setAdding(false)} onSubmit={onAdd} />}
      <ConfirmDialog
        open={removing !== null}
        title="Remover ajuste"
        description={removing ? <>Remover o {removing.tipo === "desconto" ? "desconto" : "acréscimo"} de {formatMoney(removing.valor_calculado)}? O total será recalculado.</> : undefined}
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={() => (removing ? onRemove(removing.id) : Promise.resolve())}
      />
    </section>
  );
}

function AdjustmentDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: AdjustmentsPanelProps["onAdd"] }) {
  const formId = useId();
  const [tipo, setTipo] = useState<"desconto" | "acrescimo">("desconto");
  const [modo, setModo] = useState<"valor" | "percentual">("percentual");
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [errors, setErrors] = useState<{ valor?: string; justificativa?: string }>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(valor);
    const next: typeof errors = {};
    if (parsed === null || compareDecimal(parsed, "0") <= 0) next.valor = "Informe um valor maior que zero, como 10,00.";
    else if (modo === "percentual" && compareDecimal(parsed, "100") > 0) next.valor = "O percentual não pode passar de 100.";
    if (justificativa.trim().length < 3) next.justificativa = "Informe a justificativa (mínimo de 3 caracteres).";
    setErrors(next);
    if (next.valor || next.justificativa || parsed === null) return;
    setApiError(null);
    setPending(true);
    try {
      await onSubmit({ tipo, modo, valor: parsed, justificativa: justificativa.trim() });
      onClose();
    } catch (err) {
      setApiError(err);
      setPending(false);
    }
  }

  const overLimit = apiError instanceof ApiError && apiError.codigo === "desconto_acima_do_limite";

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      dismissible={!pending}
      title="Desconto ou acréscimo"
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending}>
            Aplicar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <Choice legend="Tipo" name="tipo" value={tipo} onChange={setTipo} options={[["desconto", "Desconto"], ["acrescimo", "Acréscimo"]]} />
        <Choice legend="Forma de cálculo" name="modo" value={modo} onChange={setModo} options={[["percentual", "Percentual (%)"], ["valor", "Valor (R$)"]]} />
        <FormField label={modo === "percentual" ? "Percentual (%)" : "Valor (R$)"} error={errors.valor} required>
          <Input inputMode="decimal" autoComplete="off" placeholder={modo === "percentual" ? "10" : "0,00"} className="min-h-11" value={valor} onChange={(e) => setValor(e.target.value)} />
        </FormField>
        <FormField label="Justificativa" error={errors.justificativa} required>
          <Textarea rows={2} maxLength={300} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
        </FormField>
        {apiError !== null && (
          <Alert tone="danger">
            <p>{errorMessage(apiError)}</p>
            {overLimit && <p className="mt-1 font-medium">Peça a um gerente para aplicar este desconto, ou use um percentual menor.</p>}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
