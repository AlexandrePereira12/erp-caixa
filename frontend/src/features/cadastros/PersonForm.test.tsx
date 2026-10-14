import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PEOPLE_PERMISSIONS, pessoa } from "./fixtures";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { page, renderApp, signIn } from "@/test/render";

function setup(permissoes: string[] = PEOPLE_PERMISSIONS, people = [pessoa()]) {
  const mock = mockApi();
  signIn({ permissoes });
  mock.on("GET /api/v1/pessoas", json(200, page(people)));
  return mock;
}

async function openCreate(permissoes?: string[]) {
  const mock = setup(permissoes);
  const utils = renderApp("/pessoas");
  await screen.findByText("Maria Souza");
  await utils.user.click(screen.getByRole("button", { name: "Nova pessoa" }));
  const dialog = await screen.findByRole("dialog", { name: "Nova pessoa" });
  return { mock, dialog, ...utils };
}

beforeEach(() => {
  session.reset("anonymous");
});

describe("Formulário de pessoa: validação", () => {
  it("valida nome, e-mail, CPF incompleto e ao menos um papel antes de enviar", async () => {
    const { mock, dialog, user } = await openCreate();

    await user.type(within(dialog).getByLabelText("E-mail"), "nao-e-email");
    await user.type(within(dialog).getByLabelText("CPF"), "5299");
    await user.click(within(dialog).getByRole("checkbox", { name: "Cliente" })); // desmarca o único papel
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    expect(await within(dialog).findByText("Informe o nome.")).toBeTruthy();
    expect(within(dialog).getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(within(dialog).getByText("O CPF deve ter 11 dígitos.")).toBeTruthy();
    expect(within(dialog).getByText("Selecione ao menos um papel.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/pessoas")).toHaveLength(0);
  });

  it("máscara do CPF acompanha a digitação e muda para CNPJ em pessoa jurídica", async () => {
    const { dialog, user } = await openCreate();
    const documento = within(dialog).getByLabelText("CPF") as HTMLInputElement;
    await user.type(documento, "52998224725");
    expect(documento.value).toBe("529.982.247-25");

    await user.click(within(dialog).getByRole("radio", { name: "Pessoa jurídica" }));
    const cnpj = within(dialog).getByLabelText("CNPJ") as HTMLInputElement;
    expect(cnpj.value).toBe("52.998.224/725");
    expect(within(dialog).getByLabelText("Nome fantasia")).toBeTruthy();
  });

  it("endereço exige logradouro, cidade e UF com 2 letras; CEP com 8 dígitos", async () => {
    const { mock, dialog, user } = await openCreate();
    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar endereço" }));
    await user.type(within(dialog).getByLabelText("CEP"), "0131");
    await user.type(within(dialog).getByLabelText(/^UF/), "S");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    expect(await within(dialog).findByText("Informe o logradouro.")).toBeTruthy();
    expect(within(dialog).getByText("Informe a cidade.")).toBeTruthy();
    expect(within(dialog).getByText("Informe a UF com 2 letras.")).toBeTruthy();
    expect(within(dialog).getByText("O CEP deve ter 8 dígitos.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/pessoas")).toHaveLength(0);
  });
});

describe("Formulário de pessoa: envio", () => {
  it("cria com documento só dígitos, vazios como null, endereço normalizado e fiado com a permissão", async () => {
    const { mock, dialog, user } = await openCreate();
    mock.on("POST /api/v1/pessoas", json(201, pessoa({ id: 9, nome: "Carlos Lima" })));

    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.type(within(dialog).getByLabelText("CPF"), "52998224725");
    await user.type(within(dialog).getByLabelText("Telefone"), "(11) 97777-6666");
    await user.click(within(dialog).getByRole("checkbox", { name: "Aceita fiado" }));
    const limite = within(dialog).getByLabelText(/^Limite de fiado/);
    await user.clear(limite);
    await user.type(limite, "1.500,50");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar endereço" }));
    await user.type(within(dialog).getByLabelText("CEP"), "01310100");
    await user.type(within(dialog).getByLabelText(/^Logradouro/), "Av. Paulista");
    await user.type(within(dialog).getByLabelText("Número"), "1000");
    await user.type(within(dialog).getByLabelText(/^Cidade/), "São Paulo");
    await user.type(within(dialog).getByLabelText(/^UF/), "sp");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/pessoas")[0]!.body).toEqual({
      tipo: "F",
      nome: "Carlos Lima",
      nome_fantasia: null,
      documento: "52998224725",
      telefone: "(11) 97777-6666",
      whatsapp: null,
      email: null,
      observacoes: null,
      ativo: true,
      papeis: ["cliente"],
      enderecos: [{ rotulo: null, cep: "01310100", logradouro: "Av. Paulista", numero: "1000", complemento: null, bairro: null, cidade: "São Paulo", uf: "SP", principal: true }],
      cliente: { aceita_fiado: true, limite_fiado: "1500.50" },
    });
    expect(await screen.findByText("Pessoa cadastrada.")).toBeTruthy();
  });

  it("erro do backend (documento_em_uso) aparece no campo e o diálogo continua aberto", async () => {
    const { mock, dialog, user } = await openCreate();
    mock.on("POST /api/v1/pessoas", apiError(409, "documento_em_uso", "Já existe uma pessoa com este CPF/CNPJ."));

    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.type(within(dialog).getByLabelText("CPF"), "52998224725");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));

    expect(await within(dialog).findByText("Já existe uma pessoa com este CPF/CNPJ.")).toBeTruthy();
    expect(within(dialog).getByLabelText("CPF").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Nova pessoa" })).toBeTruthy();
  });

  it("documento_invalido (dígitos verificadores) também vai para o campo", async () => {
    const { mock, dialog, user } = await openCreate();
    mock.on("POST /api/v1/pessoas", apiError(422, "documento_invalido", "CPF inválido."));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.type(within(dialog).getByLabelText("CPF"), "11111111111");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("CPF inválido.")).toBeTruthy();
  });

  it("erros gerais (cliente_sem_papel) viram alerta no topo do formulário", async () => {
    const { mock, dialog, user } = await openCreate();
    mock.on("POST /api/v1/pessoas", apiError(422, "cliente_sem_papel", "Dados de cliente exigem o papel 'cliente'."));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Dados de cliente exigem o papel 'cliente'.");
  });
});

