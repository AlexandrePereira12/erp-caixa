import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { countItem, inventoryKey, useSerialQueue } from "./api";
import type { InventarioItemOut } from "./types";
import { useUnitScales } from "@/features/catalogo/api";
import { useToast } from "@/components/Toast";
import { parseQuantityInput } from "@/features/catalogo/decimalInput";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { compareDecimal } from "@/lib/decimal";

export interface RowState {
  status: "saving" | "error";
  message?: string;
}

function without<T>(record: Record<number, T>, key: number): Record<number, T> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * Contagem do inventário linha a linha.
 * - `drafts`: texto digitado por produto, que não é sobrescrito quando o cache atualiza por causa de outra linha;
 * - salvamento ao sair do campo/Enter, em fila serial (cada PUT devolve o inventário inteiro e respostas fora de
 *   ordem apagariam a contagem mais nova);
 * - sem requisição quando o valor é igual ao último valor enviado ou ao que o servidor já tem (Enter seguido de blur);
 * - campo vazio não envia nada: não existe endpoint para desfazer uma contagem, então o campo volta ao valor salvo.
 */
export function useInventoryCounting(inventoryId: number) {
  const client = useQueryClient();
  const toast = useToast();
  const { scaleOf } = useUnitScales();
  const { enqueue, idle } = useSerialQueue();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const sent = useRef(new Map<number, string>());

  function setDraft(productId: number, text: string) {
    setDrafts((current) => ({ ...current, [productId]: text }));
    setRows((current) => (current[productId]?.status === "error" ? without(current, productId) : current));
  }

  /** Grava a contagem digitada (blur/Enter). `text` vem do próprio campo, não do estado. */
  function commit(item: InventarioItemOut, text: string) {
    const id = item.produto_id;
    if (!text.trim()) {
      // Não existe "desfazer contagem": o campo volta ao valor salvo. Um salvamento em voo continua mostrando "Salvando…".
      setDrafts((current) => without(current, id));
      setRows((current) => (current[id]?.status === "saving" ? current : without(current, id)));
      return;
    }
    const parsed = parseQuantityInput(text, { scale: scaleOf(item.unidade), unit: item.unidade, allowZero: true });
    if (parsed.error !== undefined) {
      setRows((current) => ({ ...current, [id]: { status: "error", message: parsed.error } }));
      return;
    }

    // Já está sendo salvo com esse mesmo valor (Enter seguido de blur): não mexe em nada, o rascunho e o
    // "Salvando…" ficam até a resposta; se falhar, o texto digitado continua no campo.
    const inFlight = sent.current.get(id);
    if (inFlight !== undefined && compareDecimal(parsed.value, inFlight) === 0) return;
    // Sem nada em voo e igual ao que o servidor já tem: nada a enviar.
    if (inFlight === undefined && item.quantidade_contada !== null && compareDecimal(parsed.value, item.quantidade_contada) === 0) {
      setDrafts((current) => without(current, id));
      setRows((current) => without(current, id));
      return;
    }

    const value = parsed.value;
    sent.current.set(id, value);
    setRows((current) => ({ ...current, [id]: { status: "saving" } }));
    enqueue(async () => {
      const result = await countItem(inventoryId, id, value);
      client.setQueryData(inventoryKey(inventoryId), result);
    })
      .then(() => {
        if (sent.current.get(id) === value) sent.current.delete(id);
        // Se um valor mais novo da mesma linha já está na fila, o "Salvando…" dele continua.
        if (!sent.current.has(id)) setRows((current) => without(current, id));
        setDrafts((current) => (current[id] === text ? without(current, id) : current));
      })
      .catch((error: unknown) => {
        if (sent.current.get(id) === value) sent.current.delete(id);
        setRows((current) => ({ ...current, [id]: { status: "error", message: errorMessage(error) } }));
        // Inventário fechado/cancelado por outra pessoa: recarrega para a tela virar somente leitura.
        if (error instanceof ApiError && error.codigo === "inventario_nao_aberto") {
          toast.error(error.message);
          void client.invalidateQueries({ queryKey: inventoryKey(inventoryId) });
        }
      });
  }

  const errorCount = Object.values(rows).filter((row) => row.status === "error").length;
  return { drafts, rows, setDraft, commit, idle, errorCount };
}
