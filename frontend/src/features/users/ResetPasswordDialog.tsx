import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUserMutations } from "./api";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { PasswordInput } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import type { UsuarioOut } from "@/lib/api/types";
import { applyServerError } from "@/lib/forms";

const MIN_TEMP_PASSWORD = 10;
const schema = z.object({
  senha_temporaria: z.string().min(MIN_TEMP_PASSWORD, `A senha temporária deve ter no mínimo ${MIN_TEMP_PASSWORD} caracteres.`).max(128, "A senha pode ter no máximo 128 caracteres."),
});
type FormValues = z.infer<typeof schema>;

export function ResetPasswordDialog({ user, onClose }: { user: UsuarioOut; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { resetPassword } = useUserMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { senha_temporaria: "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await resetPassword.mutateAsync({ id: user.id, senha_temporaria: values.senha_temporaria });
      toast.success(`Senha de ${user.nome} redefinida.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "senha_fraca") {
        setError("senha_temporaria", { type: "server", message: error.message });
      } else {
        setFormError(applyServerError(error, setError, ["senha_temporaria"]));
      }
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="sm"
      title="Redefinir senha"
      description={`Defina uma senha temporária para ${user.nome}. Repasse-a por um canal seguro.`}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Redefinir senha
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Senha temporária" error={errors.senha_temporaria?.message} hint={`Mínimo de ${MIN_TEMP_PASSWORD} caracteres.`} required>
          <PasswordInput autoComplete="new-password" {...register("senha_temporaria")} />
        </FormField>
      </form>
    </Dialog>
  );
}
