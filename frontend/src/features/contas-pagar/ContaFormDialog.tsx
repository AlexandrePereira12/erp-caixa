import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { moneyInputProps, parseMoney, toInt, zMoneyPositive } from "@/components/pdv/forms";
import { useToast } from "@/components/Toast";
import { useCategorias } from "@/features/financeiro/categoriasApi";
import { ApiError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { applyServerError } from "@/lib/forms";
import { useContaPagarMutations, type TituloPagarEditarIn, type TituloPagarDetalhe, type TituloPagarIn } from "./api";
import { validDay } from "./dates";
import { FornecedorPicker, type FornecedorValue } from "./FornecedorPicker";

const baseShape = {
  descricao: z.string().trim().min(1, "Informe a descrição da conta.").max(200, "A descrição pode ter no máximo 200 caracteres."),
  documento: z.string().trim().max(60, "O documento pode ter no máximo 60 caracteres."),
  vencimento: z.string().refine((v) => validDay(v) !== "", "Informe a data de vencimento."),
  observacao: z.string().trim().max(500, "A observação pode ter no máximo 500 caracteres."),
  // Opcional no schema: com o select desabilitado (sem financeiro.listar) o campo pode nem vir nos valores.
  categoria_id: z.string().optional(),
};

// Os nomes dos campos são os da API: os `detalhes` de um 422 caem direto no campo certo.
const schema = z.object({ ...baseShape, valor_original: z.string().trim().min(1, "Informe o valor da conta, como 250,00.").pipe(zMoneyPositive) });
// Valor travado (conta que já teve pagamento): o campo vira só leitura e não entra na validação.
const schemaValorTravado = z.object({ ...baseShape, valor_original: z.string() });
type FormValues = z.infer<typeof schema>;

const CAMPOS = ["descricao", "documento", "valor_original", "vencimento", "observacao"] as const;

export const DICA_VALOR_TRAVADO = "O valor não pode mudar: a conta já teve pagamento lançado (mesmo estornado). Para corrigir, cancele esta conta e lance outra com o valor certo.";

/**
 * Lançamento e edição de conta a pagar. Na edição só vai no PATCH o que mudou (limpar fornecedor,
 * categoria, documento ou observação envia null) e o valor fica travado se a conta já teve qualquer baixa.
 */
export function ContaFormDialog({ titulo, onClose }: { titulo?: TituloPagarDetalhe | undefined; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const { can } = usePermissions();
  const { criar, editar } = useContaPagarMutations();
  const valorTravado = titulo !== undefined && titulo.baixas.length > 0;
  const [formError, setFormError] = useState<string | null>(null);
  const [fornecedor, setFornecedor] = useState<FornecedorValue | null>(titulo?.fornecedor ?? null);
  const [fornecedorError, setFornecedorError] = useState<string | undefined>();

  const podeListarCategorias = can("financeiro.listar");
  const categorias = useCategorias({ tipo: "despesa", enabled: podeListarCategorias });
  const categoriaAtual = titulo?.categoria ?? null;
  // Só as ativas podem ser escolhidas, mas a categoria atual da conta continua na lista mesmo inativa:
  // sem ela o select ficaria vazio e salvar apagaria a categoria sem a pessoa pedir.
  const categoriaOptions = useMemo(() => {
    const ativas = (categorias.data ?? []).filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome }));
    if (categoriaAtual && !ativas.some((c) => c.id === categoriaAtual.id)) {
      const registrada = (categorias.data ?? []).find((c) => c.id === categoriaAtual.id);
      return [{ id: categoriaAtual.id, nome: registrada?.ativa === false ? `${categoriaAtual.nome} (inativa)` : categoriaAtual.nome }, ...ativas];
    }
    return ativas;
  }, [categorias.data, categoriaAtual]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(valorTravado ? schemaValorTravado : schema),
    defaultValues: {
      descricao: titulo?.descricao ?? "",
      documento: titulo?.documento ?? "",
      valor_original: titulo ? titulo.valor_original.replace(".", ",") : "",
      vencimento: titulo?.vencimento ?? "",
      observacao: titulo?.observacao ?? "",
      categoria_id: titulo?.categoria ? String(titulo.categoria.id) : "",
    },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    setFornecedorError(undefined);
    const categoriaId = toInt(values.categoria_id);
    try {
      if (titulo) {
        const body: TituloPagarEditarIn = {};
        if (values.descricao !== titulo.descricao) body.descricao = values.descricao;
        if (!valorTravado) {
          const valor = parseMoney(values.valor_original);
          if (valor !== null && compareDecimal(valor, titulo.valor_original) !== 0) body.valor_original = valor;
        }
        if (values.vencimento !== titulo.vencimento) body.vencimento = values.vencimento;
        if ((fornecedor?.id ?? null) !== (titulo.fornecedor?.id ?? null)) body.pessoa_id = fornecedor?.id ?? null;
        // Sem permissão para listar categorias o select está travado: nunca mexe na categoria atual.
        if (podeListarCategorias && (categoriaId ?? null) !== (titulo.categoria?.id ?? null)) body.categoria_id = categoriaId ?? null;
        if (values.documento !== (titulo.documento ?? "")) body.documento = values.documento || null;
        if (values.observacao !== (titulo.observacao ?? "")) body.observacao = values.observacao || null;
        if (Object.keys(body).length > 0) {
          await editar.mutateAsync({ id: titulo.id, body });
          toast.success("Conta atualizada.");
        }
      } else {
        const valor = parseMoney(values.valor_original);
        if (valor === null) return;
        const body: TituloPagarIn = {
          descricao: values.descricao,
          valor_original: valor,
          vencimento: values.vencimento,
          ...(fornecedor ? { pessoa_id: fornecedor.id } : {}),
          ...(podeListarCategorias && categoriaId !== undefined ? { categoria_id: categoriaId } : {}),
          ...(values.documento ? { documento: values.documento } : {}),
          ...(values.observacao ? { observacao: values.observacao } : {}),
        };
        await criar.mutateAsync(body);
        toast.success("Conta lançada.");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.codigo === "fornecedor_invalido") setFornecedorError(error.message);
      else if (error instanceof ApiError && error.codigo === "categoria_invalida") setError("categoria_id", { type: "server", message: error.message });
      else setFormError(applyServerError(error, setError, CAMPOS));
    }
  }

  const categoriaHint = !podeListarCategorias ? "Você não tem permissão para listar as categorias." : "Opcional. Só categorias de despesa ativas.";
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      title={titulo ? `Editar conta #${titulo.id}` : "Nova conta a pagar"}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={isSubmitting}>
            {titulo ? "Salvar" : "Lançar conta"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Descrição" error={errors.descricao?.message} required>
          <Input className="min-h-11" maxLength={200} autoComplete="off" {...register("descricao")} />
        </FormField>
        <FornecedorPicker label="Fornecedor" value={fornecedor} onChange={setFornecedor} somenteAtivos hint="Opcional. Deixe em branco para uma despesa avulsa." error={fornecedorError} />
        <FormField label="Categoria" error={errors.categoria_id?.message} hint={categoriaHint}>
          <Select className="min-h-11" disabled={!podeListarCategorias} {...register("categoria_id")}>
            <option value="">Sem categoria</option>
            {categoriaOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          {valorTravado ? (
            <FormField label="Valor (R$)" hint={DICA_VALOR_TRAVADO} required>
              <Input className="min-h-11" disabled value={titulo.valor_original.replace(".", ",")} />
            </FormField>
          ) : (
            <FormField label="Valor (R$)" error={errors.valor_original?.message} required>
              <Input {...moneyInputProps()} className="min-h-11" {...register("valor_original")} />
            </FormField>
          )}
          <FormField label="Vencimento" error={errors.vencimento?.message} required>
            <Input type="date" className="min-h-11" {...register("vencimento")} />
          </FormField>
        </div>
        <FormField label="Documento" error={errors.documento?.message} hint="Opcional. Número da nota ou do boleto.">
          <Input className="min-h-11" maxLength={60} autoComplete="off" {...register("documento")} />
        </FormField>
        <FormField label="Observação" error={errors.observacao?.message} hint="Opcional.">
          <Textarea rows={3} maxLength={500} {...register("observacao")} />
        </FormField>
      </form>
    </Dialog>
  );
}
