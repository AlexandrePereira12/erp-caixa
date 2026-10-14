import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { moneyInputProps, parseMoney, zMoneyPositive, zReason } from "@/components/pdv/forms";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { useCaixaMutations } from "./api";

const schema = z.object({ valor: zMoneyPositive, descricao: zReason(300, "a descrição") });
type FormValues = z.infer<typeof schema>;

export type MovementKind = "sangria" | "reforco";

const COPY: Record<MovementKind, { title: string; hint: string; confirm: string; done: string }> = {
  sangria: { title: "Sangria", hint: "Retirada de dinheiro do caixa (ex.: levar ao cofre).", confirm: "Registrar sangria", done: "Sangria registrada." },
  reforco: { title: "Reforço", hint: "Entrada de dinheiro no caixa (ex.: troco).", confirm: "Registrar reforço", done: "Reforço registrado." },
};

/** Sangria ou reforço em dinheiro. O backend recusa sangria acima do dinheiro esperado (saldo_dinheiro_insuficiente). */
export function MovementDialog({ caixaId, kind, onClose }: { caixaId: number; kind: MovementKind; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { movement } = useCaixaMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { valor: "", descricao: "" } });
  const copy = COPY[kind];

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const valor = parseMoney(values.valor);
    if (valor === null) return;
    try {
      const saved = await movement.mutateAsync({ caixaId, body: { tipo: kind, valor, descricao: values.descricao } });
      toast.success(`${copy.done} ${formatMoney(saved.valor.replace("-", ""))}`);
      onClose();
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.codigo === "saldo_dinheiro_insuficiente"
          ? `${error.message} Informe um valor menor.`
          : errorMessage(error),
      );
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title={copy.title}
      description={copy.hint}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={isSubmitting}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Valor (R$)" error={errors.valor?.message} required>
          <Input {...moneyInputProps()} className="min-h-11" {...register("valor")} />
        </FormField>
        <FormField label="Descrição" error={errors.descricao?.message} hint="Mínimo de 3 caracteres." required>
          <Input className="min-h-11" maxLength={300} autoComplete="off" {...register("descricao")} />
        </FormField>
      </form>
    </Dialog>
  );
}
