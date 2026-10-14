import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { caixaKey } from "@/features/caixa/api";
import { mesasKey } from "@/features/mesas/api";
import { contasKey } from "@/features/financeiro/api";
import { vendasKey } from "@/features/vendas/api";
import { api } from "@/lib/api/client";
import type { components, paths } from "@/lib/api/schema";
import type { Comanda, ComandaAbrirIn, FecharComandaIn } from "@/components/pdv/types";

export const comandasKey = ["comandas"] as const;
export const comandaKey = (id: number) => [...comandasKey, "detalhe", id] as const;
export const COMANDAS_PAGE_SIZE = 20;
export const COMANDA_REFRESH_MS = 15_000;
export const PRODUTOS_LIMIT = 100;

// Derivado da operação (o nome do schema é gerado e muda se houver colisão com o AjusteIn do estoque).
type AjusteIn = paths["/api/v1/comandas/{comanda_id}/ajustes"]["post"]["requestBody"]["content"]["application/json"];
type ComandaEditarIn = components["schemas"]["ComandaEditarIn"];

export const EM_ANDAMENTO = ["aberta", "aguardando_pagamento"];

/* ---------- Consultas ---------- */

export type ComandaStatus = "aberta" | "aguardando_pagamento" | "fechada" | "cancelada";
export type ComandaTipo = "mesa" | "balcao" | "retirada" | "delivery";

export interface ComandaFilters {
  status?: ComandaStatus | undefined;
  tipo?: ComandaTipo | undefined;
  mesaId?: number | undefined;
  clienteId?: number | undefined;
  de?: string | undefined;
  ate?: string | undefined;
  q: string;
  deslocamento: number;
}

