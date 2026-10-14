import { useId, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { Choice } from "@/components/pdv/Choice";
import { ClientPicker, type ClientValue } from "@/components/pdv/ClientPicker";
import { toInt } from "@/components/pdv/forms";
import { comandaTipoLabel } from "@/components/pdv/labels";
import type { ComandaAbrirIn } from "@/components/pdv/types";
import { LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { useMesaMapa } from "@/features/mesas/api";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { useAbrirComanda, type ComandaTipo } from "./api";

export interface AbrirComandaDialogProps {
  /** Tipo pré-selecionado (atalhos Balcão/Retirada/Delivery do salão). */
  initialTipo?: ComandaTipo;
  /** Mesa pré-selecionada (toque numa mesa livre/reservada do mapa). */
  initialMesaId?: number;
  onClose: () => void;
}

const TIPOS: ComandaTipo[] = ["mesa", "balcao", "retirada", "delivery"];

/** "Abrir comanda": mesa, balcão, retirada ou delivery (delivery exige endereço). Depois leva à comanda. */
export function AbrirComandaDialog({ initialTipo = "mesa", initialMesaId, onClose }: AbrirComandaDialogProps) {
  const formId = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const open = useAbrirComanda();

  const [tipo, setTipo] = useState<ComandaTipo>(initialTipo);
  const [mesaId, setMesaId] = useState(initialMesaId ? String(initialMesaId) : "");
  const [pessoas, setPessoas] = useState("");
  const [cliente, setCliente] = useState<ClientValue | null>(null);
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [obs, setObs] = useState("");
  const [errors, setErrors] = useState<{ mesa?: string; pessoas?: string; endereco?: string }>({});
  const [apiError, setApiError] = useState<unknown>(null);

  const canSeeMesas = can("mesas.listar");
  const mapa = useMesaMapa({ enabled: tipo === "mesa" && canSeeMesas });
  const disponiveis = useMemo(() => (mapa.data ?? []).filter((m) => m.status === "livre" || m.status === "reservada"), [mapa.data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const id = toInt(mesaId);
    const n = toInt(pessoas);
    if (tipo === "mesa" && id === undefined) next.mesa = "Escolha a mesa.";
    if (pessoas.trim() !== "" && (n === undefined || n < 1 || n > 100)) next.pessoas = "Informe de 1 a 100 pessoas.";
    if (tipo === "delivery" && endereco.trim() === "") next.endereco = "Informe o endereço de entrega.";
    setErrors(next);
    if (next.mesa || next.pessoas || next.endereco) return;

    const body: ComandaAbrirIn = {
      tipo,
      ...(tipo === "mesa" && id !== undefined ? { mesa_id: id } : {}),
      ...(cliente ? { cliente_id: cliente.id } : {}),
      ...(nome.trim() ? { nome_cliente: nome.trim() } : {}),
      ...(tipo === "delivery" ? { endereco_entrega: endereco.trim() } : {}),
      ...(n !== undefined ? { num_pessoas: n } : {}),
      ...(obs.trim() ? { observacao: obs.trim() } : {}),
    };
    setApiError(null);
    try {
      const comanda = await open.mutateAsync(body);
      toast.success(`Comanda #${comanda.id} aberta.`);
      onClose();
      navigate(`/comandas/${comanda.id}`);
    } catch (error) {
      setApiError(error);
      // Outra pessoa pode ter ocupado a mesa: atualiza o mapa para refletir.
      if (error instanceof ApiError && (error.codigo === "mesa_indisponivel" || error.codigo === "mesa_inativa")) void mapa.refetch();
    }
  }

  const pending = open.isPending;

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!pending}
      title="Abrir comanda"
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending}>
            Abrir comanda
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <Choice legend="Tipo de atendimento" name="tipo" value={tipo} onChange={setTipo} options={TIPOS.map((t) => [t, comandaTipoLabel(t)] as [ComandaTipo, string])} columns={4} />

        {tipo === "mesa" &&
          (!canSeeMesas ? (
            <Alert tone="warning">Você não tem permissão para ver as mesas; abra o tipo balcão, retirada ou delivery.</Alert>
          ) : mapa.isLoading ? (
            <LoadingBlock label="Carregando mesas…" />
          ) : mapa.error ? (
            <Alert tone="danger">{errorMessage(mapa.error)}</Alert>
          ) : (
            <FormField label="Mesa" error={errors.mesa} required>
              <Select className="min-h-11" value={mesaId} onChange={(e) => setMesaId(e.target.value)}>
                <option value="">Selecione…</option>
                {disponiveis.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.status === "reservada" ? " (reservada)" : ""}
                    {m.capacidade ? ` · ${m.capacidade} lugares` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          ))}

        {tipo === "delivery" && (
          <FormField label="Endereço de entrega" error={errors.endereco} required>
            <Textarea rows={2} maxLength={500} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome na comanda" hint="Opcional.">
            <Input className="min-h-11" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Número de pessoas" error={errors.pessoas} hint="Opcional.">
            <Input className="min-h-11" inputMode="numeric" value={pessoas} onChange={(e) => setPessoas(e.target.value)} autoComplete="off" />
          </FormField>
        </div>

        <ClientPicker label="Cliente (opcional)" value={cliente} onChange={setCliente} disabled={pending} />

        <FormField label="Observação">
          <Textarea rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>

        {apiError !== null && <Alert tone="danger">{errorMessage(apiError)}</Alert>}
      </form>
    </Dialog>
  );
}
