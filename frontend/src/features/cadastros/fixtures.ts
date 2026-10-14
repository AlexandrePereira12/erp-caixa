export const PEOPLE_PERMISSIONS = ["pessoas.listar", "pessoas.criar", "pessoas.editar", "pessoas.excluir", "pessoas.cadastro_rapido", "pessoas.definir_fiado"];

/** Pessoa como a API devolve (CPF 529.982.247-25 é válido). */
export function pessoa(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    tipo: "F",
    nome: "Maria Souza",
    nome_fantasia: null,
    documento: "52998224725",
    telefone: "(11) 98888-7777",
    whatsapp: null,
    email: "maria@exemplo.com.br",
    observacoes: null,
    ativo: true,
    papeis: ["cliente"],
    enderecos: [],
    cliente: { aceita_fiado: false, limite_fiado: "0.00" },
    ...over,
  };
}
