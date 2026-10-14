const MODULE_LABELS: Record<string, string> = {
  usuarios: "Usuários",
  papeis: "Papéis",
  permissoes: "Permissões",
  auditoria: "Auditoria",
  configuracoes: "Configurações",
  auth: "Autenticação",
  pessoas: "Pessoas",
  catalogo: "Catálogo",
  estoque: "Estoque",
  inventarios: "Inventários",
  mesas: "Mesas",
  comandas: "Comandas",
  vendas: "Vendas",
  caixa: "Caixa",
  formas_pagamento: "Formas de pagamento",
  financeiro: "Financeiro",
};

/** Nome amigável de um módulo; códigos desconhecidos (módulos futuros) viram "Capitalizado". */
export function moduleLabel(modulo: string): string {
  return MODULE_LABELS[modulo] ?? modulo.charAt(0).toUpperCase() + modulo.slice(1).replace(/_/g, " ");
}
