/*
 * Dados de teste da operação do PDV (formato real da API: dinheiro e quantidade como string decimal).
 * Só é importado por testes.
 */
import { json } from "@/test/mockFetch";
import { signIn } from "@/test/render";
import type { Permission } from "@/lib/auth/permissions";

/** Permissões de cada perfil, como nos papéis de sistema do backend. */
export const PERMS = {
  atendente: ["mesas.listar", "comandas.listar", "comandas.abrir", "comandas.lancar", "comandas.cancelar_item_proprio", "comandas.transferir", "catalogo.listar", "pessoas.listar"],
  frente: [
    "mesas.listar",
    "comandas.listar",
    "comandas.abrir",
    "comandas.lancar",
    "comandas.cancelar_item_proprio",
    "comandas.transferir",
    "comandas.desconto",
    "comandas.fechar",
    "catalogo.listar",
    "pessoas.listar",
    "pessoas.cadastro_rapido",
    "vendas.listar",
    "caixa.operar",
    "formas_pagamento.listar",
    "financeiro.listar",
    "financeiro.baixar",
  ],
  gerente: [
    "mesas.listar",
    "mesas.gerenciar",
    "comandas.listar",
    "comandas.abrir",
    "comandas.lancar",
    "comandas.cancelar_item_proprio",
    "comandas.cancelar_item",
    "comandas.transferir",
    "comandas.desconto",
    "comandas.cancelar",
    "comandas.fechar",
    "catalogo.listar",
    "pessoas.listar",
    "pessoas.cadastro_rapido",
    "vendas.listar",
    "vendas.fiado",
    "vendas.estornar",
    "caixa.operar",
    "caixa.listar",
    "caixa.gerenciar_todos",
    "caixa.reabrir",
    "formas_pagamento.listar",
    "formas_pagamento.gerenciar",
    "financeiro.listar",
    "financeiro.baixar",
    "estoque.permitir_negativo",
  ],
} satisfies Record<string, Permission[]>;

export function signInAs(perfil: keyof typeof PERMS, extra: Permission[] = [], overrides: Parameters<typeof signIn>[0] = {}) {
  return signIn({ permissoes: [...PERMS[perfil], ...extra], ...overrides });
}

export const T0 = "2026-10-13T12:00:00+00:00";

export const totais = (over: Record<string, string> = {}) => ({ subtotal: "0.00", desconto: "0.00", acrescimo: "0.00", taxa_servico: "0.00", total: "0.00", ...over });

export const item = (over: Record<string, unknown> = {}) => ({
  id: 100,
  produto_id: 7,
  descricao: "Chopp 300ml",
  quantidade: "2.000",
  preco_unitario: "9.00",
  total: "18.00",
  observacao: null,
  status: "ativo",
  cancelado_motivo: null,
  lancado_em: T0,
  lancado_por: 1,
  ...over,
});

export const comanda = (over: Record<string, unknown> = {}) => ({
  id: 12,
  tipo: "mesa",
  status: "aberta",
  mesa: { id: 3, nome: "Mesa 3" },
  cliente: null,
  nome_cliente: null,
  endereco_entrega: null,
  num_pessoas: 2,
  observacao: null,
  taxa_servico_pct: "10.00",
  aberta_em: T0,
  fechada_em: null,
  cancelada_motivo: null,
  itens: [item()],
  ajustes: [],
  totais: totais({ subtotal: "18.00", taxa_servico: "1.80", total: "19.80" }),
  venda_id: null,
  ...over,
});

export const produto = (over: Record<string, unknown> = {}) => ({
  id: 7,
  nome: "Chopp 300ml",
  codigo: "CH300",
  codigo_barras: "7891234567890",
  tipo: "revenda",
  categoria: { id: 1, nome: "Bebidas" },
  unidade: { id: 1, nome: "Unidade", sigla: "UN", casas_decimais: 0 },
  preco_venda: "9.00",
  custo_medio: "3.0000",
  custo_ficha: null,
  estoque_minimo: "0.000",
  controla_estoque: true,
  saldo: "40.000",
  abaixo_minimo: false,
  vendavel: true,
  ativo: true,
  composicao: [],
  ...over,
});

