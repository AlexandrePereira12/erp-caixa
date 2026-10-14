import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl flex-1 basis-72">
        <h1 className="text-[1.75rem] font-bold leading-[1.15] tracking-[-0.015em] text-fg">{title}</h1>
        {description && <p className="mt-1.5 leading-normal text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
