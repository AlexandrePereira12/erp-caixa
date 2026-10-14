import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { errorMessage } from "@/lib/api/errors";

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Rótulo do campo ("Motivo", "Justificativa"). */
  label?: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  maxLength?: number;
  /** Envia o texto já aparado (mínimo de 3 caracteres, regra do backend). Rejeição mostra o erro aqui dentro. */
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
  /** Orientação extra para erros conhecidos (ex.: link para abrir o caixa). */
  errorHint?: (error: unknown) => ReactNode;
}

/** Pede um motivo/justificativa (≥ 3 caracteres) antes de uma ação destrutiva ou sensível. */
export function ReasonDialog(props: ReasonDialogProps) {
  // Remonta ao abrir/fechar: zera texto, erro e estado de envio.
  return props.open ? <ReasonContent {...props} /> : null;
}

function ReasonContent({ title, description, label = "Motivo", confirmLabel, tone = "danger", maxLength = 300, onSubmit, onClose, errorHint }: ReasonDialogProps) {
  const formId = useId();
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const reason = text.trim();
    if (reason.length < 3) {
      setFieldError("Informe pelo menos 3 caracteres.");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setPending(true);
    try {
      await onSubmit(reason);
      onClose();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={tone} className="min-h-11" loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-3">
        {description && <div className="text-sm text-fg">{description}</div>}
        <FormField label={label} error={fieldError} required>
          <Textarea rows={3} maxLength={maxLength} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        {error !== null && (
          <Alert tone="danger">
            <p>{errorMessage(error)}</p>
            {errorHint?.(error)}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
