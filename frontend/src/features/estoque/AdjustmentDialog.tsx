import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useStockMutations } from "./api";
import { humanizeStockMessage } from "./messages";
import { StockProductField } from "./StockProductField";
import { ADJUSTMENT_OPTIONS, type AjusteIn, type SaldoOut } from "./types";
import { useUnitScales } from "@/features/catalogo/api";
import { parseQuantityInput } from "@/features/catalogo/decimalInput";
import { mapServerError } from "@/features/catalogo/formErrors";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDecimal } from "@/lib/money";

const schema = z.object({
  tipo: z.enum(["ajuste", "perda", "saida"]),
  quantidade: z.string(),
  justificativa: z.string().trim().min(3, "A justificativa deve ter ao menos 3 caracteres.").max(500, "A justificativa pode ter no máximo 500 caracteres."),
  permitir_negativo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

/** Ajuste (±), perda ou saída manual. Estoque negativo só com a permissão estoque.permitir_negativo. */
export function AdjustmentDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { can } = usePermissions();
  const canNegative = can("estoque.permitir_negativo");
  const { scaleOf } = useUnitScales();
  const { adjust } = useStockMutations();
  const [product, setProduct] = useState<SaldoOut | null>(null);
  const [productError, setProductError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { tipo: "ajuste", quantidade: "", justificativa: "", permitir_negativo: false } });

  const tipo = useWatch({ control, name: "tipo" });
  const option = ADJUSTMENT_OPTIONS.find((item) => item.value === tipo);
  const scale = scaleOf(product?.unidade);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    setInsufficient(null);
    if (!product) {
      setProductError("Selecione o produto.");
      return;
    }
    const quantity = parseQuantityInput(values.quantidade, { scale, unit: product.unidade, allowNegative: true, allowZero: true });
    if (quantity.error !== undefined) {
      setError("quantidade", { type: "validate", message: quantity.error });
      return;
    }
    const sign = compareDecimal(quantity.value, "0");
    if (sign === 0) {
      setError("quantidade", { type: "validate", message: "A quantidade não pode ser zero." });
      return;
    }
    if (sign < 0 && values.tipo !== "ajuste") {
      setError("quantidade", { type: "validate", message: "Para perda e saída informe a quantidade positiva." });
      return;
    }

    const body: AjusteIn = { produto_id: product.produto_id, tipo: values.tipo, quantidade: quantity.value, justificativa: values.justificativa };
    if (canNegative && values.permitir_negativo) body.permitir_negativo = true;
    try {
      const movement = await adjust.mutateAsync(body);
      toast.success(`Movimento registrado em ${movement.produto_nome}. Saldo: ${formatDecimal(movement.saldo_apos)} ${movement.unidade}.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "estoque_insuficiente") {
        // A mensagem do backend já traz o saldo e a quantidade necessária.
        setInsufficient(humanizeStockMessage(error.message, product.unidade));
        return;
      }
      setFormError(mapServerError(error, setError, { quantidade_fracionada: "quantidade", quantidade_invalida: "quantidade" }, ["quantidade", "justificativa", "tipo"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title="Ajuste, perda ou saída"
      description="Movimentação manual de estoque. A justificativa fica registrada."
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Registrar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {insufficient && (
          <Alert tone="danger" title="Estoque insuficiente">
            {insufficient}
            {canNegative ? " Marque “Permitir estoque negativo” se for preciso registrar mesmo assim." : ""}
          </Alert>
        )}
        <FormField label="Tipo de movimento" error={errors.tipo?.message} hint={option?.hint} required>
          <Select {...register("tipo")}>
            {ADJUSTMENT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </FormField>
        <StockProductField
          value={product}
          onChange={(picked) => {
            setProduct(picked);
            setProductError(undefined);
          }}
          error={productError}
        />
        <FormField
          label={`Quantidade${product ? ` (${product.unidade})` : ""}`}
          error={errors.quantidade?.message}
          hint={tipo === "ajuste" ? "Use o sinal de menos (-) para baixar o saldo. Ex.: -2 ou 1,5." : "Valor positivo; o sistema baixa do saldo."}
          required
        >
          <Input inputMode="decimal" autoComplete="off" placeholder={tipo === "ajuste" ? "Ex.: -2 ou 1,5" : "Ex.: 2"} {...register("quantidade")} />
        </FormField>
        <FormField label="Justificativa" error={errors.justificativa?.message} hint="Obrigatória, com ao menos 3 caracteres." required>
          <Textarea rows={2} {...register("justificativa")} />
        </FormField>
        {canNegative && (
          <Controller
            control={control}
            name="permitir_negativo"
            render={({ field }) => (
              <Checkbox
                label="Permitir estoque negativo"
                description="Registra o movimento mesmo que o saldo fique abaixo de zero."
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              />
            )}
          />
        )}
      </form>
    </Dialog>
  );
}
