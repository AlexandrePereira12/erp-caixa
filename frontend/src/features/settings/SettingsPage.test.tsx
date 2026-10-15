import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json, mockApi } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

const CFG = { nome_exibicao: "Zé", timezone: "America/Sao_Paulo", taxa_servico_pct: "10.00", cancelamento_janela_min: 15 };

beforeEach(() => {
  session.reset("anonymous");
});

describe("SettingsPage", () => {
  it("carrega nome de exibição e fuso horário", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Restaurante do Zé" }));
    renderApp("/configuracoes");

    const nome = (await screen.findByLabelText(/Nome de exibição/)) as HTMLInputElement;
    expect(nome.value).toBe("Restaurante do Zé");
    expect((screen.getByLabelText(/Fuso horário/) as HTMLSelectElement).value).toBe("America/Sao_Paulo");
    expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("salva só o que mudou e confirma", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Restaurante do Zé" }));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé Restaurante" }));
    const { user } = renderApp("/configuracoes");

    const nome = await screen.findByLabelText(/Nome de exibição/);
    await user.clear(nome);
    await user.type(nome, "Zé Restaurante");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ nome_exibicao: "Zé Restaurante" });
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
  });

  it("altera o fuso horário", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé" }));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé", timezone: "America/Manaus" }));
    const { user } = renderApp("/configuracoes");

    await user.selectOptions(await screen.findByLabelText(/Fuso horário/), "America/Manaus");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ timezone: "America/Manaus" }));
  });

  it("erro de validação do backend aparece no campo", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé" }));
    mock.on("PATCH /api/v1/configuracoes", apiError(422, "validacao", "Dados inválidos.", [{ campo: "body.timezone", mensagem: "Fuso horário desconhecido." }]));
    const { user } = renderApp("/configuracoes");

    const nome = await screen.findByLabelText(/Nome de exibição/);
    await user.type(nome, " 2");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Fuso horário desconhecido.")).toBeTruthy();
    expect(screen.getByLabelText(/Fuso horário/).getAttribute("aria-invalid")).toBe("true");
  });

  it("sem configuracoes.editar a tela é somente leitura", async () => {
    const mock = mockApi();
    signIn({ permissoes: ["configuracoes.ver"] });
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé" }));
    renderApp("/configuracoes");

    expect(((await screen.findByLabelText(/Nome de exibição/)) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(screen.getByText(/não tem permissão para alterá-las/)).toBeTruthy();
  });

  it("falha ao carregar mostra erro com nova tentativa", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", apiError(500, "erro_interno", "Falha ao ler configurações."));
    renderApp("/configuracoes");
    expect((await screen.findByRole("alert")).textContent).toContain("Falha ao ler configurações.");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("mostra taxa de serviço e janela de cancelamento vindas da API", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, CFG));
    renderApp("/configuracoes");
    expect(((await screen.findByLabelText(/Taxa de serviço/)) as HTMLInputElement).value).toBe("10,00");
    expect((screen.getByLabelText(/Janela para cancelar/) as HTMLInputElement).value).toBe("15");
  });

  it("envia taxa como string decimal e janela como inteiro, só o que mudou", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, CFG));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...CFG, taxa_servico_pct: "12.50", cancelamento_janela_min: 30 }));
    const { user } = renderApp("/configuracoes");

    const taxa = await screen.findByLabelText(/Taxa de serviço/);
    await user.clear(taxa);
    await user.type(taxa, "12,5");
    const janela = screen.getByLabelText(/Janela para cancelar/);
    await user.clear(janela);
    await user.type(janela, "30");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ taxa_servico_pct: "12.50", cancelamento_janela_min: 30 });
    expect(await screen.findByText("Configurações salvas.")).toBeTruthy();
  });

  it("valida taxa (0 a 30) e janela (0 a 240) antes de enviar", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, CFG));
    const { user } = renderApp("/configuracoes");

    const taxa = await screen.findByLabelText(/Taxa de serviço/);
    await user.clear(taxa);
    await user.type(taxa, "31");
    const janela = screen.getByLabelText(/Janela para cancelar/);
    await user.clear(janela);
    await user.type(janela, "241");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("O percentual deve ficar entre 0 e 30.")).toBeTruthy();
    expect(screen.getByText("Informe de 0 a 240 minutos.")).toBeTruthy();
    expect(mock.callsTo("PATCH /api/v1/configuracoes")).toHaveLength(0);
  });
});

const PIX = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
const CFG_PIX = { ...CFG, nome_exibicao: "Zé", pix_copia_e_cola: PIX, pix_recebedor: "Fulano de Tal" };

