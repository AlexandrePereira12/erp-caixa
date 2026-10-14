import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useCategories, useProductMutations, useUnits } from "./api";
import { decimalToInput, formatCost, parseMoneyInput, parseQuantityInput } from "./decimalInput";
import { mapServerError } from "./formErrors";
import { defaultsForType, PRODUCT_TYPES, productTypeLabel, type ProdutoEditarIn, type ProdutoIn, type ProdutoOut, type TipoProduto } from "./types";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Checkbox, Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { parsePositiveInt } from "@/components/useListParams";
import { compareDecimal } from "@/lib/decimal";
import { errorMessage } from "@/lib/api/errors";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(160, "O nome pode ter no máximo 160 caracteres."),
  tipo: z.enum(["revenda", "preparado", "insumo", "embalagem"]),
  categoria_id: z.string(),
  unidade_id: z.string().min(1, "Selecione a unidade."),
  codigo: z.string().trim().max(40, "O código pode ter no máximo 40 caracteres."),
  codigo_barras: z.string().trim().max(32, "O código de barras pode ter no máximo 32 caracteres."),
  preco_venda: z.string(),
  custo_inicial: z.string(),
  estoque_minimo: z.string(),
  controla_estoque: z.boolean(),
  vendavel: z.boolean(),
  ativo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const orNull = (text: string): string | null => text.trim() || null;

function initialValues(product: ProdutoOut | undefined): FormValues {
  if (product) {
    return {
      nome: product.nome,
      tipo: product.tipo as TipoProduto,
      categoria_id: product.categoria ? String(product.categoria.id) : "",
      unidade_id: String(product.unidade.id),
      codigo: product.codigo ?? "",
      codigo_barras: product.codigo_barras ?? "",
      preco_venda: decimalToInput(product.preco_venda),
      custo_inicial: "",
      estoque_minimo: decimalToInput(product.estoque_minimo, { trim: true }) || "0",
      controla_estoque: product.controla_estoque,
      vendavel: product.vendavel,
      ativo: product.ativo,
    };
  }
  return {
    nome: "",
    tipo: "revenda",
    categoria_id: "",
    unidade_id: "",
    codigo: "",
    codigo_barras: "",
    preco_venda: "0,00",
    custo_inicial: "",
    estoque_minimo: "0",
    ...defaultsForType("revenda"),
    ativo: true,
  };
}

