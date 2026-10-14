import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthShell } from "./AuthShell";
import { Alert } from "@/components/Alert";
import { Button, buttonClasses } from "@/components/Button";
import { PasswordInput } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { changePassword, logout } from "@/lib/auth/auth";
import { useSession } from "@/lib/auth/hooks";
import { applyServerError } from "@/lib/forms";
import { usePageTitle } from "@/lib/usePageTitle";

export const MIN_PASSWORD_LENGTH = 10;

const schema = z
  .object({
    senha_atual: z.string().min(1, "Informe a senha atual.").max(128),
    nova_senha: z.string().min(MIN_PASSWORD_LENGTH, `A nova senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`).max(128, "A senha pode ter no máximo 128 caracteres."),
    confirmacao: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((v) => v.nova_senha === v.confirmacao, { path: ["confirmacao"], message: "A confirmação não confere com a nova senha." })
  .refine((v) => v.nova_senha !== v.senha_atual, { path: ["nova_senha"], message: "A nova senha deve ser diferente da atual." });
type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  usePageTitle("Trocar senha");
  const navigate = useNavigate();
  const toast = useToast();
  const { mustChangePassword } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { senha_atual: "", nova_senha: "", confirmacao: "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await changePassword({ senha_atual: values.senha_atual, nova_senha: values.nova_senha });
      toast.success("Senha alterada com sucesso.");
      navigate("/", { replace: true });
    } catch (error) {
      // Erros de negócio com campo próprio: senha atual errada, senha fraca ou repetida.
      if (error instanceof ApiError && error.codigo === "senha_atual_incorreta") {
        setError("senha_atual", { type: "server", message: error.message });
      } else if (error instanceof ApiError && (error.codigo === "senha_fraca" || error.codigo === "senha_repetida")) {
        setError("nova_senha", { type: "server", message: error.message });
      } else {
        setFormError(applyServerError(error, setError, ["senha_atual", "nova_senha"]));
      }
    }
  }

  return (
    <AuthShell title="Trocar senha" description={mustChangePassword ? undefined : "Defina uma nova senha para a sua conta."}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {mustChangePassword && <Alert tone="warning">Por segurança, você precisa trocar a senha antes de continuar.</Alert>}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Senha atual" error={errors.senha_atual?.message} required>
          <PasswordInput autoComplete="current-password" {...register("senha_atual")} />
        </FormField>
        <FormField label="Nova senha" error={errors.nova_senha?.message} hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres. Use uma senha que você não usa em outros lugares.`} required>
          <PasswordInput autoComplete="new-password" {...register("nova_senha")} />
        </FormField>
        <FormField label="Confirmar nova senha" error={errors.confirmacao?.message} required>
          <PasswordInput autoComplete="new-password" {...register("confirmacao")} />
        </FormField>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {mustChangePassword ? (
            <Button onClick={() => void logout()}>Sair</Button>
          ) : (
            <Link to="/" className={buttonClasses()}>
              Cancelar
            </Link>
          )}
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Alterar senha
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
