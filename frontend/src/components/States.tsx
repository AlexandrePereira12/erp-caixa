import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "./Button";
import { PlateScene } from "./illustrations";
import { Spinner } from "./Spinner";

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-12 text-muted">
      <Spinner className="h-5 w-5" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action, illustration }: { title: string; description?: string; action?: ReactNode; illustration?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      {illustration ?? <PlateScene className="mx-auto mb-4 h-24 w-auto" />}
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Não foi possível carregar" }: { error: unknown; onRetry?: (() => void) | undefined; title?: string }) {
  return (
    <div role="alert" className="px-4 py-12 text-center">
      <p className="font-medium text-danger-text">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
