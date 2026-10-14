export const STOCK_PERMISSIONS = ["estoque.listar", "estoque.entrada", "estoque.ajustar"];

export function saldo(over: Record<string, unknown> = {}) {
  return {
    produto_id: 7,
    nome: "Farinha de Trigo",
    tipo: "insumo",
    unidade: "KG",
    saldo: "20.000",
    estoque_minimo: "5.000",
    abaixo_minimo: false,
    custo_medio: "4.0000",
    valor_em_estoque: "80.00",
    ...over,
  };
}

export function movimento(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    produto_id: 7,
    produto_nome: "Farinha de Trigo",
    unidade: "KG",
    tipo: "entrada",
    quantidade: "5.000",
    saldo_apos: "25.000",
    custo_unitario: "4.2000",
    origem_tipo: "manual_entrada",
    origem_id: null,
    documento: "NF 123",
    justificativa: "Compra semanal",
    ocorrido_em: "2026-10-13T14:30:00+00:00",
    usuario_nome: "Ana Souza",
    fornecedor: null,
    ...over,
  };
}
