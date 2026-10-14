import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { applyServerError } from "@/lib/forms";
import { useCategoriaMutations, type CategoriaFinanceira, type CategoriaTipo } from "./categoriasApi";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da categoria.").max(80, "O nome pode ter no máximo 80 caracteres."),
  tipo: z.enum(["receita", "despesa"]),
});
type FormValues = z.infer<typeof schema>;

export const TIPO_LABEL: Record<CategoriaTipo, string> = { receita: "Receita", despesa: "Despesa" };

/** Cadastro e edição de categoria financeira. O tipo (receita ou despesa) não muda depois de criada. */
export function CategoriaFormDialog({ categoria, tipoInicial = "despesa", onClose }: { categoria?: CategoriaFinanceira | undefined; tipoInicial?: CategoriaTipo; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { create, update } = useCategoriaMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { nome: categoria?.nome ?? "", tipo: categoria?.tipo ?? tipoInicial } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (categoria) {
        await update.mutateAsync({ id: categoria.id, body: { nome: values.nome } });
        toast.success("Categoria atualizada.");
      } else {
        await create.mutateAsync({ nome: values.nome, tipo: values.tipo });
        toast.success("Categoria cadastrada.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "categoria_nome_em_uso") setError("nome", { type: "server", message: error.message });
      else setFormError(applyServerError(error, setError, ["nome"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title={categoria ? `Editar ${categoria.nome}` : "Nova categoria"}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={isSubmitting}>
            {categoria ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input className="min-h-11" autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField label="Tipo" error={errors.tipo?.message} hint={categoria ? "O tipo não pode ser alterado." : "Despesa serve para as contas a pagar; receita, para as contas a receber."}>
          <Select className="min-h-11" disabled={categoria !== undefined} {...register("tipo")}>
            {(["despesa", "receita"] as const).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Dialog>
  );
}
