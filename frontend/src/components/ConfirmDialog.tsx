import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Executa a ação; rejeição mostra a mensagem do backend dentro do diálogo. */
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  // Remonta ao abrir/fechar para zerar erro e estado de envio.
  return props.open ? <ConfirmContent {...props} /> : null;
}

function ConfirmContent({ open, title, description, confirmLabel, tone = "danger", onConfirm, onClose }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button data-autofocus onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={tone} loading={pending} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-fg">
        {description && <div>{description}</div>}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}
