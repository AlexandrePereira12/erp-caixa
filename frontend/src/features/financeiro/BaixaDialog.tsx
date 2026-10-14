import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { moneyInputProps, parseMoney, toInt } from "@/components/pdv/forms";
import type { Titulo } from "@/components/pdv/types";
import { LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { useCaixaAtual } from "@/features/caixa/api";
import { useFormas } from "@/features/formas-pagamento/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";
import { useBaixar } from "./api";

/** Recebimento de conta a receber. O valor não passa do saldo (prévia; o backend confere) e exige caixa aberto. */
export function BaixaDialog({ titulo, onClose }: { titulo: Titulo; onClose: () => void }) {
  const chave = useRef(crypto.randomUUID());
  const formId = useId();
  const toast = useToast();
  const { can } = usePermissions();
  const baixar = useBaixar();
  const formasQuery = useFormas({ ativa: true, enabled: can("formas_pagamento.listar") });
  const caixa = useCaixaAtual({ enabled: can("caixa.operar") });
  const formas = useMemo(() => (formasQuery.data ?? []).filter((f) => f.tipo !== "fiado"), [formasQuery.data]);

  const [valor, setValor] = useState("");
  const [formaId, setFormaId] = useState("");
  const [obs, setObs] = useState("");
  const [errors, setErrors] = useState<{ valor?: string; forma?: string }>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const semCaixa = caixa.data === null;

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
    try {
      // Mesma chave em todas as tentativas desta janela: clique duplo ou retry de rede não lança duas vezes.
      await baixar.mutateAsync({ id: titulo.id, valor: parsed, forma_pagamento_id: forma, chave: chave.current, ...(obs.trim() ? { observacao: obs.trim() } : {}) });
      toast.success("Recebimento registrado.");
      onClose();
    } catch (error) {
      setApiError(error);
    }
  }

  const pending = baixar.isPending;
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      size="sm"
      title="Registrar recebimento"
      description={`${titulo.pessoa.nome} · saldo ${formatMoney(titulo.saldo)}`}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending} disabled={semCaixa}>
            Receber
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {semCaixa && (
          <Alert tone="warning" title="Você não tem caixa aberto">
            O recebimento entra no seu caixa.{" "}
            <Link to="/caixa" className="font-medium underline">
              Abrir o caixa
            </Link>
          </Alert>
        )}
        <FormField label="Valor recebido (R$)" error={errors.valor} required>
          <Input {...moneyInputProps()} className="min-h-11" value={valor} onChange={(e) => setValor(e.target.value)} />
        </FormField>
        <Button className="min-h-11" onClick={() => setValor(titulo.saldo.replace(".", ","))}>
          Receber o saldo todo ({formatMoney(titulo.saldo)})
        </Button>
        {!can("formas_pagamento.listar") ? (
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
        <FormField label="Observação" hint="Opcional.">
          <Input className="min-h-11" maxLength={300} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>
        {apiError !== null && (
          <Alert tone="danger">
            <p>{errorMessage(apiError)}</p>
            {apiError instanceof ApiError && apiError.codigo === "caixa_fechado" && (
              <p className="mt-1">
                <Link to="/caixa" className="font-medium underline">
                  Abra o seu caixa
                </Link>{" "}
                e tente de novo.
              </p>
            )}
            {apiError instanceof ApiError && apiError.codigo === "valor_acima_do_saldo" && <p className="mt-1">O saldo pode ter mudado; feche e abra a conta de novo.</p>}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
