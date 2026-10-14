import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePersonMutations } from "./api";
import { onlyDigits } from "./masks";
import type { PessoaOut } from "./types";
import { mapServerError } from "@/features/catalogo/formErrors";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(160, "O nome pode ter no máximo 160 caracteres."),
  // Mesma regra do backend (telefone_invalido): ao menos 8 dígitos.
  telefone: z
    .string()
    .trim()
    .max(20, "O telefone pode ter no máximo 20 caracteres.")
    .refine((value) => onlyDigits(value).length >= 8, "Informe um telefone válido, com DDD."),
});
type FormValues = z.infer<typeof schema>;

/** Cadastro rápido de cliente de balcão: só nome e telefone, sem fiado. */
export function QuickPersonDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (person: PessoaOut) => void }) {
  const formId = useId();
  const toast = useToast();
  const { quick } = usePersonMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { nome: "", telefone: "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const person = await quick.mutateAsync({ nome: values.nome.trim(), telefone: values.telefone.trim() });
      toast.success(`Cliente ${person.nome} cadastrado.`);
      onCreated?.(person);
      onClose();
    } catch (error) {
      setFormError(mapServerError(error, setError, { telefone_invalido: "telefone" }, ["nome", "telefone"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title="Cadastro rápido"
      description="Cliente de balcão: só nome e telefone. Os demais dados podem ser completados depois."
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Cadastrar cliente
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField label="Telefone" error={errors.telefone?.message} required>
          <Input type="tel" autoComplete="off" placeholder="(11) 99999-9999" {...register("telefone")} />
        </FormField>
      </form>
    </Dialog>
  );
}
