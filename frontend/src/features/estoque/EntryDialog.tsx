import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useStockMutations } from "./api";
import { StockProductField } from "./StockProductField";
import { SupplierField, type SupplierValue } from "./SupplierField";
import type { EntradaIn, SaldoOut } from "./types";
import { useUnitScales } from "@/features/catalogo/api";
import { parseOptionalMoney, parseQuantityInput } from "@/features/catalogo/decimalInput";
import { mapServerError } from "@/features/catalogo/formErrors";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { formatDecimal } from "@/lib/money";

const schema = z.object({
  quantidade: z.string(),
  custo_unitario: z.string(),
  documento: z.string().trim().max(60, "O documento pode ter no máximo 60 caracteres."),
  justificativa: z.string().trim().max(500, "A justificativa pode ter no máximo 500 caracteres."),
});
type FormValues = z.infer<typeof schema>;

/** Entrada de estoque (compra, reposição). O custo unitário, quando informado, atualiza o custo médio no backend. */
export function EntryDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { scaleOf } = useUnitScales();
  const { entry } = useStockMutations();
  const [product, setProduct] = useState<SaldoOut | null>(null);
  const [supplier, setSupplier] = useState<SupplierValue | null>(null);
  const [productError, setProductError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { quantidade: "", custo_unitario: "", documento: "", justificativa: "" } });

  const scale = scaleOf(product?.unidade);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    if (!product) {
      setProductError("Selecione o produto.");
      return;
    }
    const quantity = parseQuantityInput(values.quantidade, { scale, unit: product.unidade });
    const cost = parseOptionalMoney(values.custo_unitario, { scale: 4 });
    if (quantity.error !== undefined) setError("quantidade", { type: "validate", message: quantity.error });
    if (cost.error !== undefined) setError("custo_unitario", { type: "validate", message: cost.error });
    if (quantity.error !== undefined || cost.error !== undefined) return;

    const body: EntradaIn = {
      produto_id: product.produto_id,
      quantidade: quantity.value,
      documento: values.documento || null,
      justificativa: values.justificativa || null,
    };
    if (cost.value !== null) body.custo_unitario = cost.value;
    if (supplier) body.fornecedor_id = supplier.id;
    try {
      const movement = await entry.mutateAsync(body);
      toast.success(`Entrada registrada: +${formatDecimal(movement.quantidade)} ${movement.unidade} de ${movement.produto_nome}. Saldo: ${formatDecimal(movement.saldo_apos)} ${movement.unidade}.`);
      onClose();
    } catch (error) {
      setFormError(mapServerError(error, setError, { quantidade_fracionada: "quantidade" }, ["quantidade", "custo_unitario", "documento", "justificativa"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title="Registrar entrada"
      description="Soma a quantidade ao saldo do produto."
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Registrar entrada
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
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
          hint={product ? (scale === 0 ? "Esta unidade aceita só números inteiros." : `Até ${scale} casa(s) decimal(is).`) : undefined}
          required
        >
          <Input inputMode="decimal" autoComplete="off" placeholder="Ex.: 1,5" {...register("quantidade")} />
        </FormField>
        <FormField label="Custo unitário (R$)" error={errors.custo_unitario?.message} hint="Opcional. Quando informado, o sistema recalcula o custo médio do produto.">
          <Input inputMode="decimal" autoComplete="off" placeholder="Ex.: 12,50" {...register("custo_unitario")} />
        </FormField>
        <SupplierField value={supplier} onChange={setSupplier} />
        <FormField label="Documento" error={errors.documento?.message} hint="Nota fiscal, pedido de compra…">
          <Input autoComplete="off" maxLength={60} {...register("documento")} />
        </FormField>
        <FormField label="Justificativa" error={errors.justificativa?.message}>
          <Textarea rows={2} {...register("justificativa")} />
        </FormField>
      </form>
    </Dialog>
  );
}