describe("Formulário de pessoa: bloco de fiado", () => {
  it("sem pessoas.definir_fiado o bloco fica desabilitado, explica o motivo e o envio não leva `cliente`", async () => {
    const { mock, dialog, user } = await openCreate(["pessoas.listar", "pessoas.criar"]);
    mock.on("POST /api/v1/pessoas", json(201, pessoa({ id: 9 })));

    expect((within(dialog).getByRole("checkbox", { name: "Aceita fiado" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/^Limite de fiado/) as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText(/permissão “Definir fiado”/)).toBeTruthy();
    expect(within(dialog).getByText("0 = sem limite")).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/pessoas")).toHaveLength(1));
    expect(mock.callsTo("POST /api/v1/pessoas")[0]!.body).not.toHaveProperty("cliente");
  });

  it("o bloco só aparece com o papel cliente", async () => {
    const { dialog, user } = await openCreate();
    expect(within(dialog).getByRole("checkbox", { name: "Aceita fiado" })).toBeTruthy();
    await user.click(within(dialog).getByRole("checkbox", { name: "Cliente" }));
    expect(within(dialog).queryByRole("checkbox", { name: "Aceita fiado" })).toBeNull();
  });

  it("limite de fiado inválido é recusado antes de enviar", async () => {
    const { mock, dialog, user } = await openCreate();
    await user.type(within(dialog).getByLabelText(/^Nome/), "Carlos Lima");
    const limite = within(dialog).getByLabelText(/^Limite de fiado/);
    await user.clear(limite);
    await user.type(limite, "12,505");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Use no máximo 2 casas decimais.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/pessoas")).toHaveLength(0);
  });
});

describe("Formulário de pessoa: edição e saldo em aberto", () => {
  const SALDO = { pessoa_id: 1, saldo_aberto: "125.90", titulos_abertos: 2, aceita_fiado: true, limite_fiado: "500.00", limite_disponivel: "374.10" as string | null };

  async function openEdit(permissoes: string[], person = pessoa(), saldo = SALDO) {
    const mock = setup(permissoes, [person]);
    mock.on("GET /api/v1/pessoas/1/saldo-aberto", json(200, saldo));
    const utils = renderApp("/pessoas");
    await screen.findByText(person.nome);
    await utils.user.click(screen.getByRole("button", { name: `Editar ${person.nome}` }));
    const dialog = await screen.findByRole("dialog", { name: "Editar pessoa" });
    return { mock, dialog, ...utils };
  }

  it("carrega os dados e envia só o que mudou", async () => {
    const { mock, dialog, user } = await openEdit(PEOPLE_PERMISSIONS);
    mock.on("PATCH /api/v1/pessoas/1", json(200, pessoa({ telefone: "(11) 91111-2222" })));
    expect((within(dialog).getByLabelText(/^Nome/) as HTMLInputElement).value).toBe("Maria Souza");
    expect((within(dialog).getByLabelText("CPF") as HTMLInputElement).value).toBe("529.982.247-25");

    const telefone = within(dialog).getByLabelText("Telefone");
    await user.clear(telefone);
    await user.type(telefone, "(11) 91111-2222");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("PATCH /api/v1/pessoas/1")[0]!.body).toEqual({ telefone: "(11) 91111-2222" });
  });

  it("sem alterações, salvar só fecha (sem requisição)", async () => {
    const { mock, dialog, user } = await openEdit(PEOPLE_PERMISSIONS);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("PATCH /api/v1/pessoas/1")).toHaveLength(0);
  });

  it("mostra o saldo em aberto só com financeiro.listar", async () => {
    const withBalance = await openEdit([...PEOPLE_PERMISSIONS, "financeiro.listar"]);
    expect(await within(withBalance.dialog).findByText("R$ 125,90")).toBeTruthy();
    expect(within(withBalance.dialog).getByText("R$ 374,10")).toBeTruthy();
    expect(withBalance.mock.callsTo("GET /api/v1/pessoas/1/saldo-aberto")).toHaveLength(1);
  });

  it("sem financeiro.listar o saldo nem é consultado", async () => {
    const { mock, dialog } = await openEdit(PEOPLE_PERMISSIONS);
    expect(within(dialog).queryByText("Saldo em aberto")).toBeNull();
    expect(mock.callsTo("GET /api/v1/pessoas/1/saldo-aberto")).toHaveLength(0);
  });

  it("limite disponível nulo significa sem limite", async () => {
    const { dialog } = await openEdit([...PEOPLE_PERMISSIONS, "financeiro.listar"], pessoa(), { ...SALDO, saldo_aberto: "0.00", titulos_abertos: 0, limite_fiado: "0.00", limite_disponivel: null });
    expect(await within(dialog).findByText("Sem limite")).toBeTruthy();
  });
});

