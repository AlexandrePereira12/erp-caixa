import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json } from "@/test/mockFetch";
import { pageOf, renderContasPagar, resumo, setup, titulo } from "./testSupport";

const LISTA = "GET /api/v1/contas-pagar";

const CONTAS = [
  titulo({ id: 8, descricao: "Aluguel do salão", documento: "Boleto 55", vencimento: "2026-10-10", situacao: "vencido", dias_para_vencer: -3, valor_original: "2500.00", saldo: "2500.00" }),
  titulo({ id: 9, descricao: "Conta de energia", fornecedor: null, categoria: null, documento: null, vencimento: "2026-10-13", dias_para_vencer: 0 }),
  titulo({ id: 10, descricao: "Gás de cozinha", vencimento: "2026-10-25", dias_para_vencer: 12, valor_original: "180.00", saldo: "180.00" }),
  titulo({ id: 11, descricao: "Padaria", status: "pago", situacao: "pago", valor_pago: "50.00", saldo: "0.00", valor_original: "50.00", dias_para_vencer: null, pago_em: "2026-10-09", vencimento: "2026-10-09" }),
  titulo({ id: 12, descricao: "Reforma cancelada", status: "cancelado", situacao: "cancelado", dias_para_vencer: null, valor_original: "700.00", saldo: "700.00", cancelado_motivo: "Lançada em duplicidade" }),
];

beforeEach(() => {
  session.reset("anonymous");
});

