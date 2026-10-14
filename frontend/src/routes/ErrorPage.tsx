import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "@/components/Button";

/** Tela de erro genérica (errorElement do router): falha de renderização inesperada. */
export function ErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  const notFoundLike = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-fg">{notFoundLike ? "Página não encontrada" : "Algo deu errado"}</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        {notFoundLike ? "O endereço não existe ou foi movido." : "Ocorreu um erro inesperado. Tente recarregar a página; se persistir, avise o administrador."}
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
        <Button onClick={() => window.location.assign("/")}>Ir para o início</Button>
      </div>
    </main>
  );
}
