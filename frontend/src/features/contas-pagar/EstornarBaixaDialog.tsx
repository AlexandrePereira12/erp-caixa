import { formatDay } from "@/components/pdv/dates";
import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { useContaPagarMutations, type BaixaPagar, type TituloPagar } from "./api";

/** Estorno de um pagamento: pede o motivo (3 a 300 caracteres). A conta volta a ter saldo em aberto. */
export function EstornarBaixaDialog({ titulo, baixa, onClose }: { titulo: TituloPagar; baixa: BaixaPagar; onClose: () => void }) {
  const toast = useToast();
  const { estornar } = useContaPagarMutations();
  return (
    <ReasonDialog
      open
      title="Estornar pagamento"
      description={
        <>
          Estornar o pagamento de <strong>{formatMoney(baixa.valor)}</strong> feito em {formatDay(baixa.data_pagamento)} ({baixa.forma})? O valor volta para o saldo da conta.
        </>
      }
      label="Motivo do estorno"
      confirmLabel="Estornar pagamento"
      onClose={onClose}
      onSubmit={async (motivo) => {
        await estornar.mutateAsync({ id: titulo.id, baixaId: baixa.id, motivo });
        toast.success("Pagamento estornado.");
      }}
      errorHint={(error) => (error instanceof ApiError && error.status === 409 ? <p className="mt-1">Os dados da conta foram atualizados; confira o estado atual.</p> : null)}
    />
  );
}
