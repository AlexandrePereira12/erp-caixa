import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { usePageTitle } from "@/lib/usePageTitle";

export function NotFound() {
  usePageTitle("Página não encontrada");
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-mono text-5xl font-semibold text-brand-text">404</p>
      <h1 className="mt-4 text-xl font-semibold text-fg">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted">O endereço não existe ou foi movido.</p>
      <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
        Ir para o início
      </Link>
    </div>
  );
}
