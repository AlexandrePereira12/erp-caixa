import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSettings, useUpdateSettings } from "./api";
import { PixPreview } from "./PixPreview";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { Input, Select, Textarea } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { ErrorState, LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import type { ConfiguracaoEditarIn, ConfiguracaoOut } from "@/lib/api/types";
import { usePermissions } from "@/lib/auth/hooks";
import { parseMoney, toInt } from "@/components/pdv/forms";
import { compareDecimal } from "@/lib/decimal";
import { applyServerError } from "@/lib/forms";
import { timezoneOptions } from "@/lib/timezones";
import { usePageTitle } from "@/lib/usePageTitle";

const schema = z.object({
  nome_exibicao: z.string().trim().min(1, "Informe o nome de exibição.").max(120, "O nome pode ter no máximo 120 caracteres."),
  timezone: z.string().min(1, "Selecione o fuso horário.").max(64),
  // Percentual como texto digitado ("10" ou "10,5"); só vira string decimal ao enviar, nunca number.
  taxa_servico_pct: z
    .string()
    .trim()
    .refine((v) => parseMoney(v) !== null, "Informe um percentual válido, como 10 ou 12,5.")
    .refine((v) => {
      const parsed = parseMoney(v);
      return parsed === null || (compareDecimal(parsed, "0") >= 0 && compareDecimal(parsed, "30") <= 0);
    }, "O percentual deve ficar entre 0 e 30."),
  cancelamento_janela_min: z
    .string()
    .trim()
    .refine((v) => {
      const n = toInt(v);
      return n !== undefined && n <= 240;
    }, "Informe de 0 a 240 minutos."),
  // Texto colado do app do banco; o formato (EMV, CRC, sem valor) quem confere é o backend.
  pix_copia_e_cola: z.string().max(2048, "O código é longo demais."),
});
type FormValues = z.infer<typeof schema>;

/** "10.00" (API) -> "10,00" (campo). */
const toField = (value: string) => value.replace(".", ",");

function formValues(settings: ConfiguracaoOut): FormValues {
  return {
    nome_exibicao: settings.nome_exibicao,
    timezone: settings.timezone,
    taxa_servico_pct: toField(settings.taxa_servico_pct),
    cancelamento_janela_min: String(settings.cancelamento_janela_min),
    pix_copia_e_cola: settings.pix_copia_e_cola ?? "",
  };
}

function SettingsForm({ settings, readOnly }: { settings: ConfiguracaoOut; readOnly: boolean }) {
  const toast = useToast();
  const update = useUpdateSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const zones = useMemo(() => timezoneOptions(settings.timezone), [settings.timezone]);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: formValues(settings) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const body: ConfiguracaoEditarIn = {};
    if (values.nome_exibicao !== settings.nome_exibicao) body.nome_exibicao = values.nome_exibicao;
    if (values.timezone !== settings.timezone) body.timezone = values.timezone;
    const taxa = parseMoney(values.taxa_servico_pct);
    if (taxa !== null && compareDecimal(taxa, settings.taxa_servico_pct) !== 0) body.taxa_servico_pct = taxa;
    const janela = toInt(values.cancelamento_janela_min);
    if (janela !== undefined && janela !== settings.cancelamento_janela_min) body.cancelamento_janela_min = janela;
    const pix = values.pix_copia_e_cola.trim();
    // Campo esvaziado apaga o Pix (null); o backend devolve o texto já no formato canônico.
    if (pix !== (settings.pix_copia_e_cola ?? "")) body.pix_copia_e_cola = pix === "" ? null : pix;
    try {
      const saved = await update.mutateAsync(body);
      reset(formValues(saved));
      toast.success("Configurações salvas.");
    } catch (error) {
      setFormError(applyServerError(error, setError, ["nome_exibicao", "timezone", "taxa_servico_pct", "cancelamento_janela_min", "pix_copia_e_cola"]));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {readOnly && <Alert tone="info">Você pode ver as configurações, mas não tem permissão para alterá-las.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <FormField label="Nome de exibição" error={errors.nome_exibicao?.message} hint="Como a empresa aparece no sistema." required>
        <Input autoComplete="organization" disabled={readOnly} {...register("nome_exibicao")} />
      </FormField>
      <FormField label="Fuso horário" error={errors.timezone?.message} hint="Base para os horários do sistema." required>
        <Select disabled={readOnly} {...register("timezone")}>
          <optgroup label="Brasil">
            {zones.brasil.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </optgroup>
          {zones.outros.length > 0 && (
            <optgroup label="Outros">
              {zones.outros.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </FormField>
      <FormField
        label="Taxa de serviço (%)"
        error={errors.taxa_servico_pct?.message}
        hint="Aplicada às comandas de mesa abertas daqui para frente. Comandas já abertas mantêm a taxa de quando foram abertas."
        required
      >
        <Input inputMode="decimal" autoComplete="off" disabled={readOnly} {...register("taxa_servico_pct")} />
      </FormField>
      <FormField
        label="Janela para cancelar o próprio item (minutos)"
        error={errors.cancelamento_janela_min?.message}
        hint="Por quantos minutos quem lançou um item pode cancelá-lo sem a ajuda de um gerente. Zero exige gerente sempre."
        required
      >
        <Input inputMode="numeric" autoComplete="off" disabled={readOnly} {...register("cancelamento_janela_min")} />
      </FormField>
      <FormField
        label="Pix copia e cola"
        error={errors.pix_copia_e_cola?.message}
        hint="Cole o Pix copia e cola da chave da empresa (no app do banco, em Pix > Receber), sem valor. Deixe em branco para não usar. O QR Code aparece abaixo depois de salvar."
      >
        <Textarea rows={4} autoComplete="off" spellCheck={false} disabled={readOnly} className="font-mono text-xs" {...register("pix_copia_e_cola")} />
      </FormField>
      {!readOnly && (
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
          Salvar
        </Button>
      )}
    </form>
  );
}

export function SettingsPage() {
  usePageTitle("Configurações");
  const { can } = usePermissions();
  const settings = useSettings();

  return (
    <div>
      <PageHeader title="Configurações" description="Dados gerais da empresa e regras do atendimento." />
      <Card className="max-w-2xl">
        {settings.isLoading ? (
          <LoadingBlock />
        ) : settings.error || !settings.data ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <div className="p-5">
            <SettingsForm settings={settings.data} readOnly={!can("configuracoes.editar")} />
          </div>
        )}
      </Card>
      {settings.data?.pix_copia_e_cola && <PixPreview code={settings.data.pix_copia_e_cola} recebedor={settings.data.pix_recebedor} />}
    </div>
  );
}
