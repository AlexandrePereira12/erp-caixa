import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { LockIcon } from "@/components/icons";
import { AuthShell } from "@/features/auth/AuthShell";
import { session } from "@/lib/auth/session";
import { usePageTitle } from "@/lib/usePageTitle";

/** Tela estática: a conta foi suspensa. Só orienta e devolve ao login. */
export function Suspended() {
  usePageTitle("Acesso suspenso");
  const navigate = useNavigate();

  function backToLogin() {
    session.expire();
    navigate("/login", { replace: true });
  }

  return (
    <AuthShell title="Acesso suspenso">
      <div className="space-y-4 text-sm text-fg">
        <LockIcon className="h-8 w-8 text-muted" />
        <p>O acesso desta conta foi suspenso. Procure o administrador do sistema para saber o motivo e solicitar a reativação.</p>
        <Button variant="primary" className="w-full" onClick={backToLogin}>
          Voltar ao login
        </Button>
      </div>
    </AuthShell>
  );
}
