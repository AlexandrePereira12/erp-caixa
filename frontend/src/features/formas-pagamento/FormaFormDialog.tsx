import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { toInt } from "@/components/pdv/forms";
import { formaTipoLabel } from "@/components/pdv/labels";
import type { FormaPagamento, FormaTipo } from "@/components/pdv/types";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { applyServerError } from "@/lib/forms";
import { useFormaMutations } from "./api";

export const FORMA_TIPOS: FormaTipo[] = ["dinheiro", "pix", "debito", "credito", "vale", "fiado", "outro"];

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da forma de pagamento.").max(60, "O nome pode ter no máximo 60 caracteres."),
  tipo: z.enum(["dinheiro", "pix", "debito", "credito", "vale", "fiado", "outro"]),
  ordem: z.string().trim().refine((v) => v === "" || (toInt(v) !== undefined && toInt(v)! <= 1000), "Informe um número de 0 a 1000."),
});
type FormValues = z.infer<typeof schema>;

/** Cadastro e edição de forma de pagamento. O tipo define o comportamento e não muda depois de criada. */
export function FormaFormDialog({ forma, onClose }: { forma?: FormaPagamento | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { create, update } = useFormaMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { nome: forma?.nome ?? "", tipo: forma?.tipo ?? "outro", ordem: forma ? String(forma.ordem) : "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const ordem = toInt(values.ordem);
    try {
      if (forma) {
        await update.mutateAsync({
          id: forma.id,
          body: { ...(values.nome !== forma.nome ? { nome: values.nome } : {}), ...(ordem !== undefined && ordem !== forma.ordem ? { ordem } : {}) },
        });
        toast.success("Forma de pagamento atualizada.");
      } else {
        await create.mutateAsync({ nome: values.nome, tipo: values.tipo, ...(ordem !== undefined ? { ordem } : {}) });
        toast.success("Forma de pagamento cadastrada.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "forma_nome_em_uso") setError("nome", { type: "server", message: error.message });
      else if (error instanceof ApiError && error.codigo === "forma_tipo_unico") setError("tipo", { type: "server", message: error.message });
      else setFormError(applyServerError(error, setError, ["nome", "ordem"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title={forma ? `Editar ${forma.nome}` : "Nova forma de pagamento"}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={isSubmitting}>
            {forma ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input className="min-h-11" autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField
          label="Tipo"
          error={errors.tipo?.message}
          hint={forma ? "O tipo não pode ser alterado." : "Define o comportamento: dinheiro admite troco, crédito admite parcelas e fiado gera conta a receber."}
        >
          <Select className="min-h-11" disabled={forma !== undefined} {...register("tipo")}>
            {FORMA_TIPOS.map((t) => (
              <option key={t} value={t}>
                {formaTipoLabel(t)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Ordem" error={errors.ordem?.message} hint="Menor aparece primeiro nas listas. Opcional.">
          <Input className="min-h-11" inputMode="numeric" autoComplete="off" {...register("ordem")} />
        </FormField>
      </form>
    </Dialog>
  );
}
