import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type PessoaOut = Schemas["PessoaOut"];
export type PessoaIn = Schemas["PessoaIn"];
export type PessoaEditarIn = Schemas["PessoaEditarIn"];
export type EnderecoIn = Schemas["EnderecoIn"];
export type EnderecoOut = Schemas["EnderecoOut"];
export type ClienteIn = Schemas["ClienteIn"];
export type SaldoAbertoOut = Schemas["SaldoAbertoOut"];
export type PessoaRapidaIn = Schemas["PessoaRapidaIn"];
export type TipoPessoa = PessoaIn["tipo"];
export type PapelPessoa = PessoaIn["papeis"][number];

export const PERSON_ROLES: readonly PapelPessoa[] = ["cliente", "fornecedor", "colaborador"];

export const ROLE_LABELS: Record<PapelPessoa, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  colaborador: "Colaborador",
};

export function roleLabel(papel: string): string {
  return (ROLE_LABELS as Record<string, string>)[papel] ?? papel;
}

export const PERSON_TYPE_LABELS: Record<TipoPessoa, string> = { F: "Pessoa física", J: "Pessoa jurídica" };
