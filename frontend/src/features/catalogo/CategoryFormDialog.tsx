import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useCategoryMutations } from "./api";
import { mapServerError } from "./formErrors";
import type { CategoriaEditarIn, CategoriaOut } from "./types";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Checkbox, Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(80, "O nome pode ter no máximo 80 caracteres."),
  descricao: z.string().trim().max(500, "A descrição pode ter no máximo 500 caracteres."),
  ativo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function CategoryFormDialog({ category, onClose }: { category?: CategoriaOut | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { create, update } = useCategoryMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: category?.nome ?? "", descricao: category?.descricao ?? "", ativo: category?.ativo ?? true },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const descricao = values.descricao || null;
    try {
      if (category) {
        const body: CategoriaEditarIn = {};
        if (values.nome !== category.nome) body.nome = values.nome;
        if (descricao !== category.descricao) body.descricao = descricao;
        if (values.ativo !== category.ativo) body.ativo = values.ativo;
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: category.id, body });
        toast.success("Categoria atualizada.");
      } else {
        await create.mutateAsync({ nome: values.nome, descricao, ativo: values.ativo });
        toast.success("Categoria criada.");
      }
      onClose();
    } catch (error) {
      setFormError(mapServerError(error, setError, { categoria_nome_em_uso: "nome" }, ["nome", "descricao", "ativo"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title={category ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            {category ? "Salvar" : "Criar categoria"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField label="Descrição" error={errors.descricao?.message}>
          <Textarea {...register("descricao")} />
        </FormField>
        <Controller control={control} name="ativo" render={({ field }) => <Checkbox label="Categoria ativa" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} />
      </form>
    </Dialog>
  );
}
