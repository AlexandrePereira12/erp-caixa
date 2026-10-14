import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type ProdutoOut = Schemas["ProdutoOut"];
export type ProdutoIn = Schemas["ProdutoIn"];
export type ProdutoEditarIn = Schemas["ProdutoEditarIn"];
export type ComposicaoItemOut = Schemas["ComposicaoItemOut"];
export type CategoriaOut = Schemas["CategoriaOut"];
export type CategoriaIn = Schemas["CategoriaIn"];
export type CategoriaEditarIn = Schemas["CategoriaEditarIn"];
export type UnidadeOut = Schemas["UnidadeOut"];
export type UnidadeIn = Schemas["UnidadeIn"];
export type UnidadeEditarIn = Schemas["UnidadeEditarIn"];
export type TipoProduto = ProdutoIn["tipo"];

export const PRODUCT_TYPES: readonly TipoProduto[] = ["revenda", "preparado", "insumo", "embalagem"];

export const PRODUCT_TYPE_LABELS: Record<TipoProduto, string> = {
  revenda: "Revenda",
  preparado: "Preparado",
  insumo: "Insumo",
  embalagem: "Embalagem",
};

/** Rótulo do tipo; tipos desconhecidos (backend mais novo) aparecem como vieram. */
export function productTypeLabel(tipo: string): string {
  return (PRODUCT_TYPE_LABELS as Record<string, string>)[tipo] ?? tipo;
}

/** Tipos que podem ser insumo de uma ficha técnica (mesma regra do backend: TIPOS_INSUMO). */
export const RECIPE_INPUT_TYPES: readonly TipoProduto[] = ["insumo", "embalagem", "revenda"];

/** Defaults inteligentes por tipo — espelham o que o backend aplica quando o campo é omitido na criação. */
export function defaultsForType(tipo: TipoProduto): { controla_estoque: boolean; vendavel: boolean } {
  return { controla_estoque: tipo !== "preparado", vendavel: tipo === "revenda" || tipo === "preparado" };
}