describe("ContasPagarPage", () => {
  it("mostra o resumo com a quantidade de contas de cada cartão", async () => {
    setup();
    renderContasPagar("/contas-pagar");

    const secao = await screen.findByRole("region", { name: "Resumo das contas a pagar" });
    const cartao = (rotulo: string) => within(secao).getByText(rotulo).closest("div")!;
    expect(within(cartao("Em aberto")).getByText("R$ 1.250,00")).toBeTruthy();
    expect(within(cartao("Em aberto")).getByText("7 contas")).toBeTruthy();
    expect(within(cartao("Vencido")).getByText("R$ 300,50")).toBeTruthy();
    expect(within(cartao("Vencido")).getByText("2 contas em atraso")).toBeTruthy();
    expect(within(cartao("A vencer em 7 dias")).getByText("R$ 480,00")).toBeTruthy();
    expect(within(cartao("A vencer em 7 dias")).getByText("3 contas")).toBeTruthy();
    expect(within(cartao("Pago no mês")).getByText("R$ 900,00")).toBeTruthy();
    expect(within(cartao("Pago no mês")).getByText(/4 pagamentos/)).toBeTruthy();
    expect(within(secao).getByText("Posição em 13/10/2026.")).toBeTruthy();
  });

  it("sem conta vencida o cartão de vencido não fala em atraso", async () => {
    setup().on("GET /api/v1/contas-pagar/resumo", json(200, resumo({ vencido: "0.00", vencido_qtd: 0, em_aberto_qtd: 1 })));
    renderContasPagar("/contas-pagar");
    expect(await screen.findByText("Nenhuma conta em atraso")).toBeTruthy();
    expect(screen.getByText("1 conta")).toBeTruthy();
  });

  it("lista as contas com vencimento, saldo, fornecedor, categoria e situação (texto, não só cor)", async () => {
    const mock = setup();
    mock.on(LISTA, json(200, pageOf(CONTAS)));
    renderContasPagar("/contas-pagar");

    const tabela = await screen.findByRole("table", { name: "Contas a pagar" });
    expect(screen.getByRole("link", { name: "Aluguel do salão" }).getAttribute("href")).toBe("/contas-pagar/8");
    expect(within(tabela).getByText("Documento Boleto 55")).toBeTruthy();
    expect(within(tabela).getByText("10/10/2026")).toBeTruthy();
    expect(within(tabela).getByText("venceu há 3 dias")).toBeTruthy();
    expect(within(tabela).getByText("vence hoje")).toBeTruthy();
    expect(within(tabela).getByText("vence em 12 dias")).toBeTruthy();
    expect(within(tabela).getByText("paga em 09/10/2026")).toBeTruthy();
    expect(within(tabela).getAllByText("Distribuidora Sol").length).toBeGreaterThan(0);
    expect(within(tabela).getAllByText("Insumos").length).toBeGreaterThan(0);
    expect(within(tabela).getAllByText("R$ 2.500,00")).toHaveLength(2); // valor e saldo
    expect(within(tabela).getAllByText("Vencida")).toHaveLength(1);
    expect(within(tabela).getAllByText("A vencer")).toHaveLength(2);
    expect(within(tabela).getByText("Paga")).toBeTruthy();
    expect(within(tabela).getByText("Cancelada")).toBeTruthy();

    // O padrão da tela é "Em aberto": a primeira consulta pede só o que ainda precisa de ação.
    const primeira = mock.callsTo(LISTA)[0]!.query;
    expect(primeira.get("situacao")).toBe("aberto");
    expect(primeira.get("limite")).toBe("20");
    expect(primeira.get("deslocamento")).toBe("0");
  });

  it("conta cancelada não mostra saldo a pagar", async () => {
    const mock = setup();
    mock.on(LISTA, json(200, pageOf([CONTAS[4]])));
    renderContasPagar("/contas-pagar");
    const tabela = await screen.findByRole("table", { name: "Contas a pagar" });
    expect(within(tabela).queryAllByText("R$ 700,00")).toHaveLength(1); // só o valor original
  });

  it("o filtro de situação é um grupo de opções e manda o parâmetro certo", async () => {
    const mock = setup();
    const { user } = renderContasPagar("/contas-pagar");
    await screen.findByRole("link", { name: "Compra de insumos" });

    const grupo = screen.getByRole("group", { name: "Situação" });
    expect(within(grupo).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Em aberto", "A vencer", "Vencidas", "Pagas", "Canceladas", "Todas"]);
    expect((within(grupo).getByRole("radio", { name: "Em aberto" }) as HTMLInputElement).checked).toBe(true);

    for (const [rotulo, valor] of [
      ["Vencidas", "vencido"],
      ["A vencer", "a_vencer"],
      ["Pagas", "pago"],
      ["Canceladas", "cancelado"],
    ] as const) {
      await user.click(within(grupo).getByRole("radio", { name: rotulo }));
      await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("situacao")).toBe(valor));
      expect((within(grupo).getByRole("radio", { name: rotulo }) as HTMLInputElement).checked).toBe(true);
    }
    // "Todas" não manda filtro nenhum à API (o padrão da API é todas)...
    await user.click(within(grupo).getByRole("radio", { name: "Todas" }));
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("situacao")).toBeNull());
    expect(mock.callsTo(LISTA).every((c) => c.query.get("situacao") !== "todos")).toBe(true);
    // ...e "Em aberto" é o padrão da tela (a consulta já estava no cache, então só a escolha muda).
    await user.click(within(grupo).getByRole("radio", { name: "Em aberto" }));
    await waitFor(() => expect((within(grupo).getByRole("radio", { name: "Em aberto" }) as HTMLInputElement).checked).toBe(true));
  });

  it("abre já filtrada pela URL e volta ao padrão com 'Limpar filtros'", async () => {
    const mock = setup();
    const { user } = renderContasPagar("/contas-pagar?situacao=vencido&q=luz");
    await screen.findByRole("link", { name: "Compra de insumos" });
    const query = mock.callsTo(LISTA)[0]!.query;
    expect(query.get("situacao")).toBe("vencido");
    expect(query.get("q")).toBe("luz");
    expect((screen.getByRole("radio", { name: "Vencidas" }) as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("situacao")).toBe("aberto"));
    expect(mock.callsTo(LISTA).at(-1)!.query.get("q")).toBeNull();
    expect((screen.getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
  });

  it("busca por texto, categoria e fornecedor mandam q, categoria_id e pessoa_id", async () => {
    const mock = setup();
    const { user } = renderContasPagar("/contas-pagar");
    await screen.findByRole("link", { name: "Compra de insumos" });

    await user.type(screen.getByRole("searchbox", { name: "Buscar" }), "aluguel");
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("q")).toBe("aluguel"));

    await screen.findByRole("option", { name: "Aluguel" });
    // O filtro mostra todas as categorias de despesa, inclusive a inativa (contas antigas ainda a usam).
    expect(screen.getByRole("option", { name: "Obras (inativa)" })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Categoria"), "4");
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("categoria_id")).toBe("4"));
    expect(mock.callsTo("GET /api/v1/categorias-financeiras")[0]!.query.get("tipo")).toBe("despesa");

    await user.type(screen.getByRole("combobox", { name: "Fornecedor" }), "Sol");
    await user.click(await screen.findByRole("option", { name: /Distribuidora Sol/ }));
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("pessoa_id")).toBe("30"));
    const busca = mock.callsTo("GET /api/v1/pessoas")[0]!.query;
    expect(busca.get("papel")).toBe("fornecedor");
    expect(busca.get("q")).toBe("Sol");
    // Os três filtros convivem na mesma consulta.
    const ultima = mock.callsTo(LISTA).at(-1)!.query;
    expect([ultima.get("q"), ultima.get("categoria_id"), ultima.get("pessoa_id")]).toEqual(["aluguel", "4", "30"]);
    expect(screen.getByRole("button", { name: "Remover fornecedor Distribuidora Sol" })).toBeTruthy();
  });

  it("vencimento de/até vão como datas YYYY-MM-DD e a data inicial depois da final não consulta o backend", async () => {
    const mock = setup();
    const { user } = renderContasPagar("/contas-pagar");
    await screen.findByRole("link", { name: "Compra de insumos" });

    await user.type(screen.getByLabelText("Vencimento de"), "2026-10-01");
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("vencimento_de")).toBe("2026-10-01"));
    await user.type(screen.getByLabelText("Vencimento até"), "2026-10-31");
    await waitFor(() => expect(mock.callsTo(LISTA).at(-1)!.query.get("vencimento_ate")).toBe("2026-10-31"));

    const antes = mock.callsTo(LISTA).length;
    await user.clear(screen.getByLabelText("Vencimento até"));
    await user.type(screen.getByLabelText("Vencimento até"), "2026-09-15");
    expect(await screen.findByText("A data final não pode ser anterior à inicial.")).toBeTruthy();
    expect(screen.getByText("Período inválido")).toBeTruthy();
    expect(mock.callsTo(LISTA).slice(antes).some((c) => c.query.get("vencimento_ate") === "2026-09-15")).toBe(false);
  });

  it("pagina de 20 em 20 mandando o deslocamento", async () => {
    const mock = setup();
    mock.on(LISTA, (call) => json(200, pageOf([titulo({ id: 100 + Number(call.query.get("deslocamento") ?? "0") })], { total: 45, deslocamento: Number(call.query.get("deslocamento") ?? "0") })));
    const { user } = renderContasPagar("/contas-pagar");
    await screen.findByText("Mostrando 1–20 de 45");

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Mostrando 21–40 de 45");
    expect(mock.callsTo(LISTA).at(-1)!.query.get("deslocamento")).toBe("20");
    expect(mock.callsTo(LISTA).at(-1)!.query.get("limite")).toBe("20");

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByText("Mostrando 1–20 de 45"); // página 1 vem do cache: sem nova consulta
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("estados de lista vazia, com e sem filtro", async () => {
    const mock = setup();
    mock.on(LISTA, json(200, pageOf([])));
    const { user } = renderContasPagar("/contas-pagar");
    expect(await screen.findByText("Nenhuma conta a pagar")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Pagas" }));
    expect(await screen.findByText("Nenhuma conta encontrada")).toBeTruthy();
  });

  it("erro na lista mostra o aviso e 'Tentar novamente' consulta de novo", async () => {
    const mock = setup();
    let chamadas = 0;
    mock.on(LISTA, () => {
      chamadas += 1;
      return chamadas === 1 ? apiError(500, "erro_interno", "Falha ao listar.") : json(200, pageOf([titulo()]));
    });
    const { user } = renderContasPagar("/contas-pagar");

    expect(await screen.findByText("Não foi possível carregar")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("link", { name: "Compra de insumos" });
    expect(chamadas).toBe(2);
  });

  it("erro no resumo avisa no lugar dos cartões e não derruba a lista", async () => {
    const mock = setup();
    mock.on("GET /api/v1/contas-pagar/resumo", apiError(500, "erro_interno", "Falha no resumo."));
    renderContasPagar("/contas-pagar");

    expect(await screen.findByText("Não foi possível carregar o resumo")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Compra de insumos" })).toBeTruthy();
  });

  it("'Nova conta' só existe com contas_pagar.criar e abre o cadastro", async () => {
    setup(["contas_pagar.listar"]);
    const sem = renderContasPagar("/contas-pagar");
    await sem.findByRole("link", { name: "Compra de insumos" });
    expect(screen.queryByRole("button", { name: "Nova conta" })).toBeNull();
    sem.unmount();

    setup(["contas_pagar.listar", "contas_pagar.criar"]);
    const { user } = renderContasPagar("/contas-pagar");
    await user.click(await screen.findByRole("button", { name: "Nova conta" }));
    expect(await screen.findByRole("dialog", { name: "Nova conta a pagar" })).toBeTruthy();
  });

  it("sem financeiro.listar e pessoas.listar os filtros de categoria e fornecedor não aparecem nem consultam a API", async () => {
    const mock = setup(["contas_pagar.listar"]);
    renderContasPagar("/contas-pagar");
    await screen.findByRole("link", { name: "Compra de insumos" });
    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Fornecedor" })).toBeNull();
    expect(mock.callsTo("GET /api/v1/categorias-financeiras")).toHaveLength(0);
    expect(mock.callsTo("GET /api/v1/pessoas")).toHaveLength(0);
  });

  it("sem contas_pagar.listar a rota mostra acesso negado e não chama a API", async () => {
    const mock = setup(["contas_pagar.criar", "financeiro.listar"]);
    renderContasPagar("/contas-pagar");
    expect(await screen.findByText("Acesso negado")).toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});
