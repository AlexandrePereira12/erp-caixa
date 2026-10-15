import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { AuthShell } from "@/features/auth/AuthShell";
import { usePageTitle } from "@/lib/usePageTitle";

/** Créditos: quem fez o sistema e o que de terceiros ele usa. Pública, como a tela de entrada. */
export function Credits() {
  usePageTitle("Créditos");
  return (
    <AuthShell title="Créditos">
      <div className="space-y-3 text-fg">
        <p>Sistema desenvolvido por alexandre-dev.</p>
        <p className="text-muted">Tipografia: Inter, de Rasmus Andersson, sob a licença SIL Open Font License 1.1.</p>
        <p className="text-muted">QR Code do Pix: biblioteca uqr, sob a licença MIT.</p>
        <Link to="/" className={buttonClasses({ variant: "primary", className: "mt-2" })}>
          Voltar
        </Link>
      </div>
    </AuthShell>
  );
}
