import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { moneyInputProps, parseMoney, toInt } from "@/components/pdv/forms";
import { LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { useFormas } from "@/features/formas-pagamento/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";
import { useContaPagarMutations, type BaixaPagarIn, type TituloPagar } from "./api";

/**
 * Pagamento (baixa) de conta a pagar. O valor abre preenchido com o saldo; pagamento parcial é só
 * digitar menos. `titulo` é o dado vivo da tela: depois de um 409 (saldo mudou) o saldo exibido já é o novo.
 */
export function BaixaPagarDialog({ titulo, onClose }: { titulo: TituloPagar; onClose: () => void }) {
  // Uma chave por abertura da janela: clique duplo ou nova tentativa depois de falha de rede não lança duas vezes.
  const chave = useRef(crypto.randomUUID());
  const formId = useId();
  const toast = useToast();
  const { can } = usePermissions();
  const { baixar } = useContaPagarMutations();
  const podeListarFormas = can("formas_pagamento.listar");
  const formasQuery = useFormas({ ativa: true, enabled: podeListarFormas });
  const formas = useMemo(() => (formasQuery.data ?? []).filter((f) => f.tipo !== "fiado"), [formasQuery.data]);

  const [valor, setValor] = useState(titulo.saldo.replace(".", ","));
  const [formaId, setFormaId] = useState("");
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");
  const [errors, setErrors] = useState<{ valor?: string; forma?: string; data?: string }>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const aberta = titulo.status === "aberto";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(valor);
    const forma = toInt(formaId);
    const next: typeof errors = {};
    if (parsed === null || compareDecimal(parsed, "0") <= 0) next.valor = "Informe um valor maior que zero, como 25,00.";
    else if (compareDecimal(parsed, titulo.saldo) > 0) next.valor = `O valor passa do saldo da conta (${formatMoney(titulo.saldo)}).`;
    if (forma === undefined) next.forma = "Escolha a forma de pagamento.";
    setErrors(next);
    if (next.valor || next.forma || parsed === null || forma === undefined) return;
    setApiError(null);
    const body: BaixaPagarIn = {
      valor: parsed,
      forma_pagamento_id: forma,
      chave: chave.current,
      ...(data ? { data_pagamento: data } : {}),
      ...(obs.trim() ? { observacao: obs.trim() } : {}),
    };
    try {
      await baixar.mutateAsync({ id: titulo.id, body });
      toast.success("Pagamento registrado.");
      onClose();
    } catch (error) {
      // Erros de campo ficam no campo; o resto (saldo mudou, conta já paga...) vira aviso com a mensagem do backend.
      if (error instanceof ApiError && error.codigo === "data_futura") setErrors({ data: error.message });
      else if (error instanceof ApiError && error.codigo === "forma_invalida") setErrors({ forma: error.message });
      else setApiError(error);
    }
  }

  const pending = baixar.isPending;
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      size="sm"
      title="Registrar pagamento"
      description={`${titulo.fornecedor?.nome ?? "Despesa avulsa"} · ${titulo.descricao} · saldo ${formatMoney(titulo.saldo)}`}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending} disabled={!aberta || !podeListarFormas}>
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {!aberta && (
          <Alert tone="warning" title="A conta não está mais em aberto">
            Não é possível registrar pagamento nela.
          </Alert>
        )}
        <FormField label="Valor pago (R$)" error={errors.valor} required>
          <Input {...moneyInputProps()} className="min-h-11" value={valor} onChange={(e) => setValor(e.target.value)} />
        </FormField>
        <Button className="min-h-11" onClick={() => setValor(titulo.saldo.replace(".", ","))}>
          Usar o saldo todo ({formatMoney(titulo.saldo)})
        </Button>
        {!podeListarFormas ? (
          <Alert tone="warning">Você não tem permissão para listar as formas de pagamento.</Alert>
        ) : formasQuery.isLoading ? (
          <LoadingBlock label="Carregando formas…" />
        ) : (
          <FormField label="Forma de pagamento" error={errors.forma} required>
            <Select className="min-h-11" value={formaId} onChange={(e) => setFormaId(e.target.value)}>
              <option value="">Selecione…</option>
              {formas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Data do pagamento" error={errors.data} hint="Opcional. Em branco, vale hoje. Não pode ser uma data futura.">
          <Input type="date" className="min-h-11" value={data} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Observação" hint="Opcional.">
          <Input className="min-h-11" maxLength={300} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>
        {apiError !== null && (
          <Alert tone="danger">
            <p>{errorMessage(apiError)}</p>
            {apiError instanceof ApiError && apiError.codigo === "valor_acima_do_saldo" && <p className="mt-1">O saldo da conta mudou. Confira o saldo atual acima e ajuste o valor.</p>}
            {apiError instanceof ApiError && apiError.status === 409 && apiError.codigo !== "valor_acima_do_saldo" && <p className="mt-1">Os dados da conta foram atualizados.</p>}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
