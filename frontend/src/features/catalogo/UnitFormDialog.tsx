import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useUnitMutations } from "./api";
import { mapServerError } from "./formErrors";
import type { UnidadeEditarIn, UnidadeOut } from "./types";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";

const DECIMAL_PLACES = [0, 1, 2, 3] as const;

const schema = z.object({
  sigla: z.string().trim().min(1, "Informe a sigla.").max(10, "A sigla pode ter no máximo 10 caracteres."),
  nome: z.string().trim().min(1, "Informe o nome.").max(60, "O nome pode ter no máximo 60 caracteres."),
  casas_decimais: z.enum(["0", "1", "2", "3"]),
});
type FormValues = z.infer<typeof schema>;

function placesOf(value: string): number {
  return DECIMAL_PLACES.find((places) => String(places) === value) ?? 0;
}

export function UnitFormDialog({ unit, onClose }: { unit?: UnidadeOut | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { create, update } = useUnitMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sigla: unit?.sigla ?? "", nome: unit?.nome ?? "", casas_decimais: String(unit?.casas_decimais ?? 0) as FormValues["casas_decimais"] },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (unit) {
        const body: UnidadeEditarIn = {};
        if (values.sigla.toUpperCase() !== unit.sigla) body.sigla = values.sigla;
        if (values.nome !== unit.nome) body.nome = values.nome;
        if (placesOf(values.casas_decimais) !== unit.casas_decimais) body.casas_decimais = placesOf(values.casas_decimais);
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: unit.id, body });
        toast.success("Unidade atualizada.");
      } else {
        await create.mutateAsync({ sigla: values.sigla, nome: values.nome, casas_decimais: placesOf(values.casas_decimais) });
        toast.success("Unidade criada.");
      }
      onClose();
    } catch (error) {
      setFormError(mapServerError(error, setError, { sigla_em_uso: "sigla", unidade_em_uso: "casas_decimais" }, ["sigla", "nome", "casas_decimais"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title={unit ? "Editar unidade" : "Nova unidade"}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            {unit ? "Salvar" : "Criar unidade"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Sigla" error={errors.sigla?.message} hint="Ex.: UN, KG, L. É salva em maiúsculas." required>
          <Input autoComplete="off" maxLength={10} {...register("sigla")} />
        </FormField>
        <FormField label="Nome" error={errors.nome?.message} required>
          <Input autoComplete="off" {...register("nome")} />
        </FormField>
        <FormField
          label="Casas decimais"
          error={errors.casas_decimais?.message}
          hint="Quantas casas as quantidades desta unidade aceitam: 0 para peças (UN), 3 para peso ou volume (KG, L)."
          required
        >
          <Select {...register("casas_decimais")}>
            {DECIMAL_PLACES.map((places) => (
              <option key={places} value={String(places)}>
                {places === 0 ? "0 (somente inteiros)" : String(places)}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Dialog>
  );
}
