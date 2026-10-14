import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";
import { useModal } from "./useModal";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false bloqueia Esc, clique no fundo e o botão fechar (ex.: enquanto envia). */
  dismissible?: boolean;
}

const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl" };

export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<DialogContent {...props} />, document.body);
}

function DialogContent({ onClose, title, description, children, footer, size = "md", dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModal(ref, dismissible ? onClose : undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[#14120f]/60" aria-hidden="true" onMouseDown={dismissible ? onClose : undefined} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-line bg-surface shadow-xl sm:rounded-xl ${widths[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Fechar"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>
        <div data-modal-body className="overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3 sm:rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}
