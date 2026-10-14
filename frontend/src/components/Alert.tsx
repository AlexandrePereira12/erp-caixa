import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

export type AlertTone = "danger" | "warning" | "info" | "success";

const tones: Record<AlertTone, string> = {
  danger: "border-danger-text bg-danger-soft text-danger-text",
  warning: "border-warning-text bg-warning-soft text-warning-text",
  info: "border-info-text bg-info-soft text-info-text",
  success: "border-success-text bg-success-soft text-success-text",
};

/** Erros usam role="alert" (anunciado na hora); os demais, role="status". */
export function Alert({ tone = "info", title, children, className = "" }: { tone?: AlertTone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-lg border px-4 py-3.5 text-[0.84rem] ${tones[tone]} ${className}`}>
      <AlertIcon className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
