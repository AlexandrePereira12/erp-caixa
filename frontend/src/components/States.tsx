import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-12 text-muted">
      <Spinner className="h-5 w-5" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action, illustration, titleAs: Title = "p" }: { title: string; description?: string; action?: ReactNode; illustration?: ReactNode; titleAs?: "p" | "h1" | "h2" }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {illustration ?? (
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 font-semibold text-muted">
          —
        </span>
      )}
      <Title className="mt-1.5 text-[1.0625rem] font-semibold text-fg">{title}</Title>
      {description && <p className="max-w-md leading-normal text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Não foi possível carregar" }: { error: unknown; onRetry?: (() => void) | undefined; title?: string }) {
  return (
    <div role="alert" className="px-4 py-12 text-center">
      <p className="font-semibold text-danger-text">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