export function useComandas(filters: ComandaFilters) {
  return useQuery({
    queryKey: [...comandasKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/comandas", {
        query: {
          status: filters.status,
          tipo: filters.tipo,
          mesa_id: filters.mesaId,
          cliente_id: filters.clienteId,
          de: filters.de,
          ate: filters.ate,
          q: filters.q || undefined,
          limite: COMANDAS_PAGE_SIZE,
          deslocamento: filters.deslocamento,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** Comanda aberta no atendimento: recarrega sozinha (outro aparelho pode estar lançando itens). */
export function useComanda(id: number | undefined) {
  return useQuery({
    queryKey: id === undefined ? [...comandasKey, "detalhe"] : comandaKey(id),
    queryFn: ({ signal }) => api.get("/comandas/{comanda_id}", { path: { comanda_id: id! }, signal }),
    enabled: id !== undefined,
    refetchInterval: (query) => (query.state.data && EM_ANDAMENTO.includes(query.state.data.status) ? COMANDA_REFRESH_MS : false),
    refetchOnWindowFocus: true,
  });
}

export function useDivisao(id: number, pessoas: number | undefined) {
  return useQuery({
    queryKey: [...comandasKey, "divisao", id, pessoas],
    queryFn: ({ signal }) => api.get("/comandas/{comanda_id}/divisao", { path: { comanda_id: id }, query: { pessoas: pessoas! }, signal }),
    enabled: pessoas !== undefined,
    staleTime: 0,
  });
}

export interface ProdutoFilters {
  q: string;
  categoriaId?: number | undefined;
}

/** Consulta de produtos que podem ser lançados: vendáveis e ativos. Exige catalogo.listar. */
export function produtosVendaveisQuery(filters: ProdutoFilters) {
  return {
    queryKey: ["produtos", "vendaveis", filters] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.get("/produtos", {
        query: { q: filters.q || undefined, categoria_id: filters.categoriaId, vendavel: true, ativo: true, limite: PRODUTOS_LIMIT },
        signal,
      }),
  };
}

export function useProdutosVendaveis(filters: ProdutoFilters, enabled = true) {
  return useQuery({ ...produtosVendaveisQuery(filters), enabled, placeholderData: keepPreviousData, staleTime: 60_000 });
}

export function useCategorias(enabled = true) {
  return useQuery({
    queryKey: ["categorias", "ativas"],
    queryFn: ({ signal }) => api.get("/categorias", { query: { ativo: true }, signal }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/* ---------- Escrita ---------- */

export function useAbrirComanda() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ComandaAbrirIn) => api.post("/comandas", { body }),
    onSuccess: (comanda) => {
      client.setQueryData(comandaKey(comanda.id), comanda);
      void client.invalidateQueries({ queryKey: [...comandasKey, "lista"] });
      void client.invalidateQueries({ queryKey: mesasKey });
    },
  });
}

export interface PendingAdd {
  key: number;
  descricao: string;
  quantidade: string;
}

/**
 * Ações sobre UMA comanda. As chamadas saem em fila (uma de cada vez, na ordem do toque):
 * várias respostas em voo fora de ordem deixariam a tela com a comanda de um estado anterior.
 * Toda resposta traz a comanda inteira (totais calculados pelo backend) e vira o cache dela.
 */
export function useComandaActions(id: number) {
  const client = useQueryClient();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0);
  const [pending, setPending] = useState<PendingAdd[]>([]);

  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const apply = useCallback(
    async (comanda: Comanda) => {
      // Uma leitura que já estava em voo traria o estado anterior à ação: descarta.
      await client.cancelQueries({ queryKey: comandaKey(id) });
      client.setQueryData(comandaKey(id), comanda);
      void client.invalidateQueries({ queryKey: [...comandasKey, "lista"] });
      void client.invalidateQueries({ queryKey: mesasKey });
    },
    [client, id],
  );

  const path = { comanda_id: id };

  const addItem = useMutation({
    mutationFn: (body: { produto_id: number; quantidade: string; observacao?: string }) => enqueue(() => api.post("/comandas/{comanda_id}/itens", { path, body })),
    onSuccess: apply,
  });
  const editItem = useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: { quantidade?: string; observacao?: string | null } }) =>
      enqueue(() => api.patch("/comandas/{comanda_id}/itens/{item_id}", { path: { ...path, item_id: itemId }, body })),
    onSuccess: apply,
  });
  const cancelItem = useMutation({
    mutationFn: ({ itemId, motivo }: { itemId: number; motivo: string }) =>
      enqueue(() => api.post("/comandas/{comanda_id}/itens/{item_id}/cancelar", { path: { ...path, item_id: itemId }, body: { motivo } })),
    onSuccess: apply,
  });
  const editHeader = useMutation({
    mutationFn: (body: ComandaEditarIn) => enqueue(() => api.patch("/comandas/{comanda_id}", { path, body })),
    onSuccess: apply,
  });
  const askBill = useMutation({
    mutationFn: () => enqueue(() => api.post("/comandas/{comanda_id}/pedir-conta", { path })),
    onSuccess: apply,
  });
  const reopen = useMutation({
    mutationFn: () => enqueue(() => api.post("/comandas/{comanda_id}/reabrir", { path })),
    onSuccess: apply,
  });
  const cancel = useMutation({
    mutationFn: (motivo: string) => enqueue(() => api.post("/comandas/{comanda_id}/cancelar", { path, body: { motivo } })),
    onSuccess: apply,
  });
  const transfer = useMutation({
    mutationFn: (mesa_id: number) => enqueue(() => api.post("/comandas/{comanda_id}/transferir", { path, body: { mesa_id } })),
    onSuccess: apply,
  });
  const addAdjustment = useMutation({
    mutationFn: (body: AjusteIn) => enqueue(() => api.post("/comandas/{comanda_id}/ajustes", { path, body })),
    onSuccess: apply,
  });
  const removeAdjustment = useMutation({
    mutationFn: (ajusteId: number) => enqueue(() => api.delete("/comandas/{comanda_id}/ajustes/{ajuste_id}", { path: { ...path, ajuste_id: ajusteId } })),
    onSuccess: apply,
  });

  /** Toque no produto: o item aparece como "enviando" na hora; o total só muda com a resposta da API. */
  const add = useCallback(
    async (produto: { id: number; nome: string }, quantidade: string, observacao?: string) => {
      const key = ++seq.current;
      setPending((list) => [...list, { key, descricao: produto.nome, quantidade }]);
      try {
        await addItem.mutateAsync({ produto_id: produto.id, quantidade, ...(observacao ? { observacao } : {}) });
      } finally {
        setPending((list) => list.filter((p) => p.key !== key));
      }
    },
    [addItem],
  );

  const busy =
    pending.length > 0 ||
    [editItem, cancelItem, editHeader, askBill, reopen, cancel, transfer, addAdjustment, removeAdjustment].some((m) => m.isPending);

  return { add, pending, busy, editItem, cancelItem, editHeader, askBill, reopen, cancel, transfer, addAdjustment, removeAdjustment };
}

/** Fechamento da conta: cria a venda, lança no caixa/estoque/fiado e fecha a comanda numa transação do backend. */
export function useFecharComanda() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: FecharComandaIn }) => api.post("/comandas/{comanda_id}/fechar", { path: { comanda_id: id }, body }),
    onSuccess: (_venda, { id }) => {
      void client.invalidateQueries({ queryKey: comandaKey(id) });
      void client.invalidateQueries({ queryKey: [...comandasKey, "lista"] });
      void client.invalidateQueries({ queryKey: mesasKey });
      void client.invalidateQueries({ queryKey: caixaKey });
      void client.invalidateQueries({ queryKey: vendasKey });
      void client.invalidateQueries({ queryKey: contasKey });
    },
  });
}
