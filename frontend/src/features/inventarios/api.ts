import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { InventarioCriarIn, InventarioFechadoOut, InventarioOut, InventoryStatus } from "./types";
import { api } from "@/lib/api/client";

export const INVENTORY_PAGE_SIZE = 20;
export const inventoriesKey = ["inventarios"] as const;
export const inventoryKey = (id: number) => [...inventoriesKey, "detalhe", id] as const;

export function useInventories(filters: { status: InventoryStatus | undefined; deslocamento: number }) {
  return useQuery({
    queryKey: [...inventoriesKey, "lista", filters],
    queryFn: ({ signal }) => api.get("/inventarios", { query: { status: filters.status, limite: INVENTORY_PAGE_SIZE, deslocamento: filters.deslocamento }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useInventory(id: number | undefined) {
  return useQuery({
    queryKey: inventoryKey(id ?? 0),
    queryFn: ({ signal }) => api.get("/inventarios/{inventario_id}", { path: { inventario_id: id as number }, signal }),
    enabled: id !== undefined,
  });
}

/** Produtos candidatos a "seleção de produtos" do inventário: só ativos que controlam estoque (regra do backend). */
export function useInventoryProductSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["produtos", "inventario-busca", q],
    queryFn: ({ signal }) => api.get("/produtos", { query: { q: q || undefined, ativo: true, limite: 50 }, signal }),
    enabled,
    select: (page) => page.itens.filter((produto) => produto.controla_estoque),
  });
}

/** PUT /inventarios/{id}/itens/{produto_id}: devolve o inventário inteiro com a contagem aplicada. */
export function countItem(inventoryId: number, productId: number, quantidade: string): Promise<InventarioOut> {
  return api.put("/inventarios/{inventario_id}/itens/{produto_id}", {
    path: { inventario_id: inventoryId, produto_id: productId },
    body: { quantidade_contada: quantidade },
  });
}

export function useInventoryMutations() {
  const client = useQueryClient();
  const refreshLists = () => client.invalidateQueries({ queryKey: [...inventoriesKey, "lista"] });
  return {
    create: useMutation({
      mutationFn: (body: InventarioCriarIn) => api.post("/inventarios", { body }),
      onSuccess: (created) => {
        client.setQueryData(inventoryKey(created.id), created);
        return refreshLists();
      },
    }),
    close: useMutation({
      mutationFn: (id: number): Promise<InventarioFechadoOut> => api.post("/inventarios/{inventario_id}/fechar", { path: { inventario_id: id } }),
      onSuccess: (closed, id) => {
        client.setQueryData(inventoryKey(id), closed);
        // O fechamento move o estoque: saldos, movimentos e lista de produtos ficam velhos.
        return Promise.all([refreshLists(), client.invalidateQueries({ queryKey: ["estoque"] }), client.invalidateQueries({ queryKey: ["produtos"] })]);
      },
    }),
    cancel: useMutation({
      mutationFn: (id: number) => api.post("/inventarios/{inventario_id}/cancelar", { path: { inventario_id: id } }),
      onSuccess: (canceled, id) => {
        client.setQueryData(inventoryKey(id), canceled);
        return refreshLists();
      },
    }),
  };
}

/**
 * Fila serial de tarefas assíncronas. Cada PUT de contagem devolve o inventário inteiro; se dois
 * salvamentos voltassem fora de ordem, a resposta mais antiga apagaria a contagem mais nova do
 * cache. Executar um por vez elimina a corrida (determinístico, sem timeout). `idle()` resolve
 * quando tudo que foi enfileirado até agora terminou.
 */
export function useSerialQueue() {
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task);
    tail.current = run.catch(() => undefined);
    return run;
  }, []);
  const idle = useCallback(() => tail.current.then(() => undefined), []);
  return { enqueue, idle };
}
