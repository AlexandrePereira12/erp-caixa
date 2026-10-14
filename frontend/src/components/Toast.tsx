import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const tones: Record<ToastTone, string> = {
  success: "border-l-success-text",
  error: "border-l-danger-text",
  info: "border-l-brand-text",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { id, tone, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 10_000 : 5_000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  function renderItem(toast: ToastItem) {
    return (
      <div
        key={toast.id}
        className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-[5px] border-line bg-surface px-4 py-3 text-sm text-fg shadow-lg ${tones[toast.tone]}`}
      >
        {toast.tone === "success" ? <CheckIcon className="mt-0.5 shrink-0 text-success-text" /> : <AlertIcon className={`mt-0.5 shrink-0 ${toast.tone === "error" ? "text-danger-text" : "text-brand-text"}`} />}
        <p className="min-w-0 flex-1 break-words">{toast.message}</p>
        <button type="button" onClick={() => dismiss(toast.id)} aria-label="Fechar notificação" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg">
          <CloseIcon width={16} height={16} />
        </button>
      </div>
    );
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* As regiões existem sempre no DOM: leitores de tela só anunciam inserções em regiões já presentes. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        <div aria-live="polite" aria-atomic="false" role="status" className="flex w-full flex-col items-center gap-2 sm:items-end">
          {toasts.filter((t) => t.tone !== "error").map(renderItem)}
        </div>
        <div aria-live="assertive" aria-atomic="false" className="flex w-full flex-col items-center gap-2 sm:items-end">
          {toasts.filter((t) => t.tone === "error").map(renderItem)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fora de <ToastProvider>");
  return ctx;
}
