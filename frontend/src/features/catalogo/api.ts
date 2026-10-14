import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { RECIPE_INPUT_TYPES, type CategoriaEditarIn, type CategoriaIn, type ProdutoEditarIn, type ProdutoIn, type TipoProduto, type UnidadeEditarIn, type UnidadeIn } from "./types";
import { api } from "@/lib/api/client";
import { usePermissions } from "@/lib/auth/hooks";

export const PRODUCT_PAGE_SIZE = 20;
export const productsKey = ["produtos"] as const;
export const unitsKey = ["unidades"] as const;
export const categoriesKey = ["categorias"] as const;
/** O estoque mostra dados do produto (nome, tipo, mínimo, custo): muda junto com o catálogo. */
const stockKey = ["estoque"] as const;

export interface ProductFilters {
  q: string;
  tipo: TipoProduto | undefined;
  categoriaId: number | undefined;
  ativo: boolean | undefined;
  vendavel: boolean | undefined;
  abaixoMinimo: boolean;
  deslocamento: number;
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: [...productsKey, "lista", filters],
    queryFn: ({ signal }) =>
      api.get("/produtos", {
        query: {
          q: filters.q || undefined,
          tipo: filters.tipo,
          categoria_id: filters.categoriaId,
          ativo: filters.ativo,
          vendavel: filters.vendavel,
          abaixo_minimo: filters.abaixoMinimo ? true : undefined,
          limite: PRODUCT_PAGE_SIZE,
          deslocamento: filters.deslocamento,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useUnits(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: unitsKey, queryFn: ({ signal }) => api.get("/unidades", { signal }), enabled: options.enabled ?? true });
}

/** Máximo de casas que o backend aceita em qualquer unidade (usado quando a escala da unidade é desconhecida). */
export const MAX_SCALE = 3;

/**
 * Casas decimais por sigla de unidade. Saldos, movimentos e itens de inventário trazem só a sigla,
 * então a escala vem de GET /unidades (exige catalogo.listar). Sem essa permissão (ou enquanto
 * carrega) vale o máximo do backend e a palavra final é do erro `quantidade_fracionada`.
 */
export function useUnitScales() {
  const { can } = usePermissions();
  const known = can("catalogo.listar");
  const units = useUnits({ enabled: known });
  const bySigla = useMemo(() => new Map((units.data ?? []).map((unit) => [unit.sigla, unit.casas_decimais])), [units.data]);
  const scaleOf = useCallback((sigla: string | undefined): number => (sigla ? (bySigla.get(sigla) ?? MAX_SCALE) : MAX_SCALE), [bySigla]);
  return { scaleOf, loaded: bySigla.size > 0 };
}

export function useCategories(options: { ativo?: boolean | undefined; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...categoriesKey, { ativo: options.ativo }],
    queryFn: ({ signal }) => api.get("/categorias", { query: { ativo: options.ativo }, signal }),
    enabled: options.enabled ?? true,
  });
}

export function useProductMutations() {
  const client = useQueryClient();
  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: productsKey }), client.invalidateQueries({ queryKey: stockKey })]);
  return {
    create: useMutation({ mutationFn: (body: ProdutoIn) => api.post("/produtos", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: ProdutoEditarIn }) => api.patch("/produtos/{produto_id}", { path: { produto_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/produtos/{produto_id}", { path: { produto_id: id } }), onSuccess: invalidate }),
    setRecipe: useMutation({
      mutationFn: ({ id, itens }: { id: number; itens: { insumo_id: number; quantidade: string }[] }) =>
        api.put("/produtos/{produto_id}/composicao", { path: { produto_id: id }, body: { itens } }),
      onSuccess: invalidate,
    }),
  };
}

export function useCategoryMutations() {
  const client = useQueryClient();
  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: categoriesKey }), client.invalidateQueries({ queryKey: productsKey })]);
  return {
    create: useMutation({ mutationFn: (body: CategoriaIn) => api.post("/categorias", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: CategoriaEditarIn }) => api.patch("/categorias/{categoria_id}", { path: { categoria_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/categorias/{categoria_id}", { path: { categoria_id: id } }), onSuccess: invalidate }),
  };
}

export function useUnitMutations() {
  const client = useQueryClient();
  const invalidate = () => Promise.all([client.invalidateQueries({ queryKey: unitsKey }), client.invalidateQueries({ queryKey: productsKey })]);
  return {
    create: useMutation({ mutationFn: (body: UnidadeIn) => api.post("/unidades", { body }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: UnidadeEditarIn }) => api.patch("/unidades/{unidade_id}", { path: { unidade_id: id }, body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.delete("/unidades/{unidade_id}", { path: { unidade_id: id } }), onSuccess: invalidate }),
  };
}

/**
 * Candidatos a insumo de ficha técnica. O filtro `tipo` da API aceita um tipo por vez, então há uma
 * busca por tipo elegível (insumo, embalagem, revenda); o restante das regras do backend
 * (controla estoque, sem ficha própria) é aplicado por quem chama, sobre o resultado.
 */
export function useRecipeInputSearch(q: string, enabled: boolean) {
  const results = useQueries({
    queries: RECIPE_INPUT_TYPES.map((tipo) => ({
      queryKey: [...productsKey, "insumos", tipo, q],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get("/produtos", { query: { q: q || undefined, tipo, ativo: true, limite: 20 }, signal }),
      enabled,
    })),
  });
  const items = results.flatMap((result) => result.data?.itens ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { items, isLoading: results.some((result) => result.isLoading), error: results.find((result) => result.error)?.error };
}
