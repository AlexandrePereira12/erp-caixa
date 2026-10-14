import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { TrashIcon } from "@/components/pdv/icons";
import { formaTipoLabel } from "@/components/pdv/labels";
import type { FormaPagamento } from "@/components/pdv/types";
import { formatMoney } from "@/lib/money";
import type { Linha, LinhaCheck } from "./fechamento";
import { PixCobranca } from "./PixCobranca";

export interface PagamentoLinhaProps {
  index: number;
  linha: Linha;
  check: LinhaCheck;
  formas: FormaPagamento[];
  onChange: (patch: Partial<Linha>) => void;
  onRemove: () => void;
  /** Pix da empresa (sem valor): string = cadastrado, null = não cadastrado, undefined = ainda não carregou. */
  pix?: string | null | undefined;
}

const num = { inputMode: "decimal" as const, autoComplete: "off" };

/** Uma linha de pagamento: forma, valor, valor recebido (dinheiro), parcelas (crédito) e observação. */
export function PagamentoLinha({ index, linha, check, formas, onChange, onRemove, pix }: PagamentoLinhaProps) {
  // Campo vazio ainda não é "erro": o resumo (falta cobrir) e o botão desabilitado já orientam.
  const erros = {
    forma: linha.formaId ? check.erros.forma : undefined,
    valor: linha.valor.trim() ? check.erros.valor : undefined,
    recebido: check.erros.recebido,
    parcelas: check.erros.parcelas,
  };
  const tipo = check.forma?.tipo;

  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold text-fg">Pagamento {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Forma" error={erros.forma}>
          <Select className="min-h-11" value={linha.formaId} onChange={(e) => onChange({ formaId: e.target.value, recebido: "", parcelas: "" })}>
            <option value="">Selecione…</option>
            {formas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Valor (R$)" error={erros.valor}>
          <Input {...num} placeholder="0,00" className="min-h-11" value={linha.valor} onChange={(e) => onChange({ valor: e.target.value })} />
        </FormField>

        {tipo === "dinheiro" && (
          <FormField label="Valor recebido (R$)" error={erros.recebido} hint="Opcional. Informe para calcular o troco.">
            <Input {...num} placeholder="0,00" className="min-h-11" value={linha.recebido} onChange={(e) => onChange({ recebido: e.target.value })} />
          </FormField>
        )}
        {tipo === "credito" && (
          <FormField label="Parcelas" error={erros.parcelas} hint="De 1 a 24.">
            <Input inputMode="numeric" autoComplete="off" placeholder="1" className="min-h-11" value={linha.parcelas} onChange={(e) => onChange({ parcelas: e.target.value })} />
          </FormField>
        )}
      </div>

      {check.troco !== null && (
        <p className="mt-2 text-sm text-fg" aria-live="polite">
          Troco previsto: <strong>{formatMoney(check.troco)}</strong> <span className="text-muted">(prévia)</span>
        </p>
      )}
      {tipo === "fiado" && <p className="mt-2 text-xs text-muted">{formaTipoLabel("fiado")}: exige cliente e gera uma conta a receber. Não entra no caixa.</p>}
      {tipo === "pix" && pix && check.valor && <PixCobranca base={pix} valor={check.valor} />}
      {tipo === "pix" && pix === null && <p className="mt-2 text-xs text-muted">Nenhum Pix cadastrado: o administrador cadastra o Pix copia e cola em Configurações para o QR Code aparecer aqui.</p>}

      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-brand-text">Observação do pagamento</summary>
        <FormField label="Observação" className="mt-1">
          <Input maxLength={200} className="min-h-11" value={linha.observacao} onChange={(e) => onChange({ observacao: e.target.value })} />
        </FormField>
      </details>

      <div className="mt-2 flex justify-end">
        <Button variant="ghost" className="min-h-11 text-danger-text" onClick={onRemove} aria-label={`Remover pagamento ${index + 1}`}>
          <TrashIcon width={16} height={16} />
          Remover
        </Button>
      </div>
    </fieldset>
  );
}
