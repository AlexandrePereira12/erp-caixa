import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { toInt } from "@/components/pdv/forms";
import type { Comanda } from "@/components/pdv/types";
import { LoadingBlock } from "@/components/States";
import { useMesaMapa } from "@/features/mesas/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { useDivisao } from "./api";

/* ---------- Editar dados da comanda ---------- */

type HeaderBody = { cliente_id?: number | null; nome_cliente?: string | null; endereco_entrega?: string | null; num_pessoas?: number | null; observacao?: string | null };

export function HeaderDialog({ comanda, onClose, onSubmit }: { comanda: Comanda; onClose: () => void; onSubmit: (body: HeaderBody) => Promise<unknown> }) {
  const formId = useId();
  const [cliente, setCliente] = useState<ClientValue | null>(comanda.cliente);
  const [nome, setNome] = useState(comanda.nome_cliente ?? "");
  const [pessoas, setPessoas] = useState(comanda.num_pessoas ? String(comanda.num_pessoas) : "");
  const [endereco, setEndereco] = useState(comanda.endereco_entrega ?? "");
  const [obs, setObs] = useState(comanda.observacao ?? "");
  const [errors, setErrors] = useState<{ pessoas?: string; endereco?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const n = toInt(pessoas);
    if (pessoas.trim() !== "" && (n === undefined || n < 1 || n > 100)) next.pessoas = "Informe de 1 a 100 pessoas.";
    if (comanda.tipo === "delivery" && endereco.trim() === "") next.endereco = "Informe o endereço de entrega.";
    setErrors(next);
    if (next.pessoas || next.endereco) return;

    // Só envia o que mudou (campo ausente = sem alteração; null = limpar).
    const body: HeaderBody = {};
    if ((cliente?.id ?? null) !== (comanda.cliente?.id ?? null)) body.cliente_id = cliente?.id ?? null;
    if (nome.trim() !== (comanda.nome_cliente ?? "")) body.nome_cliente = nome.trim() || null;
    if ((n ?? null) !== (comanda.num_pessoas ?? null)) body.num_pessoas = n ?? null;
    if (comanda.tipo === "delivery" && endereco.trim() !== (comanda.endereco_entrega ?? "")) body.endereco_entrega = endereco.trim();
    if (obs.trim() !== (comanda.observacao ?? "")) body.observacao = obs.trim() || null;
    if (Object.keys(body).length === 0) return onClose();

    setApiError(null);
    setPending(true);
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      setApiError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      title="Dados da comanda"
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <ClientPicker label="Cliente" value={cliente} onChange={setCliente} disabled={pending} />
        <FormField label="Nome na comanda" hint="Para identificar quem não tem cadastro.">
          <Input className="min-h-11" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label="Número de pessoas" error={errors.pessoas}>
          <Input className="min-h-11" inputMode="numeric" value={pessoas} onChange={(e) => setPessoas(e.target.value)} autoComplete="off" />
        </FormField>
        {comanda.tipo === "delivery" && (
          <FormField label="Endereço de entrega" error={errors.endereco} required>
            <Textarea rows={2} maxLength={500} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </FormField>
        )}
        <FormField label="Observação da comanda">
          <Textarea rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>
        {apiError && <Alert tone="danger">{apiError}</Alert>}
      </form>
    </Dialog>
  );
}

/* ---------- Transferir de mesa ---------- */

export function TransferDialog({ comanda, onClose, onSubmit }: { comanda: Comanda; onClose: () => void; onSubmit: (mesaId: number) => Promise<unknown> }) {
  const formId = useId();
  const mapa = useMesaMapa();
  const livres = useMemo(() => (mapa.data ?? []).filter((m) => m.status === "livre" && m.id !== comanda.mesa?.id), [mapa.data, comanda.mesa?.id]);
  const [mesaId, setMesaId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const id = toInt(mesaId);
    if (id === undefined) return;
    setError(null);
    setPending(true);
    try {
      await onSubmit(id);
      onClose();
    } catch (err) {
      setError(err);
      setPending(false);
      if (err instanceof ApiError && err.codigo === "mesa_indisponivel") void mapa.refetch();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      dismissible={!pending}
      title="Transferir de mesa"
      description={comanda.mesa ? `Hoje em ${comanda.mesa.nome}. Só mesas livres aparecem.` : undefined}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending} disabled={mesaId === ""}>
            Transferir
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} className="space-y-3">
        {mapa.isLoading ? (
          <LoadingBlock label="Carregando mesas…" />
        ) : mapa.error ? (
          <Alert tone="danger">{errorMessage(mapa.error)}</Alert>
        ) : livres.length === 0 ? (
          <Alert tone="info">Nenhuma mesa livre no momento.</Alert>
        ) : (
          <FormField label="Nova mesa" required>
            <Select className="min-h-11" value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
              <option value="">Selecione…</option>
              {livres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.capacidade ? ` (${m.capacidade} lugares)` : ""}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {error !== null && <Alert tone="danger">{errorMessage(error)}</Alert>}
      </form>
    </Dialog>
  );
}

/* ---------- Dividir a conta (orientação) ---------- */

function useDebouncedInt(text: string, ms = 300): number | undefined {
  const [value, setValue] = useState<number | undefined>(() => toInt(text));
  useEffect(() => {
    const timer = setTimeout(() => setValue(toInt(text)), ms);
    return () => clearTimeout(timer);
  }, [text, ms]);
  return value;
}

/** Agrupa partes iguais consecutivas ("2 × R$ 10,01 e 1 × R$ 10,00") sem fazer conta: só compara texto. */
function groupParts(parts: string[]): { value: string; count: number }[] {
  const groups: { value: string; count: number }[] = [];
  for (const part of parts) {
    const last = groups[groups.length - 1];
    if (last && last.value === part) last.count += 1;
    else groups.push({ value: part, count: 1 });
  }
  return groups;
}

export function DivideDialog({ comanda, onClose }: { comanda: Comanda; onClose: () => void }) {
  const [text, setText] = useState(String(comanda.num_pessoas ?? 2));
  const pessoas = useDebouncedInt(text);
  const valid = pessoas !== undefined && pessoas >= 1 && pessoas <= 100;
  const divisao = useDivisao(comanda.id, valid ? pessoas : undefined);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Dividir a conta"
      description="Só orienta a conversa na mesa: o pagamento de cada pessoa é registrado no fechamento, em linhas separadas."
      footer={
        <Button variant="primary" className="min-h-11" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-3">
        <FormField label="Dividir entre quantas pessoas?" error={text.trim() !== "" && !valid ? "Informe de 1 a 100 pessoas." : undefined}>
          <Input className="min-h-11" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </FormField>
        <div aria-live="polite">
          {valid && divisao.isLoading && <p className="text-sm text-muted">Calculando…</p>}
          {valid && divisao.error && <Alert tone="danger">{errorMessage(divisao.error)}</Alert>}
          {valid && divisao.data && (
            <div className="rounded-md border border-line bg-surface-2 p-3 text-sm">
              <p className="text-muted">
                Total {formatMoney(divisao.data.total)} em {divisao.data.pessoas} {divisao.data.pessoas === 1 ? "parte" : "partes"}:
              </p>
              <ul className="mt-1 space-y-0.5 font-semibold text-fg">
                {groupParts(divisao.data.partes).map((g) => (
                  <li key={g.value} className="tabular-nums">
                    {g.count} × {formatMoney(g.value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
