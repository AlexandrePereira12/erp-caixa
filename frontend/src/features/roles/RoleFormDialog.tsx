import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { PermissionMatrix } from "./PermissionMatrix";
import { useRoleMutations } from "./api";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import type { PapelOut, PermissaoOut } from "@/lib/api/types";
import { parseMoney } from "@/components/pdv/forms";
import { compareDecimal } from "@/lib/decimal";
import { applyServerError } from "@/lib/forms";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do papel.").max(60, "O nome pode ter no máximo 60 caracteres."),
  descricao: z.string().trim().max(500, "A descrição pode ter no máximo 500 caracteres."),
  limite_desconto_pct: z
    .string()
    .trim()
    .refine((v) => parseMoney(v) !== null, "Informe um percentual válido, como 10 ou 12,5.")
    .refine((v) => {
      const parsed = parseMoney(v);
      return parsed === null || (compareDecimal(parsed, "0") >= 0 && compareDecimal(parsed, "100") <= 0);
    }, "O limite deve ficar entre 0 e 100."),
  permissoes: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

export function RoleFormDialog({ catalog, onClose, onCreated }: { catalog: PermissaoOut[] | undefined; onClose: () => void; onCreated: (role: PapelOut) => void }) {
  const formId = useId();
  const toast = useToast();
  const { create } = useRoleMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { nome: "", descricao: "", limite_desconto_pct: "0", permissoes: [] } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const limite = parseMoney(values.limite_desconto_pct);
      const role = await create.mutateAsync({
        nome: values.nome,
        ...(values.descricao ? { descricao: values.descricao } : {}),
        ...(limite !== null ? { limite_desconto_pct: limite } : {}),
        permissoes: values.permissoes,
      });
      toast.success(`Papel "${role.nome}" criado.`);
      onCreated(role);
      onClose();
    } catch (error) {
      setFormError(applyServerError(error, setError, ["nome", "descricao", "limite_desconto_pct"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="lg"
      title="Novo papel"
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Criar papel
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
        <FormField label="Limite de desconto (%)" error={errors.limite_desconto_pct?.message} hint="Maior desconto, em % do consumo, que este papel aplica sem a ajuda de um gerente." required>
          <Input inputMode="decimal" autoComplete="off" {...register("limite_desconto_pct")} />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-fg">Permissões</p>
          {catalog ? (
            <Controller control={control} name="permissoes" render={({ field }) => <PermissionMatrix catalog={catalog} value={field.value} onChange={field.onChange} />} />
          ) : (
            <Alert tone="warning">Sem permissão para listar as permissões disponíveis. O papel será criado sem permissões e poderá ser ajustado depois.</Alert>
          )}
        </div>
      </form>
    </Dialog>
  );
}
