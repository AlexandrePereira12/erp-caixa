import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { bootstrapSession } from "@/lib/auth/auth";
import { useSession } from "@/lib/auth/hooks";

export function createQueryClient(overrides: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Erros 4xx são de negócio/permissão: repetir não ajuda.
        retry: overrides.retry === false ? false : (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

/** Descarta todo o cache quando a sessão deixa de estar autenticada (logout, expiração, suspensão). */
function SessionCacheGuard({ client }: { client: QueryClient }) {
  const { status } = useSession();
  useEffect(() => {
    if (status === "anonymous" || status === "suspended") client.clear();
  }, [status, client]);
  return null;
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionCacheGuard client={queryClient} />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Restaura a sessão (refresh via cookie) uma vez ao carregar o app. */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return children;
}
