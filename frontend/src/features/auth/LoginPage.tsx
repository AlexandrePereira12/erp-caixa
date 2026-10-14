import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { AuthShell } from "./AuthShell";
import { LoginArt } from "./LoginArt";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, PasswordInput } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { LoadingBlock } from "@/components/States";
import { login } from "@/lib/auth/auth";
import { useSession } from "@/lib/auth/hooks";
import { applyServerError } from "@/lib/forms";
import { usePageTitle } from "@/lib/usePageTitle";

const schema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").max(254, "E-mail muito longo."),
  senha: z.string().min(1, "Informe a senha.").max(128, "Senha muito longa."),
});
type FormValues = z.infer<typeof schema>;

function destinationFrom(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const path = from?.pathname;
  if (!path || path === "/login" || path === "/trocar-senha" || path === "/acesso-suspenso") return "/";
  return `${path}${from?.search ?? ""}`;
}

export function LoginPage() {
  usePageTitle("Entrar");
  const location = useLocation();
  const { status, mustChangePassword } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", senha: "" } });

  if (status === "loading") {
    return (
      <AuthShell title="Carregando">
        <LoadingBlock label="Verificando sua sessão…" />
      </AuthShell>
    );
  }
  if (status === "authenticated") return <Navigate to={mustChangePassword ? "/trocar-senha" : destinationFrom(location.state)} replace />;
  if (status === "suspended") return <Navigate to="/acesso-suspenso" replace />;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await login(values.email, values.senha);
    } catch (error) {
      setFormError(applyServerError(error, setError, ["email", "senha"]));
    }
  }

  return (
    <AuthShell title="Entrar" description="Acesse com seu e-mail e senha." art={<LoginArt className="h-full max-h-[min(34rem,46dvh)] w-full" />}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="E-mail" error={errors.email?.message} required>
          <Input type="email" autoComplete="username" {...register("email")} />
        </FormField>
        <FormField label="Senha" error={errors.senha?.message} required>
          <PasswordInput autoComplete="current-password" {...register("senha")} />
        </FormField>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