export function ProductFormDialog({ product, onClose }: { product?: ProdutoOut | undefined; onClose: () => void }) {
  const mode = product ? "edit" : "create";
  const formId = useId();
  const toast = useToast();
  const { create, update } = useProductMutations();
  const categories = useCategories();
  const units = useUnits();
  const [formError, setFormError] = useState<string | null>(null);
  // Defaults por tipo valem só na criação, e só até o usuário mexer no próprio campo.
  const [touched, setTouched] = useState({ controla_estoque: false, vendavel: false });

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues(product) });

  const unidadeId = useWatch({ control, name: "unidade_id" });
  const controla = useWatch({ control, name: "controla_estoque" });
  const unit = units.data?.find((u) => String(u.id) === unidadeId);

  function onTipoChange(tipo: TipoProduto) {
    if (mode !== "create") return;
    const defaults = defaultsForType(tipo);
    if (!touched.controla_estoque) setValue("controla_estoque", defaults.controla_estoque);
    if (!touched.vendavel) setValue("vendavel", defaults.vendavel);
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const unidadeSelecionada = units.data?.find((u) => String(u.id) === values.unidade_id);
    const unidadeIdNumber = parsePositiveInt(values.unidade_id);
    if (!unidadeSelecionada || unidadeIdNumber === undefined) {
      setError("unidade_id", { type: "validate", message: "Selecione a unidade." });
      return;
    }

    let valid = true;
    const preco = parseMoneyInput(values.preco_venda, { scale: 2 });
    if (preco.error !== undefined) {
      setError("preco_venda", { type: "validate", message: preco.error });
      valid = false;
    }
    let custo: string | null = null;
    if (mode === "create" && values.custo_inicial.trim()) {
      const parsed = parseMoneyInput(values.custo_inicial, { scale: 4 });
      if (parsed.error !== undefined) {
        setError("custo_inicial", { type: "validate", message: parsed.error });
        valid = false;
      } else custo = parsed.value;
    }
    let minimo = "0";
    if (values.controla_estoque) {
      const parsed = parseQuantityInput(values.estoque_minimo, { scale: unidadeSelecionada.casas_decimais, unit: unidadeSelecionada.sigla, allowZero: true });
      if (parsed.error !== undefined) {
        setError("estoque_minimo", { type: "validate", message: parsed.error });
        valid = false;
      } else minimo = parsed.value;
    }
    if (!valid || preco.error !== undefined) return;

    const categoriaId = values.categoria_id ? (parsePositiveInt(values.categoria_id) ?? null) : null;
    try {
      if (product) {
        const body: ProdutoEditarIn = {};
        if (values.nome !== product.nome) body.nome = values.nome;
        if (values.tipo !== product.tipo) body.tipo = values.tipo;
        if (categoriaId !== (product.categoria?.id ?? null)) body.categoria_id = categoriaId;
        if (unidadeIdNumber !== product.unidade.id) body.unidade_id = unidadeIdNumber;
        if (orNull(values.codigo) !== product.codigo) body.codigo = orNull(values.codigo);
        if (orNull(values.codigo_barras) !== product.codigo_barras) body.codigo_barras = orNull(values.codigo_barras);
        if (compareDecimal(preco.value, product.preco_venda) !== 0) body.preco_venda = preco.value;
        if (values.controla_estoque && compareDecimal(minimo, product.estoque_minimo) !== 0) body.estoque_minimo = minimo;
        if (values.controla_estoque !== product.controla_estoque) body.controla_estoque = values.controla_estoque;
        if (values.vendavel !== product.vendavel) body.vendavel = values.vendavel;
        if (values.ativo !== product.ativo) body.ativo = values.ativo;
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
        await update.mutateAsync({ id: product.id, body });
        toast.success("Produto atualizado.");
      } else {
        const body: ProdutoIn = {
          nome: values.nome,
          tipo: values.tipo,
          categoria_id: categoriaId,
          unidade_id: unidadeIdNumber,
          codigo: orNull(values.codigo),
          codigo_barras: orNull(values.codigo_barras),
          preco_venda: preco.value,
          estoque_minimo: minimo,
          controla_estoque: values.controla_estoque,
          vendavel: values.vendavel,
          ativo: values.ativo,
        };
        if (custo !== null) body.custo_inicial = custo;
        await create.mutateAsync(body);
        toast.success(values.tipo === "preparado" ? "Produto criado. Use “Ficha técnica” na lista para definir os insumos." : "Produto criado.");
      }
      onClose();
    } catch (error) {
      setFormError(
        mapServerError(
          error,
          setError,
          { tipo_invalido: "tipo", unidade_em_uso: "unidade_id", codigo_em_uso: "codigo", codigo_barras_em_uso: "codigo_barras", quantidade_fracionada: "estoque_minimo" },
          ["nome", "tipo", "categoria_id", "unidade_id", "codigo", "codigo_barras", "preco_venda", "custo_inicial", "estoque_minimo"],
        ),
      );
    }
  }

  const refsLoading = categories.isLoading || units.isLoading;
  const refsError = categories.error ?? units.error;

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="lg"
      title={product ? "Editar produto" : "Novo produto"}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting} disabled={refsLoading || Boolean(refsError)}>
            {product ? "Salvar" : "Criar produto"}
          </Button>
        </>
      }
    >
      {refsLoading ? (
        <LoadingBlock label="Carregando unidades e categorias…" />
      ) : refsError ? (
        <Alert tone="danger">{errorMessage(refsError)}</Alert>
      ) : (
        <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nome" error={errors.nome?.message} required className="sm:col-span-2">
              <Input autoComplete="off" {...register("nome")} />
            </FormField>
            <FormField label="Tipo" error={errors.tipo?.message} hint={mode === "create" ? "Define o que vem marcado em “Controla estoque” e “Vendável”." : undefined} required>
              <Select {...register("tipo", { onChange: (event) => onTipoChange(event.target.value as TipoProduto) })}>
                {PRODUCT_TYPES.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {productTypeLabel(tipo)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Categoria" error={errors.categoria_id?.message}>
              <Select {...register("categoria_id")}>
                <option value="">Sem categoria</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.ativo ? c.nome : `${c.nome} (inativa)`}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Unidade"
              error={errors.unidade_id?.message}
              hint={mode === "edit" ? "A unidade não pode ser trocada em produto com saldo ou ficha técnica." : undefined}
              required
            >
              <Select {...register("unidade_id")}>
                <option value="">Selecione…</option>
                {units.data?.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.sigla} — {u.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Preço de venda (R$)" error={errors.preco_venda?.message} required>
              <Input inputMode="decimal" autoComplete="off" {...register("preco_venda")} />
            </FormField>
            <FormField label="Código" error={errors.codigo?.message}>
              <Input autoComplete="off" {...register("codigo")} />
            </FormField>
            <FormField label="Código de barras" error={errors.codigo_barras?.message}>
              <Input autoComplete="off" inputMode="numeric" {...register("codigo_barras")} />
            </FormField>
            {mode === "create" ? (
              <FormField label="Custo inicial (R$)" error={errors.custo_inicial?.message} hint="Só na criação. Depois, o custo médio muda pelas entradas de estoque.">
                <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...register("custo_inicial")} />
              </FormField>
            ) : (
              <div>
                <p className="mb-1 text-sm font-medium text-fg">Custo médio atual</p>
                <p className="flex h-10 items-center text-sm text-fg">{product ? formatCost(product.custo_medio) : "—"}</p>
                <p className="mt-1 text-xs text-muted">Calculado pelo sistema a cada entrada de estoque.</p>
              </div>
            )}
            <FormField
              label={`Estoque mínimo${unit ? ` (${unit.sigla})` : ""}`}
              error={errors.estoque_minimo?.message}
              hint={unit ? (unit.casas_decimais === 0 ? "Esta unidade aceita só números inteiros." : `Até ${unit.casas_decimais} casa(s) decimal(is).`) : "Escolha a unidade para ver as casas decimais."}
            >
              <Input inputMode="decimal" autoComplete="off" disabled={!controla} {...register("estoque_minimo")} />
            </FormField>
          </div>

          <fieldset className="space-y-3 rounded-md border border-line p-4">
            <legend className="px-1 text-sm font-medium text-fg">Comportamento</legend>
            <Controller
              control={control}
              name="controla_estoque"
              render={({ field }) => (
                <Checkbox
                  label="Controla estoque"
                  description="O saldo é acompanhado e baixado nas vendas. Produto preparado normalmente baixa os insumos da ficha técnica."
                  checked={field.value}
                  onChange={(event) => {
                    setTouched((t) => ({ ...t, controla_estoque: true }));
                    field.onChange(event.target.checked);
                  }}
                />
              )}
            />
            <Controller
              control={control}
              name="vendavel"
              render={({ field }) => (
                <Checkbox
                  label="Vendável"
                  description="Aparece para venda em comandas. Insumos e embalagens normalmente não são vendáveis."
                  checked={field.value}
                  onChange={(event) => {
                    setTouched((t) => ({ ...t, vendavel: true }));
                    field.onChange(event.target.checked);
                  }}
                />
              )}
            />
            <Controller control={control} name="ativo" render={({ field }) => <Checkbox label="Produto ativo" checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />} />
          </fieldset>
        </form>
      )}
    </Dialog>
  );
}
