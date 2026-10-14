import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { TableScene } from "@/components/illustrations";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Moldura das telas públicas/de conta (login, troca de senha, acesso suspenso): painel verde com uma
 * mesa posta ao lado (some no celular) e o formulário no papel.
 */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-side p-12 text-side-fg lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <span className="font-display text-2xl font-semibold">PDV Restaurante</span>
        </div>
        {/* A ilustração usa --c-fg/--c-surface: aqui, sobre o verde, elas viram creme e verde-claro. */}
        <TableScene className="mx-auto h-auto w-full max-w-sm [--c-brand-soft:#2f6a54] [--c-fg:#f3ecdc] [--c-surface:#21493a]" />
        <p className="max-w-sm font-display text-3xl font-semibold leading-snug">
          Salão, caixa e estoque <span className="text-accent">num só lugar</span>.
        </p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-5 py-12">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="mb-7 flex items-center gap-3 text-fg lg:hidden">
          <BrandMark size={36} />
          <span className="font-display text-2xl font-semibold">PDV Restaurante</span>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-md sm:p-8">
          <h1 className="font-display text-3xl font-semibold leading-tight text-fg">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
