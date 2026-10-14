import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Alert } from "@/components/Alert";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Input } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { moneyInputProps, parseMoney, zMoneyNonNegative } from "@/components/pdv/forms";
import type { Caixa } from "@/components/pdv/types";
import { ErrorState, LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";
import { useCaixaAtual, useCaixaMutations } from "./api";
import { CaixaPanel } from "./CaixaPanel";
import { CloseCaixaDialog } from "./CloseCaixaDialog";

const schema = z.object({ valor: zMoneyNonNegative });
type FormValues = z.infer<typeof schema>;

function OpenCaixaCard() {
  const toast = useToast();
  const { open } = useCaixaMutations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { valor: "0,00" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const valor = parseMoney(values.valor);
    if (valor === null) return;
    try {
      await open.mutateAsync(valor);
      toast.success("Caixa aberto.");
    } catch (error) {
      setFormError(error instanceof ApiError && error.codigo === "caixa_ja_aberto" ? `${error.message} Atualize a página para vê-lo.` : errorMessage(error));
    }
  }

  return (
    <Card className="mx-auto max-w-md p-5">
      <h2 className="text-lg font-semibold text-fg">Abrir caixa</h2>
      <p className="mt-1 text-sm text-muted">Você precisa de um caixa aberto para receber pagamentos, baixar contas a receber e estornar vendas.</p>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="mt-4 space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Valor inicial em dinheiro (R$)" error={errors.valor?.message} hint="O troco que você já tem na gaveta. Pode ser zero.">
          <Input {...moneyInputProps()} className="min-h-11" {...register("valor")} />
        </FormField>
        <Button type="submit" variant="primary" className="min-h-11 w-full" loading={isSubmitting}>
          Abrir caixa
        </Button>
      </form>
    </Card>
  );
}

/** Caixa do operador logado: abrir, acompanhar, sangria/reforço e fechamento cego. */
export function CaixaPage() {
  usePageTitle("Caixa");
  const { can } = usePermissions();
  const atual = useCaixaAtual();
  // O diálogo de fechamento vive aqui: ao fechar, o caixa atual some e o resultado precisa continuar na tela.
  const [closing, setClosing] = useState<Caixa | null>(null);

  return (
    <div>
      <PageHeader
        title="Caixa"
        description="Seu caixa do dia."
        actions={
          can("caixa.listar") && (
            <Link to="/caixas" className={buttonClasses({ className: "min-h-11" })}>
              Histórico de caixas
            </Link>
          )
        }
      />
      {atual.isLoading ? (
        <LoadingBlock label="Verificando seu caixa…" />
      ) : atual.error ? (
        <ErrorState error={atual.error} onRetry={() => void atual.refetch()} />
      ) : atual.data === null || atual.data === undefined ? (
        closing ? null : <OpenCaixaCard />
      ) : (
        <CaixaPanel caixa={atual.data} canOperate onRequestClose={setClosing} />
      )}
      {closing && <CloseCaixaDialog caixa={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}