describe("Cadastro rápido", () => {
  async function openQuick() {
    const mock = setup(["pessoas.listar", "pessoas.cadastro_rapido"]);
    const utils = renderApp("/pessoas");
    await screen.findByText("Maria Souza");
    await utils.user.click(screen.getByRole("button", { name: "Cadastro rápido" }));
    const dialog = await screen.findByRole("dialog", { name: "Cadastro rápido" });
    return { mock, dialog, ...utils };
  }

  it("envia nome e telefone para /pessoas/rapido e avisa", async () => {
    const { mock, dialog, user } = await openQuick();
    mock.on("POST /api/v1/pessoas/rapido", json(201, pessoa({ id: 8, nome: "Cliente Balcão" })));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Cliente Balcão");
    await user.type(within(dialog).getByLabelText(/^Telefone/), "(11) 95555-4444");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar cliente" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mock.callsTo("POST /api/v1/pessoas/rapido")[0]!.body).toEqual({ nome: "Cliente Balcão", telefone: "(11) 95555-4444" });
    expect(await screen.findByText("Cliente Cliente Balcão cadastrado.")).toBeTruthy();
  });

  it("valida nome e telefone (mínimo de 8 dígitos) sem chamar a API", async () => {
    const { mock, dialog, user } = await openQuick();
    await user.type(within(dialog).getByLabelText(/^Telefone/), "123");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar cliente" }));
    expect(await within(dialog).findByText("Informe o nome.")).toBeTruthy();
    expect(within(dialog).getByText("Informe um telefone válido, com DDD.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/pessoas/rapido")).toHaveLength(0);
  });

  it("telefone_invalido do backend aparece no campo", async () => {
    const { mock, dialog, user } = await openQuick();
    mock.on("POST /api/v1/pessoas/rapido", apiError(422, "telefone_invalido", "Informe um telefone válido."));
    await user.type(within(dialog).getByLabelText(/^Nome/), "Cliente Balcão");
    await user.type(within(dialog).getByLabelText(/^Telefone/), "12345678");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar cliente" }));
    expect(await within(dialog).findByText("Informe um telefone válido.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Cadastro rápido" })).toBeTruthy();
  });
});
