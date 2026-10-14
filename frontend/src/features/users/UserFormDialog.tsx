import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { RoleCheckboxGroup } from "./RoleCheckboxGroup";
import { useUserMutations } from "./api";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, PasswordInput } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import type { PapelOut, UsuarioEditarIn, UsuarioOut } from "@/lib/api/types";
import { applyServerError } from "@/lib/forms";

const MIN_TEMP_PASSWORD = 10;

function makeSchema(mode: "create" | "edit") {
  return z
    .object({
      nome: z.string().trim().min(1, "Informe o nome.").max(120, "O nome pode ter no máximo 120 caracteres."),
      email: z.string().trim().min(1, "Informe o e-mail.").pipe(z.email("Informe um e-mail válido.")),
      senha_temporaria: z.string().max(128, "A senha pode ter no máximo 128 caracteres."),
      papeis: z.array(z.number()),
    })
    .superRefine((value, ctx) => {
      if (mode === "create" && value.senha_temporaria.length < MIN_TEMP_PASSWORD) {
        ctx.addIssue({ code: "custom", path: ["senha_temporaria"], message: `A senha temporária deve ter no mínimo ${MIN_TEMP_PASSWORD} caracteres.` });
      }
    });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export interface UserFormDialogProps {
  /** Usuário em edição; ausente = criação. */
  user?: UsuarioOut | undefined;
  roles: PapelOut[] | undefined;
  rolesLoading: boolean;
  rolesError: unknown;
  canListRoles: boolean;
  onClose: () => void;
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

export function UserFormDialog({ user, roles, rolesLoading, rolesError, canListRoles, onClose }: UserFormDialogProps) {
  const mode = user ? "edit" : "create";
  const formId = useId();
  const toast = useToast();
  const { create, update } = useUserMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(mode), [mode]);

  const originalRoleIds = useMemo(() => user?.papeis.map((p) => p.id) ?? [], [user]);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: user?.nome ?? "", email: user?.email ?? "", senha_temporaria: "", papeis: originalRoleIds },
  });

  const rolesUnavailable = !canListRoles;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    // Criar exige ao menos um papel; editar sem acesso à lista de papéis simplesmente não os altera.
    if ((!user || !rolesUnavailable) && values.papeis.length === 0) {
      setError("papeis", { type: "validate", message: "Selecione ao menos um papel." });
      return;
    }
    try {
      if (user) {
        // PATCH só com o que mudou: evita ruído de auditoria e falsos conflitos (ex.: e-mail em uso).
        const body: UsuarioEditarIn = {};
        if (values.nome !== user.nome) body.nome = values.nome;
        if (values.email !== user.email) body.email = values.email;
        if (!rolesUnavailable && !sameSet(values.papeis, originalRoleIds)) body.papeis = values.papeis;
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: user.id, body });
        toast.success("Usuário atualizado.");
      } else {
        await create.mutateAsync({ nome: values.nome, email: values.email, senha_temporaria: values.senha_temporaria, papeis: values.papeis });
        toast.success("Usuário criado.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "email_em_uso") {
        setError("email", { type: "server", message: error.message });
      } else if (error instanceof ApiError && error.codigo === "senha_fraca") {
        setError("senha_temporaria", { type: "server", message: error.message });
      } else {
        setFormError(applyServerError(error, setError, ["nome", "email", "senha_temporaria", "papeis"]));
      }
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title={user ? "Editar usuário" : "Novo usuário"}
      description={user ? undefined : "Informe os dados e uma senha temporária para o primeiro acesso."}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting} disabled={!user && rolesUnavailable}>
            {user ? "Salvar" : "Criar usuário"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField label="E-mail" error={errors.email?.message} required>
          <Input type="email" autoComplete="off" {...register("email")} />
        </FormField>
        {!user && (
          <FormField label="Senha temporária" error={errors.senha_temporaria?.message} hint={`Mínimo de ${MIN_TEMP_PASSWORD} caracteres. Repasse ao usuário por um canal seguro.`} required>
            <PasswordInput autoComplete="new-password" {...register("senha_temporaria")} />
          </FormField>
        )}
        {rolesUnavailable ? (
          <Alert tone="warning">Você não tem permissão para listar os papéis; {user ? "os papéis deste usuário não podem ser alterados aqui" : "não é possível escolher o papel do novo usuário"}.</Alert>
        ) : rolesLoading ? (
          <LoadingBlock label="Carregando papéis…" />
        ) : rolesError || !roles ? (
          <Alert tone="danger">Não foi possível carregar os papéis. Feche e tente novamente.</Alert>
        ) : (
          <Controller
            control={control}
            name="papeis"
            render={({ field }) => <RoleCheckboxGroup roles={roles} value={field.value} onChange={field.onChange} error={errors.papeis?.message} />}
          />
        )}
      </form>
    </Dialog>
  );
}
