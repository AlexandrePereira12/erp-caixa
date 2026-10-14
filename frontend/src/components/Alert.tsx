import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

export type AlertTone = "danger" | "warning" | "info" | "success";

const tones: Record<AlertTone, string> = {
  danger: "border-danger/40 bg-danger-soft text-danger-text",
  warning: "border-warning-text/40 bg-warning-soft text-warning-text",
  info: "border-brand-text/30 bg-brand-soft text-brand-text",
  success: "border-success-text/35 bg-success-soft text-success-text",
};

/** Erros usam role="alert" (anunciado na hora); os demais, role="status". */
export function Alert({ tone = "info", title, children, className = "" }: { tone?: AlertTone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${tones[tone]} ${className}`}>
      <AlertIcon className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
