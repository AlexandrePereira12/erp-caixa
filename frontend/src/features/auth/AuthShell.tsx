import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Moldura das telas públicas/de conta (login, troca de senha, acesso suspenso): painel grafite com a
 * marca, a frase do sistema e, se vier `art`, uma ilustração (o painel some no celular) e o formulário num
 * cartão ao lado.
 */
export function AuthShell({ title, description, art, children }: { title: string; description?: string; art?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-[#16181a] p-12 text-[#f2f3f4] lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <span className="leading-tight">
            <span className="block text-[0.6875rem] tracking-[0.14em] text-[#9aa0a6]">ERP</span>
            <span className="block text-lg font-semibold">Restaurante</span>
          </span>
        </div>
        {art && <div className="mx-auto flex min-h-0 w-full max-w-[40rem] flex-1 items-center py-8">{art}</div>}
        <p className="max-w-[26rem] text-[2rem] font-semibold leading-tight tracking-[-0.01em]">Gestão de salão, comandas e caixa para restaurantes.</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center gap-6 bg-page px-5 py-12">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="flex items-center gap-3 text-fg lg:hidden">
          <BrandMark size={36} />
          <span className="text-lg font-semibold">ERP Restaurante</span>
        </div>
        <div className="w-full max-w-[26.25rem] rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="text-2xl font-bold leading-tight text-fg">{title}</h1>
          {description && <p className="mt-1.5 text-muted">{description}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </main>
    </div>
  );
}
