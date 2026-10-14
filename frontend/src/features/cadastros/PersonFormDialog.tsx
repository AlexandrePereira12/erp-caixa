import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { usePersonMutations, usePersonOpenBalance } from "./api";
import { documentLengthError, maskCep, maskDocument, onlyDigits } from "./masks";
import { buildCreateBody, buildPatchBody, type AddressValues, type PersonFormValues } from "./personBody";
import { PERSON_ROLES, PERSON_TYPE_LABELS, ROLE_LABELS, type PessoaOut } from "./types";
import { decimalToInput, parseMoneyInput } from "@/features/catalogo/decimalInput";
import { mapServerError } from "@/features/catalogo/formErrors";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Checkbox, Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { formatMoney } from "@/lib/money";

const addressSchema = z.object({
  rotulo: z.string().trim().max(30, "O rótulo pode ter no máximo 30 caracteres."),
  cep: z.string().refine((value) => [0, 8].includes(onlyDigits(value).length), "O CEP deve ter 8 dígitos."),
  logradouro: z.string().trim().min(1, "Informe o logradouro.").max(160, "O logradouro pode ter no máximo 160 caracteres."),
  numero: z.string().trim().max(20, "O número pode ter no máximo 20 caracteres."),
  complemento: z.string().trim().max(80, "O complemento pode ter no máximo 80 caracteres."),
  bairro: z.string().trim().max(80, "O bairro pode ter no máximo 80 caracteres."),
  cidade: z.string().trim().min(1, "Informe a cidade.").max(80, "A cidade pode ter no máximo 80 caracteres."),
  uf: z.string().trim().regex(/^[A-Za-z]{2}$/, "Informe a UF com 2 letras."),
  principal: z.boolean(),
});

const schema = z
  .object({
    tipo: z.enum(["F", "J"]),
    nome: z.string().trim().min(1, "Informe o nome.").max(160, "O nome pode ter no máximo 160 caracteres."),
    nome_fantasia: z.string().trim().max(160, "O nome fantasia pode ter no máximo 160 caracteres."),
    documento: z.string(),
    telefone: z.string().trim().max(20, "O telefone pode ter no máximo 20 caracteres."),
    whatsapp: z.string().trim().max(20, "O WhatsApp pode ter no máximo 20 caracteres."),
    email: z
      .string()
      .trim()
      .max(254, "O e-mail pode ter no máximo 254 caracteres.")
      .refine((value) => value === "" || z.email().safeParse(value).success, "Informe um e-mail válido."),
    observacoes: z.string().max(2000, "As observações podem ter no máximo 2000 caracteres."),
    ativo: z.boolean(),
    papeis: z.array(z.enum(["cliente", "fornecedor", "colaborador"])).min(1, "Selecione ao menos um papel."),
    enderecos: z.array(addressSchema),
    aceita_fiado: z.boolean(),
    limite_fiado: z.string(),
  })
  .superRefine((value, ctx) => {
    const message = documentLengthError(value.documento, value.tipo);
    if (message) ctx.addIssue({ code: "custom", path: ["documento"], message });
  });
type FormValues = z.infer<typeof schema>;

