import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { conferenciaIncompletaDe, diferencaSemJustificativaDe } from "@/components/pdv/errorInfo";
import { moneyInputProps, parseMoney } from "@/components/pdv/forms";
import { formaTipoLabel } from "@/components/pdv/labels";
import type { Caixa } from "@/components/pdv/types";
import { useFormas } from "@/features/formas-pagamento/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";
import { useCaixaMutations } from "./api";

interface Opcao {
  id: number;
  nome: string;
  tipo: string;
}

/**
 * Fechamento CEGO: nenhum valor esperado é mostrado antes do envio. O operador informa o que contou
 * em cada forma e envia; o backend compara e responde `conferencia_incompleta` (formas que faltam) ou
 * `diferenca_sem_justificativa` (uma forma por vez). Só então aparece a diferença da forma citada,
 * com o campo de justificativa, e a conferência é reenviada.
 */
export function CloseCaixaDialog({ caixa, onClose }: { caixa: Caixa; onClose: () => void }) {
  const formId = useId();
  const { can } = usePermissions();
  const { close } = useCaixaMutations();
  const formasQuery = useFormas({ enabled: can("formas_pagamento.listar") });

  // Formas que podem ter dinheiro/valores no caixa: as ativas (exceto fiado, que não entra no caixa)
  // mais qualquer forma que já teve movimento neste caixa, mesmo inativa. Só ids e nomes, sem valores.
  const opcoes = useMemo<Opcao[]>(() => {
    const map = new Map<number, Opcao>();
    for (const f of formasQuery.data ?? []) if (f.ativa && f.tipo !== "fiado") map.set(f.id, { id: f.id, nome: f.nome, tipo: f.tipo });
    for (const s of caixa.esperado) if (s.tipo !== "fiado") map.set(s.forma_pagamento_id, { id: s.forma_pagamento_id, nome: s.forma, tipo: s.tipo });
    return [...map.values()];
  }, [formasQuery.data, caixa.esperado]);

  const [valores, setValores] = useState<Record<number, string>>({});
  const [justificativas, setJustificativas] = useState<Record<number, string>>({});
  const [diferencas, setDiferencas] = useState<Record<number, string>>({});
  const [todasJustificativas, setTodasJustificativas] = useState(false);
  const [faltando, setFaltando] = useState<number[]>([]);
  const [invalidos, setInvalidos] = useState<number[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<Caixa | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());

  useEffect(() => {
    if (focus) fields.current.get(focus)?.focus();
  }, [focus, error]);

  const pending = close.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFaltando([]);
    const bad: number[] = [];
    const conferencias: { forma_pagamento_id: number; valor_contado: string; justificativa?: string }[] = [];
    for (const o of opcoes) {
      const text = (valores[o.id] ?? "").trim();
      if (text === "") continue;
      const parsed = parseMoney(text);
      if (parsed === null || compareDecimal(parsed, "0") < 0) {
        bad.push(o.id);
        continue;
      }
      const just = (justificativas[o.id] ?? "").trim();
      conferencias.push({ forma_pagamento_id: o.id, valor_contado: parsed, ...(just ? { justificativa: just } : {}) });
    }
    setInvalidos(bad);
    if (bad.length > 0) {
      setFocus(`valor-${bad[0]}`);
      return;
    }
    try {
      setResult(await close.mutateAsync({ caixaId: caixa.id, body: { conferencias } }));
    } catch (err) {
      setError(err);
      if (!(err instanceof ApiError)) return;
      if (err.codigo === "conferencia_incompleta") {
        const ids = conferenciaIncompletaDe(err, opcoes) ?? [];
        setFaltando(ids);
        if (ids[0] !== undefined) setFocus(`valor-${ids[0]}`);
      } else if (err.codigo === "diferenca_sem_justificativa") {
        const info = diferencaSemJustificativaDe(err, opcoes);
        if (info?.formaId != null) {
          setDiferencas((d) => ({ ...d, [info.formaId!]: info.diferenca }));
          setFocus(`just-${info.formaId}`);
        } else {
          // Não deu para identificar a forma: pede justificativa em todas as formas informadas.
          setTodasJustificativas(true);
        }
      }
    }
  }

  if (result) {
    return (
      <Dialog
        open
        onClose={onClose}
        size="md"
        title={`Caixa #${result.id} fechado`}
        footer={
          <Button variant="primary" className="min-h-11" data-autofocus onClick={onClose}>
            Concluir
          </Button>
        }
      >
        <ConferenciaTabela conferencias={result.conferencias} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      size="md"
      title="Fechar caixa"
      description="Conte o que há em cada forma de pagamento e informe abaixo. O valor esperado só aparece depois do envio, se houver diferença."
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending}>
            Enviar conferência
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {error !== null && (
          <Alert tone="danger">
            <p>{errorMessage(error)}</p>
            {error instanceof ApiError && error.codigo === "conferencia_incompleta" && <p className="mt-1">Preencha o valor contado das formas indicadas e envie de novo.</p>}
          </Alert>
        )}
        {opcoes.length === 0 && <Alert tone="warning">Nenhuma forma de pagamento disponível para conferir. Você pode enviar o fechamento sem valores se o caixa não teve movimento.</Alert>}

        {opcoes.map((o) => {
          const showJust = todasJustificativas ? (valores[o.id] ?? "").trim() !== "" : diferencas[o.id] !== undefined;
          const fieldError = invalidos.includes(o.id) ? "Informe um valor válido, como 150,00." : faltando.includes(o.id) ? "Informe o valor contado desta forma." : undefined;
          return (
            <div key={o.id} className="space-y-2">
              <FormField label={`${o.nome} — valor contado (R$)`} error={fieldError} hint={o.tipo === "dinheiro" ? "Conte todo o dinheiro da gaveta, incluindo o valor de abertura." : `${formaTipoLabel(o.tipo)}. Deixe em branco se não houve movimento.`}>
                <Input
                  {...moneyInputProps()}
                  className="min-h-11"
                  value={valores[o.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [o.id]: e.target.value }))}
                  ref={(el) => {
                    if (el) fields.current.set(`valor-${o.id}`, el);
                    else fields.current.delete(`valor-${o.id}`);
                  }}
                />
              </FormField>
              {showJust && (
                <div className="rounded-md border-l-4 border-warning-text bg-warning-soft p-3">
                  {diferencas[o.id] !== undefined && (
                    <p className="mb-2 text-sm font-medium text-warning-text">
                      Há uma diferença de {formatMoney(diferencas[o.id])} em {o.nome}. Informe a justificativa e envie de novo.
                    </p>
                  )}
                  <FormField label={`Justificativa da diferença em ${o.nome}`} required>
                    <Textarea
                      rows={2}
                      maxLength={300}
                      value={justificativas[o.id] ?? ""}
                      onChange={(e) => setJustificativas((v) => ({ ...v, [o.id]: e.target.value }))}
                      ref={(el) => {
                        if (el) fields.current.set(`just-${o.id}`, el);
                        else fields.current.delete(`just-${o.id}`);
                      }}
                    />
                  </FormField>
                </div>
              )}
            </div>
          );
        })}
      </form>
    </Dialog>
  );
}

/** Resultado do fechamento: esperado, contado e diferença por forma (valores da API). */
export function ConferenciaTabela({ conferencias }: { conferencias: Caixa["conferencias"] }) {
  if (conferencias.length === 0) return <p className="text-sm text-muted">Fechado sem conferência de valores (nenhuma forma teve movimento).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Conferência do fechamento por forma de pagamento</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            <th scope="col" className="py-2 pr-3">Forma</th>
            <th scope="col" className="py-2 pr-3 text-right">Esperado</th>
            <th scope="col" className="py-2 pr-3 text-right">Contado</th>
            <th scope="col" className="py-2 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {conferencias.map((c) => {
            const diff = compareDecimal(c.diferenca, "0");
            return (
              <tr key={c.forma_pagamento_id} className="align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-fg">{c.forma}</th>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(c.valor_esperado)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(c.valor_contado)}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${diff === 0 ? "text-success-text" : "text-danger-text"}`}>
                  {diff === 0 ? "Sem diferença" : `${diff > 0 ? "Sobra" : "Falta"} ${formatMoney(c.diferenca.replace("-", ""))}`}
                  {c.justificativa && <span className="block text-xs font-normal text-muted">{c.justificativa}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
