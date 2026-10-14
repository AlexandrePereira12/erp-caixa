import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";
import { useModal } from "./useModal";

/** Gaveta lateral (menu no celular). Mesmo comportamento de foco/Esc dos diálogos. */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  if (!open) return null;
  return createPortal(
    <DrawerContent onClose={onClose} label={label}>
      {children}
    </DrawerContent>,
    document.body,
  );
}

function DrawerContent({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-[#14120f]/60" aria-hidden="true" onMouseDown={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="relative flex h-full w-72 max-w-[85vw] flex-col bg-side text-side-fg shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu"
          className="absolute right-2 top-3 flex h-9 w-9 items-center justify-center rounded-md text-side-muted hover:bg-side-active hover:text-side-fg"
        >
          <CloseIcon />
        </button>
        <div data-modal-body className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
