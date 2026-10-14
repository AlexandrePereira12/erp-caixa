import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { buttonClasses } from "@/components/Button";
import { PageHeader } from "@/components/Card";
import { ArrowLeftIcon } from "@/components/icons";
import { positiveIntParam } from "@/components/pdv/forms";
import type { Caixa } from "@/components/pdv/types";
import { ErrorState, LoadingBlock } from "@/components/States";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";
import { useCaixa } from "./api";
import { CaixaPanel } from "./CaixaPanel";
import { CloseCaixaDialog } from "./CloseCaixaDialog";

/** Detalhe de um caixa (qualquer operador): resumo, movimentos, conferências, reabrir e, com caixa.gerenciar_todos, operar. */
export function CaixaDetailPage() {
  const id = positiveIntParam(useParams().id);
  usePageTitle(id ? `Caixa #${id}` : "Caixa");
  const { can, me } = usePermissions();
  const query = useCaixa(id);
  const [closing, setClosing] = useState<Caixa | null>(null);

  const caixa = query.data;
  // O backend exige caixa.operar e, em caixa de outro operador, caixa.gerenciar_todos.
  const canOperate = caixa !== undefined && can("caixa.operar") && (caixa.operador.id === me?.id || can("caixa.gerenciar_todos"));

  return (
    <div>
      <PageHeader
        title="Detalhe do caixa"
        actions={
          <Link to="/caixas" className={buttonClasses({ className: "min-h-11" })}>
            <ArrowLeftIcon width={16} height={16} />
            Histórico
          </Link>
        }
      />
      {id === undefined ? (
        <ErrorState error={new Error("Caixa inválido")} title="Caixa não encontrado" />
      ) : query.isLoading ? (
        <LoadingBlock />
      ) : query.error || !caixa ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar o caixa" />
      ) : (
        <CaixaPanel caixa={caixa} canOperate={canOperate} onRequestClose={setClosing} showOperator />
      )}
      {closing && <CloseCaixaDialog caixa={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}