export const kg = produto({ id: 9, nome: "Picanha por kg", codigo: "PIC", codigo_barras: null, preco_venda: "89.90", unidade: { id: 2, nome: "Quilo", sigla: "KG", casas_decimais: 3 } });

export const forma = (over: Record<string, unknown> = {}) => ({ id: 1, nome: "Dinheiro", tipo: "dinheiro", ativa: true, ordem: 0, ...over });
export const FORMAS = [
  forma(),
  forma({ id: 2, nome: "Pix", tipo: "pix", ordem: 1 }),
  forma({ id: 3, nome: "Cartão de crédito", tipo: "credito", ordem: 2 }),
  forma({ id: 4, nome: "Fiado", tipo: "fiado", ordem: 3 }),
];

export const mesaMapa = (over: Record<string, unknown> = {}) => ({ id: 1, nome: "Mesa 1", capacidade: 4, ativa: true, status: "livre", comanda: null, ...over });

export const caixa = (over: Record<string, unknown> = {}) => ({
  id: 5,
  operador: { id: 1, nome: "Ana Souza" },
  status: "aberto",
  valor_abertura: "100.00",
  aberto_em: T0,
  fechado_em: null,
  rodada: 1,
  esperado: [
    { forma_pagamento_id: 1, forma: "Dinheiro", tipo: "dinheiro", esperado: "250.00" },
    { forma_pagamento_id: 2, forma: "Pix", tipo: "pix", esperado: "80.00" },
  ],
  vendas_qtd: 4,
  vendas_total: "230.00",
  sangrias: "0.00",
  reforcos: "0.00",
  conferencias: [],
  ...over,
});

export const venda = (over: Record<string, unknown> = {}) => ({
  id: 31,
  comanda_id: 12,
  caixa_id: 5,
  cliente: null,
  operador: "Ana Souza",
  subtotal: "18.00",
  desconto_total: "0.00",
  acrescimo_total: "0.00",
  taxa_servico: "1.80",
  total: "19.80",
  troco_total: "0.20",
  created_at: T0,
  itens: [{ produto_id: 7, descricao: "Chopp 300ml", quantidade: "2.000", preco_unitario: "9.00", total: "18.00" }],
  pagamentos: [{ id: 1, forma_pagamento_id: 1, forma: "Dinheiro", tipo: "dinheiro", valor: "19.80", valor_recebido: "20.00", troco: "0.20", parcelas: null, observacao: null }],
  estorno: null,
  ...over,
});

export const titulo = (over: Record<string, unknown> = {}) => ({
  id: 8,
  pessoa: { id: 20, nome: "Carlos Lima" },
  descricao: "Venda #31 (comanda #12) em fiado",
  valor_original: "50.00",
  valor_pago: "10.00",
  saldo: "40.00",
  vencimento: null,
  status: "aberto",
  cancelado_motivo: null,
  venda_id: 31,
  created_at: T0,
  baixas: [{ id: 1, valor: "10.00", forma: "Dinheiro", caixa_id: 5, estorno_de_id: null, observacao: null, created_at: T0, usuario_nome: "Ana Souza" }],
  ...over,
});

export const pessoa = (over: Record<string, unknown> = {}) => ({
  id: 20,
  nome: "Carlos Lima",
  nome_fantasia: null,
  tipo: "F",
  documento: null,
  email: null,
  telefone: "11999990000",
  whatsapp: null,
  observacoes: null,
  ativo: true,
  papeis: ["cliente"],
  enderecos: [],
  cliente: { aceita_fiado: true, limite_fiado: "200.00" },
  ...over,
});

export const pageOf = <T>(itens: T[], extra: { total?: number; limite?: number; deslocamento?: number } = {}) => ({
  itens,
  total: extra.total ?? itens.length,
  limite: extra.limite ?? 20,
  deslocamento: extra.deslocamento ?? 0,
});

/** Erro de negócio no formato real do backend: `detalhes` é OBJETO (não a lista de campos da validação). */
export const businessError = (status: number, codigo: string, mensagem: string, detalhes?: unknown): Response =>
  json(status, { erro: { codigo, mensagem, ...(detalhes !== undefined ? { detalhes } : {}) } });
