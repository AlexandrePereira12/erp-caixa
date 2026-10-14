export const INVENTORY_PERMISSIONS = ["inventarios.listar", "inventarios.criar", "inventarios.contar", "inventarios.fechar"];

export function item(over: Record<string, unknown> = {}) {
  return { produto_id: 7, produto_nome: "Farinha de Trigo", unidade: "KG", quantidade_sistema: "20.000", quantidade_contada: null as string | null, diferenca: null as string | null, ...over };
}

export const ITEMS = [
  item(),
  item({ produto_id: 8, produto_nome: "Coca-Cola Lata", unidade: "UN", quantidade_sistema: "24.000" }),
  item({ produto_id: 9, produto_nome: "Queijo Mussarela", unidade: "KG", quantidade_sistema: "3.500" }),
];

/** Inventário como a API devolve; total/contados seguem os itens (o backend é quem calcula, o mock imita). */
export function inventario(over: Record<string, unknown> = {}) {
  const itens = (over.itens as ReturnType<typeof item>[] | undefined) ?? ITEMS;
  return {
    id: 1,
    descricao: "Contagem de outubro",
    status: "aberto",
    created_at: "2026-10-12T10:00:00+00:00",
    fechado_em: null as string | null,
    total_itens: itens.length,
    itens_contados: itens.filter((i) => i.quantidade_contada !== null).length,
    itens,
    ...over,
  };
}

export function resumo(over: Record<string, unknown> = {}) {
  return { id: 1, descricao: "Contagem de outubro", status: "aberto", created_at: "2026-10-12T10:00:00+00:00", fechado_em: null as string | null, total_itens: 3, itens_contados: 1, ...over };
}
