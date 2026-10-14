import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { useContaPagarMutations, type TituloPagar } from "./api";

/** Cancelamento de conta a pagar: pede o motivo (3 a 300 caracteres). O backend recusa se houver pagamento líquido. */
export function CancelarContaDialog({ titulo, onClose }: { titulo: TituloPagar; onClose: () => void }) {
  const toast = useToast();
  const { cancelar } = useContaPagarMutations();
  return (
    <ReasonDialog
      open
      title="Cancelar conta"
      description={
        <>
          Cancelar a conta <strong>{titulo.descricao}</strong>? Ela deixa de contar como a pagar e não pode mais receber pagamentos.
        </>
      }
      label="Motivo do cancelamento"
      confirmLabel="Cancelar conta"
      onClose={onClose}
      onSubmit={async (motivo) => {
        await cancelar.mutateAsync({ id: titulo.id, motivo });
        toast.success("Conta cancelada.");
      }}
      errorHint={(error) => (error instanceof ApiError && error.status === 409 ? <p className="mt-1">Os dados da conta foram atualizados; confira o estado atual.</p> : null)}
    />
  );
}
