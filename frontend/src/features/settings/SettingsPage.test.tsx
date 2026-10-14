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
