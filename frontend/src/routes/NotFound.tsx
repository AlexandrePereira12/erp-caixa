import { Link } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/States";
import { usePageTitle } from "@/lib/usePageTitle";

export function NotFound() {
  usePageTitle("Página não encontrada");
  return (
    <Card>
      <EmptyState
        titleAs="h1"
        title="Página não encontrada"
        description="Esse prato não está no cardápio: o endereço não existe ou foi movido."
        action={
          <Link to="/" className={buttonClasses({ variant: "primary" })}>
            Ir para o início
          </Link>
        }
      />
    </Card>
  );
}
