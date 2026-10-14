export const CATALOG_PERMISSIONS = ["catalogo.listar", "catalogo.criar", "catalogo.editar", "catalogo.excluir"];

export const UN = { id: 1, sigla: "UN", nome: "Unidade", casas_decimais: 0 };
export const KG = { id: 2, sigla: "KG", nome: "Quilograma", casas_decimais: 3 };
export const BEBIDAS = { id: 1, nome: "Bebidas", descricao: null as string | null, ativo: true };
export const LANCHES = { id: 2, nome: "Lanches", descricao: "Salgados e sanduíches", ativo: true };

/** Produto como a API devolve (strings decimais; custo com 4 casas). */
export function produto(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    nome: "Coca-Cola Lata",
    tipo: "revenda",
    categoria: { id: 1, nome: "Bebidas" },
    unidade: UN,
    codigo: "COCA",
    codigo_barras: "7894900011517",
    preco_venda: "7.50",
    custo_medio: "3.2500",
    custo_ficha: null as string | null,
    estoque_minimo: "10.000",
    controla_estoque: true,
    vendavel: true,
    ativo: true,
    saldo: "24.000",
    abaixo_minimo: false,
    composicao: [] as unknown[],
    ...over,
  };
}

export const insumo = (over: Record<string, unknown> = {}) =>
  produto({ id: 7, nome: "Farinha de Trigo", tipo: "insumo", unidade: KG, codigo: "FAR", codigo_barras: null, preco_venda: "0.00", custo_medio: "4.0000", vendavel: false, saldo: "20.000", estoque_minimo: "5.000", ...over });

export const hamburguer = (over: Record<string, unknown> = {}) =>
  produto({
    id: 200,
    nome: "X-Burger",
    tipo: "preparado",
    categoria: { id: 2, nome: "Lanches" },
    codigo: "XB",
    codigo_barras: null,
    preco_venda: "28.00",
    custo_medio: "0.0000",
    custo_ficha: "1.2000",
    estoque_minimo: "0.000",
    controla_estoque: false,
    saldo: null,
    composicao: [{ insumo_id: 7, insumo_nome: "Farinha de Trigo", unidade: "KG", quantidade: "0.300", custo_item: "1.20" }],
    ...over,
  });