const EMPTY_ADDRESS: AddressValues = { rotulo: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", principal: false };

function initialValues(person: PessoaOut | undefined): PersonFormValues {
  if (!person) {
    return { tipo: "F", nome: "", nome_fantasia: "", documento: "", telefone: "", whatsapp: "", email: "", observacoes: "", ativo: true, papeis: ["cliente"], enderecos: [], aceita_fiado: false, limite_fiado: "0,00" };
  }
  const tipo = person.tipo === "J" ? "J" : "F";
  return {
    tipo,
    nome: person.nome,
    nome_fantasia: person.nome_fantasia ?? "",
    documento: maskDocument(person.documento ?? "", tipo),
    telefone: person.telefone ?? "",
    whatsapp: person.whatsapp ?? "",
    email: person.email ?? "",
    observacoes: person.observacoes ?? "",
    ativo: person.ativo,
    papeis: PERSON_ROLES.filter((role) => person.papeis.includes(role)),
    enderecos: person.enderecos.map((address) => ({
      rotulo: address.rotulo ?? "",
      cep: maskCep(address.cep ?? ""),
      logradouro: address.logradouro,
      numero: address.numero ?? "",
      complemento: address.complemento ?? "",
      bairro: address.bairro ?? "",
      cidade: address.cidade,
      uf: address.uf,
      principal: address.principal ?? false,
    })),
    aceita_fiado: person.cliente?.aceita_fiado ?? false,
    limite_fiado: decimalToInput(person.cliente?.limite_fiado ?? "0.00"),
  };
}

function OpenBalance({ personId }: { personId: number }) {
  const balance = usePersonOpenBalance(personId, true);
  if (balance.isLoading) return <p className="text-sm text-muted">Carregando saldo em aberto…</p>;
  if (balance.error || !balance.data) return <p className="text-sm text-danger-text">Saldo em aberto indisponível: {errorMessage(balance.error)}</p>;
  const { saldo_aberto, titulos_abertos, limite_disponivel } = balance.data;
  return (
    <dl className="grid gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted">Saldo em aberto</dt>
        <dd className="font-semibold text-fg">{formatMoney(saldo_aberto)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Títulos em aberto</dt>
        <dd className="text-fg">{titulos_abertos}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Limite disponível</dt>
        <dd className="text-fg">{limite_disponivel === null ? "Sem limite" : formatMoney(limite_disponivel)}</dd>
      </div>
    </dl>
  );
}

export function PersonFormDialog({ person, onClose }: { person?: PessoaOut | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { can } = usePermissions();
  const canSetFiado = can("pessoas.definir_fiado");
  const canSeeBalance = can("financeiro.listar");
  const { create, update } = usePersonMutations();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues(person) });
  const { fields, append, remove } = useFieldArray({ control, name: "enderecos" });

  const tipo = useWatch({ control, name: "tipo" });
  const papeis = useWatch({ control, name: "papeis" });
  const addresses = useWatch({ control, name: "enderecos" });
  const isClient = papeis.includes("cliente");

  function setPrincipal(index: number) {
    fields.forEach((_, i) => setValue(`enderecos.${i}.principal`, i === index, { shouldDirty: true }));
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    let limite: string | null = null;
    if (canSetFiado && values.papeis.includes("cliente")) {
      const parsed = parseMoneyInput(values.limite_fiado.trim() || "0", { scale: 2 });
      if (parsed.error !== undefined) {
        setError("limite_fiado", { type: "validate", message: parsed.error });
        return;
      }
      limite = parsed.value;
    }
    const options = { canSetFiado, limite };
    try {
      if (person) {
        const body = buildPatchBody(person, values, options);
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: person.id, body });
        toast.success("Cadastro atualizado.");
      } else {
        await create.mutateAsync(buildCreateBody(values, options));
        toast.success("Pessoa cadastrada.");
      }
      onClose();
    } catch (error) {
      setFormError(
        mapServerError(
          error,
          setError,
          { documento_invalido: "documento", documento_em_uso: "documento", telefone_invalido: "telefone" },
          ["tipo", "nome", "nome_fantasia", "documento", "telefone", "whatsapp", "email", "observacoes", "papeis"],
        ),
      );
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="lg"
      title={person ? "Editar pessoa" : "Nova pessoa"}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            {person ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Alert tone="danger">{formError}</Alert>}

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-fg">Tipo de pessoa</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(["F", "J"] as const).map((value) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input
                  type="radio"
                  value={value}
                  className="h-4 w-4 accent-brand"
                  {...register("tipo", { onChange: (event) => setValue("documento", maskDocument(getValues("documento"), event.target.value as "F" | "J")) })}
                />
                {PERSON_TYPE_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome" error={errors.nome?.message} hint={tipo === "J" ? "Razão social da empresa." : undefined} required className="sm:col-span-2">
            <Input autoComplete="off" {...register("nome")} />
          </FormField>
          {tipo === "J" && (
            <FormField label="Nome fantasia" error={errors.nome_fantasia?.message} className="sm:col-span-2">
              <Input autoComplete="off" {...register("nome_fantasia")} />
            </FormField>
          )}
          <Controller
            control={control}
            name="documento"
            render={({ field }) => (
              <FormField label={tipo === "F" ? "CPF" : "CNPJ"} error={errors.documento?.message} hint="O sistema confere os dígitos verificadores ao salvar.">
                <Input inputMode="numeric" autoComplete="off" placeholder={tipo === "F" ? "000.000.000-00" : "00.000.000/0000-00"} value={field.value} onBlur={field.onBlur} onChange={(event) => field.onChange(maskDocument(event.target.value, tipo))} />
              </FormField>
            )}
          />
          <FormField label="E-mail" error={errors.email?.message}>
            <Input type="email" autoComplete="off" {...register("email")} />
          </FormField>
          <FormField label="Telefone" error={errors.telefone?.message}>
            <Input type="tel" autoComplete="off" {...register("telefone")} />
          </FormField>
          <FormField label="WhatsApp" error={errors.whatsapp?.message}>
            <Input type="tel" autoComplete="off" {...register("whatsapp")} />
          </FormField>
          <FormField label="Observações" error={errors.observacoes?.message} className="sm:col-span-2">
            <Textarea {...register("observacoes")} />
          </FormField>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-fg">
            Papéis<span aria-hidden="true" className="ml-0.5 text-danger-text">*</span>
          </legend>
          <Controller
            control={control}
            name="papeis"
            render={({ field }) => (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {PERSON_ROLES.map((role) => (
                  <Checkbox
                    key={role}
                    label={ROLE_LABELS[role]}
                    checked={field.value.includes(role)}
                    onChange={(event) => field.onChange(event.target.checked ? [...field.value, role] : field.value.filter((item) => item !== role))}
                  />
                ))}
              </div>
            )}
          />
          {errors.papeis?.message && (
            <p role="alert" className="mt-1 text-sm text-danger-text">
              {errors.papeis.message}
            </p>
          )}
        </fieldset>

        {isClient && (
          <fieldset className="space-y-3 rounded-md border border-line p-4">
            <legend className="px-1 text-sm font-medium text-fg">Cliente</legend>
            {!canSetFiado && <Alert tone="info">Somente quem tem a permissão “Definir fiado” pode alterar as condições de fiado.</Alert>}
            <Controller
              control={control}
              name="aceita_fiado"
              render={({ field }) => <Checkbox label="Aceita fiado" checked={field.value} disabled={!canSetFiado} onChange={(event) => field.onChange(event.target.checked)} />}
            />
            <FormField label="Limite de fiado (R$)" error={errors.limite_fiado?.message} hint="0 = sem limite">
              <Input inputMode="decimal" autoComplete="off" disabled={!canSetFiado} {...register("limite_fiado")} />
            </FormField>
            {person && person.papeis.includes("cliente") && canSeeBalance && <OpenBalance personId={person.id} />}
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-fg">Endereços</legend>
          {fields.length === 0 && <p className="text-sm text-muted">Nenhum endereço cadastrado.</p>}
          {fields.map((field, index) => {
            const fieldErrors = errors.enderecos?.[index];
            return (
              <fieldset key={field.id} className="space-y-3 rounded-md border border-line p-4">
                <legend className="px-1 text-sm font-medium text-fg">Endereço {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-6">
                  <FormField label="Rótulo" error={fieldErrors?.rotulo?.message} className="sm:col-span-2">
                    <Input autoComplete="off" placeholder="Casa, Trabalho…" {...register(`enderecos.${index}.rotulo`)} />
                  </FormField>
                  <Controller
                    control={control}
                    name={`enderecos.${index}.cep`}
                    render={({ field: cep }) => (
                      <FormField label="CEP" error={fieldErrors?.cep?.message} className="sm:col-span-2">
                        <Input inputMode="numeric" autoComplete="off" placeholder="00000-000" value={cep.value} onBlur={cep.onBlur} onChange={(event) => cep.onChange(maskCep(event.target.value))} />
                      </FormField>
                    )}
                  />
                  <FormField label="UF" error={fieldErrors?.uf?.message} required className="sm:col-span-2">
                    <Input autoComplete="off" maxLength={2} className="uppercase" {...register(`enderecos.${index}.uf`)} />
                  </FormField>
                  <FormField label="Logradouro" error={fieldErrors?.logradouro?.message} required className="sm:col-span-4">
                    <Input autoComplete="off" {...register(`enderecos.${index}.logradouro`)} />
                  </FormField>
                  <FormField label="Número" error={fieldErrors?.numero?.message} className="sm:col-span-2">
                    <Input autoComplete="off" {...register(`enderecos.${index}.numero`)} />
                  </FormField>
                  <FormField label="Complemento" error={fieldErrors?.complemento?.message} className="sm:col-span-2">
                    <Input autoComplete="off" {...register(`enderecos.${index}.complemento`)} />
                  </FormField>
                  <FormField label="Bairro" error={fieldErrors?.bairro?.message} className="sm:col-span-2">
                    <Input autoComplete="off" {...register(`enderecos.${index}.bairro`)} />
                  </FormField>
                  <FormField label="Cidade" error={fieldErrors?.cidade?.message} required className="sm:col-span-2">
                    <Input autoComplete="off" {...register(`enderecos.${index}.cidade`)} />
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                    <input type="radio" name="endereco-principal" className="h-4 w-4 accent-brand" checked={addresses[index]?.principal ?? false} onChange={() => setPrincipal(index)} />
                    Endereço principal
                  </label>
                  <Button variant="ghost" size="sm" className="text-danger-text" aria-label={`Remover endereço ${index + 1}`} onClick={() => remove(index)}>
                    Remover
                  </Button>
                </div>
              </fieldset>
            );
          })}
          <Button onClick={() => append({ ...EMPTY_ADDRESS, principal: fields.length === 0 })}>
            <PlusIcon width={16} height={16} />
            Adicionar endereço
          </Button>
          {fields.length > 1 && <p className="text-xs text-muted">Se nenhum endereço for marcado como principal, o primeiro será o principal.</p>}
        </fieldset>

        <Controller control={control} name="ativo" render={({ field }) => <Checkbox label="Cadastro ativo" checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />} />
      </form>
    </Dialog>
  );
}
