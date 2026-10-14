import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { LockIcon } from "@/components/icons";
import { usePageTitle } from "@/lib/usePageTitle";

export function AccessDenied() {
  usePageTitle("Acesso negado");
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <LockIcon className="mx-auto h-10 w-10 text-muted" />
      <h1 className="mt-4 text-xl font-semibold text-fg">Acesso negado</h1>
      <p className="mt-2 text-sm text-muted">Você não tem permissão para acessar esta página. Se precisar dela, fale com o administrador do sistema.</p>
      <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
        Ir para o início
      </Link>
    </div>
  );
}
