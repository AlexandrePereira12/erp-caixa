import { describe, expect, it } from "vitest";
import { buildCreateBody, buildPatchBody, normalizeAddresses, type PersonFormValues } from "./personBody";
import { pessoa } from "./fixtures";
import type { PessoaOut } from "./types";

const base = (over: Partial<PersonFormValues> = {}): PersonFormValues => ({
  tipo: "F",
  nome: "  Maria Souza ",
  nome_fantasia: "Ignorado em PF",
  documento: "529.982.247-25",
  telefone: " (11) 98888-7777 ",
  whatsapp: "",
  email: "",
  observacoes: "",
  ativo: true,
  papeis: ["cliente"],
  enderecos: [],
  aceita_fiado: false,
  limite_fiado: "0,00",
  ...over,
});

describe("buildCreateBody", () => {
  it("campos vazios vão como null (e-mail vazio seria 422) e o documento vai só com dígitos", () => {
    const body = buildCreateBody(base(), { canSetFiado: false, limite: null });
    expect(body).toEqual({
      tipo: "F",
      nome: "Maria Souza",
      nome_fantasia: null,
      documento: "52998224725",
      telefone: "(11) 98888-7777",
      whatsapp: null,
      email: null,
      observacoes: null,
      ativo: true,
      papeis: ["cliente"],
      enderecos: [],
    });
  });

  it("sem pessoas.definir_fiado o bloco cliente nunca vai; com a permissão, vai a string decimal", () => {
    expect(buildCreateBody(base({ aceita_fiado: true }), { canSetFiado: false, limite: "100.00" })).not.toHaveProperty("cliente");
    expect(buildCreateBody(base({ aceita_fiado: true }), { canSetFiado: true, limite: "100.00" }).cliente).toEqual({ aceita_fiado: true, limite_fiado: "100.00" });
    expect(buildCreateBody(base({ papeis: ["fornecedor"] }), { canSetFiado: true, limite: "0.00" })).not.toHaveProperty("cliente");
  });

  it("PJ mantém o nome fantasia", () => {
    expect(buildCreateBody(base({ tipo: "J", nome_fantasia: " Padaria do Zé " }), { canSetFiado: false, limite: null }).nome_fantasia).toBe("Padaria do Zé");
  });
});

describe("normalizeAddresses", () => {
  const address = { rotulo: "", cep: "01310-100", logradouro: " Av. Paulista ", numero: "1000", complemento: "", bairro: "", cidade: "São Paulo", uf: "sp", principal: false };

  it("CEP só com dígitos, UF em maiúsculas e vazio como null", () => {
    expect(normalizeAddresses([{ ...address, principal: true }])).toEqual([
      { rotulo: null, cep: "01310100", logradouro: "Av. Paulista", numero: "1000", complemento: null, bairro: null, cidade: "São Paulo", uf: "SP", principal: true },
    ]);
  });

  it("sem principal marcado, o primeiro vira o principal", () => {
    const list = normalizeAddresses([address, { ...address, logradouro: "Rua B" }]);
    expect(list.map((a) => a.principal)).toEqual([true, false]);
  });
});

describe("buildPatchBody", () => {
  const original: PessoaOut = pessoa({ telefone: "(11) 98888-7777", email: "maria@exemplo.com.br" });
  const same = (over: Partial<PersonFormValues> = {}): PersonFormValues =>
    base({ nome: "Maria Souza", nome_fantasia: "", telefone: "(11) 98888-7777", email: "maria@exemplo.com.br", ...over });

  it("sem mudanças, corpo vazio", () => {
    expect(buildPatchBody(original, same(), { canSetFiado: true, limite: "0.00" })).toEqual({});
  });

  it("só o que mudou", () => {
    expect(buildPatchBody(original, same({ telefone: "(11) 97777-6666", observacoes: "VIP" }), { canSetFiado: false, limite: null })).toEqual({ telefone: "(11) 97777-6666", observacoes: "VIP" });
  });

  it("limpar um campo opcional envia null", () => {
    expect(buildPatchBody(original, same({ email: "" }), { canSetFiado: false, limite: null })).toEqual({ email: null });
  });

  it("fiado: só com permissão e só se mudou (limite comparado como decimal)", () => {
    expect(buildPatchBody(original, same({ aceita_fiado: false }), { canSetFiado: true, limite: "0.0" })).toEqual({});
    expect(buildPatchBody(original, same({ aceita_fiado: true }), { canSetFiado: true, limite: "250.50" })).toEqual({ cliente: { aceita_fiado: true, limite_fiado: "250.50" } });
    expect(buildPatchBody(original, same({ aceita_fiado: true }), { canSetFiado: false, limite: null })).toEqual({});
  });

  it("trocar papéis envia a lista inteira; sem o papel cliente, nada de cliente", () => {
    expect(buildPatchBody(original, same({ papeis: ["cliente", "fornecedor"] }), { canSetFiado: true, limite: "0.00" })).toEqual({ papeis: ["cliente", "fornecedor"] });
    expect(buildPatchBody(original, same({ papeis: ["fornecedor"], aceita_fiado: true }), { canSetFiado: true, limite: "10.00" })).toEqual({ papeis: ["fornecedor"] });
  });
});
