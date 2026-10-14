import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Checkbox, Input } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { toInt } from "@/components/pdv/forms";
import type { Mesa } from "@/components/pdv/types";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { applyServerError } from "@/lib/forms";
import { useMesaMutations } from "./api";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da mesa.").max(40, "O nome pode ter no máximo 40 caracteres."),
  capacidade: z.string().trim().refine((v) => v === "" || (toInt(v) !== undefined && toInt(v)! >= 1 && toInt(v)! <= 100), "Informe de 1 a 100 lugares."),
  ativa: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/** Cadastro e edição de mesa (nome, lugares e, na edição, ativa). */
export function MesaFormDialog({ mesa, onClose }: { mesa?: Mesa | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { create, update } = useMesaMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: mesa?.nome ?? "", capacidade: mesa?.capacidade ? String(mesa.capacidade) : "", ativa: mesa?.ativa ?? true },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const capacidade = values.capacidade === "" ? null : (toInt(values.capacidade) ?? null);
    try {
      if (mesa) {
        await update.mutateAsync({
          id: mesa.id,
          body: {
            ...(values.nome !== mesa.nome ? { nome: values.nome } : {}),
            ...(capacidade !== mesa.capacidade ? { capacidade } : {}),
            ...(values.ativa !== mesa.ativa ? { ativa: values.ativa } : {}),
          },
        });
        toast.success("Mesa atualizada.");
      } else {
        await create.mutateAsync({ nome: values.nome, ...(capacidade !== null ? { capacidade } : {}) });
        toast.success("Mesa cadastrada.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "mesa_nome_em_uso") setError("nome", { type: "server", message: error.message });
      else setFormError(applyServerError(error, setError, ["nome", "capacidade"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title={mesa ? `Editar ${mesa.nome}` : "Nova mesa"}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={isSubmitting}>
            {mesa ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input className="min-h-11" autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField label="Lugares" error={errors.capacidade?.message} hint="Opcional.">
          <Input className="min-h-11" inputMode="numeric" autoComplete="off" {...register("capacidade")} />
        </FormField>
        {mesa && <Checkbox label="Mesa ativa" description="Mesas inativas não aparecem no salão." {...register("ativa")} />}
      </form>
    </Dialog>
  );
}
