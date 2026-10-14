import { onlyDigits } from "./masks";
import type { EnderecoIn, EnderecoOut, PapelPessoa, PessoaEditarIn, PessoaIn, PessoaOut, TipoPessoa } from "./types";
import { compareDecimal } from "@/lib/decimal";

export interface AddressValues {
  rotulo: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  principal: boolean;
}

export interface PersonFormValues {
  tipo: TipoPessoa;
  nome: string;
  nome_fantasia: string;
  documento: string;
  telefone: string;
  whatsapp: string;
  email: string;
  observacoes: string;
  ativo: boolean;
  papeis: PapelPessoa[];
  enderecos: AddressValues[];
  aceita_fiado: boolean;
  limite_fiado: string;
}

export interface BodyOptions {
  /** Usuário tem pessoas.definir_fiado: só então o bloco `cliente` pode ir no corpo. */
  canSetFiado: boolean;
  /** Limite de fiado já convertido para a string decimal da API ("1500.50"). */
  limite: string | null;
}

const orNull = (text: string): string | null => text.trim() || null;
const digitsOrNull = (text: string): string | null => onlyDigits(text) || null;

function normalizeAddress(address: AddressValues): EnderecoIn {
  return {
    rotulo: orNull(address.rotulo),
    cep: digitsOrNull(address.cep),
    logradouro: address.logradouro.trim(),
    numero: orNull(address.numero),
    complemento: orNull(address.complemento),
    bairro: orNull(address.bairro),
    cidade: address.cidade.trim(),
    uf: address.uf.trim().toUpperCase(),
    principal: address.principal,
  };
}

/** Garante exatamente um principal quando há endereços (o primeiro, se nenhum foi marcado). */
export function normalizeAddresses(addresses: AddressValues[]): EnderecoIn[] {
  const list = addresses.map(normalizeAddress);
  if (list.length > 0 && !list.some((address) => address.principal)) {
    const [first, ...rest] = list;
    return [{ ...first!, principal: true }, ...rest];
  }
  return list;
}

function fromServer(address: EnderecoOut): EnderecoIn {
  return {
    rotulo: address.rotulo ?? null,
    cep: address.cep ?? null,
    logradouro: address.logradouro,
    numero: address.numero ?? null,
    complemento: address.complemento ?? null,
    bairro: address.bairro ?? null,
    cidade: address.cidade,
    uf: address.uf,
    principal: address.principal ?? false,
  };
}

const addressKey = (a: EnderecoIn): string => JSON.stringify([a.rotulo, a.cep, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.uf, a.principal]);

const sameRoles = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((role) => b.includes(role));

/** Corpo do POST /pessoas. Campos opcionais vazios vão como null (e-mail "" seria 422). */
export function buildCreateBody(values: PersonFormValues, options: BodyOptions): PessoaIn {
  const body: PessoaIn = {
    tipo: values.tipo,
    nome: values.nome.trim(),
    nome_fantasia: values.tipo === "J" ? orNull(values.nome_fantasia) : null,
    documento: digitsOrNull(values.documento),
    telefone: orNull(values.telefone),
    whatsapp: orNull(values.whatsapp),
    email: orNull(values.email),
    observacoes: orNull(values.observacoes),
    ativo: values.ativo,
    papeis: values.papeis,
    enderecos: normalizeAddresses(values.enderecos),
  };
  // Sem pessoas.definir_fiado o backend recusa qualquer valor de fiado: não enviar o bloco.
  if (options.canSetFiado && values.papeis.includes("cliente") && options.limite !== null) {
    body.cliente = { aceita_fiado: values.aceita_fiado, limite_fiado: options.limite };
  }
  return body;
}

/**
 * Corpo do PATCH /pessoas/{id} só com o que mudou (evita ruído de auditoria e falsos conflitos).
 * `papeis` e `enderecos`, quando enviados, substituem a lista inteira no backend.
 */
export function buildPatchBody(original: PessoaOut, values: PersonFormValues, options: BodyOptions): PessoaEditarIn {
  const body: PessoaEditarIn = {};
  if (values.tipo !== original.tipo) body.tipo = values.tipo;
  if (values.nome.trim() !== original.nome) body.nome = values.nome.trim();
  const fantasia = values.tipo === "J" ? orNull(values.nome_fantasia) : null;
  if (fantasia !== (original.nome_fantasia ?? null)) body.nome_fantasia = fantasia;
  if ((digitsOrNull(values.documento) ?? "") !== onlyDigits(original.documento ?? "")) body.documento = digitsOrNull(values.documento);
  if (orNull(values.telefone) !== (original.telefone ?? null)) body.telefone = orNull(values.telefone);
  if (orNull(values.whatsapp) !== (original.whatsapp ?? null)) body.whatsapp = orNull(values.whatsapp);
  if (orNull(values.email) !== (original.email ?? null)) body.email = orNull(values.email);
  if (orNull(values.observacoes) !== (original.observacoes ?? null)) body.observacoes = orNull(values.observacoes);
  if (values.ativo !== original.ativo) body.ativo = values.ativo;
  if (!sameRoles(values.papeis, original.papeis)) body.papeis = values.papeis;

  const addresses = normalizeAddresses(values.enderecos);
  if (addresses.map(addressKey).join("|") !== original.enderecos.map((e) => addressKey(fromServer(e))).join("|")) body.enderecos = addresses;

  if (options.canSetFiado && values.papeis.includes("cliente") && options.limite !== null) {
    const before = original.cliente ?? { aceita_fiado: false, limite_fiado: "0.00" };
    if (values.aceita_fiado !== before.aceita_fiado || compareDecimal(options.limite, before.limite_fiado) !== 0) {
      body.cliente = { aceita_fiado: values.aceita_fiado, limite_fiado: options.limite };
    }
  }
  return body;
}
