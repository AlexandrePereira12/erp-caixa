import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { PlateScene } from "@/components/illustrations";
import { usePageTitle } from "@/lib/usePageTitle";

export function NotFound() {
  usePageTitle("Página não encontrada");
  return (
    <div className="mx-auto max-w-md py-14 text-center">
      <PlateScene className="mx-auto mb-5 h-28 w-auto" />
      <h1 className="font-display text-3xl font-semibold text-fg">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted">Esse prato não está no cardápio: o endereço não existe ou foi movido.</p>
      <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
        Ir para o início
      </Link>
    </div>
  );
}
