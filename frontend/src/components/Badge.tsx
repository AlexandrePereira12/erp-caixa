import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-neutral-soft text-neutral-text",
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info-text",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-[3px] text-[0.72rem] font-semibold leading-tight ${tones[tone]} ${className}`}>{children}</span>;
}
