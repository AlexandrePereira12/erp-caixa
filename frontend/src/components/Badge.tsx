import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-fg border-line-strong/30",
  brand: "bg-brand-soft text-brand-text border-brand-text/25",
  success: "bg-success-soft text-success-text border-success-text/25",
  warning: "bg-warning-soft text-warning-text border-warning-text/30",
  danger: "bg-danger-soft text-danger-text border-danger-text/25",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}
