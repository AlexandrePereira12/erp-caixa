import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { LockIcon } from "@/components/icons";
import { usePageTitle } from "@/lib/usePageTitle";

export function AccessDenied() {
  usePageTitle("Acesso negado");
  return (
    <div className="mx-auto max-w-md py-14 text-center">
      <span aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning-soft text-warning-text">
        <LockIcon width={28} height={28} />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-fg">Acesso negado</h1>
      <p className="mt-2 text-sm text-muted">Você não tem permissão para acessar esta página. Se precisar dela, fale com o administrador do sistema.</p>
      <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-6" })}>
        Ir para o início
      </Link>
    </div>
  );
}