describe("SettingsPage: Pix copia e cola", () => {
  it("sem Pix cadastrado não mostra QR Code", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, pix_copia_e_cola: null, pix_recebedor: null }));
    renderApp("/configuracoes");

    expect(((await screen.findByLabelText("Pix copia e cola")) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("img", { name: "QR Code do Pix da empresa" })).toBeNull();
  });

  it("mostra o QR Code, o recebedor e o código salvo, inclusive para quem só pode ver", async () => {
    const mock = mockApi();
    signIn({ permissoes: ["configuracoes.ver"] });
    mock.on("GET /api/v1/configuracoes", json(200, CFG_PIX));
    renderApp("/configuracoes");

    const campo = (await screen.findByLabelText("Pix copia e cola")) as HTMLTextAreaElement;
    expect(campo.value).toBe(PIX);
    expect(campo.disabled).toBe(true);
    const qr = screen.getByRole("img", { name: "QR Code do Pix da empresa" });
    expect(qr.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(100);
    expect(screen.getByText("Fulano de Tal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar o Pix copia e cola" })).toBeTruthy();
  });

  it("envia o Pix colado e passa a mostrar o QR Code", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé", pix_copia_e_cola: null, pix_recebedor: null }));
    mock.on("PATCH /api/v1/configuracoes", json(200, CFG_PIX));
    const { user } = renderApp("/configuracoes");

    await user.click(await screen.findByLabelText("Pix copia e cola"));
    await user.paste(`  ${PIX}\n`);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ pix_copia_e_cola: PIX });
    expect(await screen.findByRole("img", { name: "QR Code do Pix da empresa" })).toBeTruthy();
  });

  it("esvaziar o campo envia null e o QR Code some", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, CFG_PIX));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...CFG_PIX, pix_copia_e_cola: null, pix_recebedor: null }));
    const { user } = renderApp("/configuracoes");

    await user.clear(await screen.findByLabelText("Pix copia e cola"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ pix_copia_e_cola: null }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "QR Code do Pix da empresa" })).toBeNull());
  });

  it("código recusado pelo backend aparece no campo e o QR Code não muda", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...CFG, nome_exibicao: "Zé", pix_copia_e_cola: null, pix_recebedor: null }));
    const mensagem = "O código está incompleto ou foi alterado (o dígito verificador não confere).";
    mock.on("PATCH /api/v1/configuracoes", apiError(422, "validacao", "Dados inválidos.", [{ campo: "body.pix_copia_e_cola", mensagem }]));
    const { user } = renderApp("/configuracoes");

    await user.click(await screen.findByLabelText("Pix copia e cola"));
    await user.paste("00020126580014br.gov.bcb.pix6304ABCD");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(mensagem)).toBeTruthy();
    expect(screen.getByLabelText("Pix copia e cola").getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("img", { name: "QR Code do Pix da empresa" })).toBeNull();
  });
});

describe("SettingsPage: dados da empresa", () => {
  const VAZIO = { ...CFG, nome_exibicao: "Zé", cnpj: null, telefone: null, endereco: null, email_contato: null, pix_copia_e_cola: null, pix_recebedor: null };

  it("mostra os dados salvos com máscara", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...VAZIO, cnpj: "11222333000181", telefone: "85999994444", endereco: "Rua A, 10", email_contato: "a@b.com" }));
    renderApp("/configuracoes");

    expect(((await screen.findByLabelText("CNPJ")) as HTMLInputElement).value).toBe("11.222.333/0001-81");
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("(85) 99999-4444");
    expect((screen.getByLabelText("Endereço") as HTMLInputElement).value).toBe("Rua A, 10");
    expect((screen.getByLabelText("E-mail de contato") as HTMLInputElement).value).toBe("a@b.com");
  });

  it("digita com máscara e envia só os dígitos; só o que mudou", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, VAZIO));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...VAZIO, cnpj: "11222333000181", telefone: "8533334444", endereco: "Rua das Oliveiras, 1234", email_contato: "contato@zerestaurante.com.br" }));
    const { user } = renderApp("/configuracoes");

    await user.type(await screen.findByLabelText("CNPJ"), "11222333000181");
    expect((screen.getByLabelText("CNPJ") as HTMLInputElement).value).toBe("11.222.333/0001-81");
    await user.type(screen.getByLabelText("Telefone"), "8533334444");
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("(85) 3333-4444");
    await user.type(screen.getByLabelText("Endereço"), "Rua das Oliveiras, 1234");
    await user.type(screen.getByLabelText("E-mail de contato"), "contato@zerestaurante.com.br");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")).toHaveLength(1));
    expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ cnpj: "11222333000181", telefone: "8533334444", endereco: "Rua das Oliveiras, 1234", email_contato: "contato@zerestaurante.com.br" });
  });

  it("a máscara não conta como mudança e esvaziar o campo envia null", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, { ...VAZIO, cnpj: "11222333000181", telefone: "8533334444" }));
    mock.on("PATCH /api/v1/configuracoes", json(200, { ...VAZIO, cnpj: "11222333000181", telefone: null }));
    const { user } = renderApp("/configuracoes");

    await user.clear(await screen.findByLabelText("Telefone"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/configuracoes")[0]!.body).toEqual({ telefone: null }));
  });

  it("CNPJ recusado pelo backend aparece no campo", async () => {
    const mock = mockApi();
    signIn();
    mock.on("GET /api/v1/configuracoes", json(200, VAZIO));
    mock.on("PATCH /api/v1/configuracoes", apiError(422, "validacao", "Dados inválidos.", [{ campo: "body.cnpj", mensagem: "CNPJ inválido: confira os 14 dígitos." }]));
    const { user } = renderApp("/configuracoes");

    await user.type(await screen.findByLabelText("CNPJ"), "11222333000182");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("CNPJ inválido: confira os 14 dígitos.")).toBeTruthy();
    expect(screen.getByLabelText("CNPJ").getAttribute("aria-invalid")).toBe("true");
  });
});
