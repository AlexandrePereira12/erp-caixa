import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { INVENTORY_PERMISSIONS, inventario, item, ITEMS } from "./fixtures";
import { KG, UN } from "@/features/catalogo/fixtures";
import { session } from "@/lib/auth/session";
import { apiError, deferred, json, mockApi, type MockHandler } from "@/test/mockFetch";
import { renderApp, signIn } from "@/test/render";

/** "18.5" -> "18.500": o backend devolve sempre 3 casas. */
const fmt = (value: string) => {
  const [int, frac = ""] = value.split(".");
  return `${int}.${frac.padEnd(3, "0")}`;
};

/** Servidor falso com estado: cada PUT aplica a contagem e devolve o inventário inteiro, como o backend. */
function setup(permissoes: string[] = [...INVENTORY_PERMISSIONS, "catalogo.listar"], initial = inventario()) {
  const mock = mockApi();
  signIn({ permissoes });
  const state = { inv: initial };
  mock.on("GET /api/v1/unidades", json(200, [UN, KG]));
  mock.on("GET /api/v1/inventarios/1", () => json(200, state.inv));
  const countHandler = (productId: number): MockHandler => (call) => {
    const quantidade = (call.body as { quantidade_contada: string }).quantidade_contada;
    const itens = state.inv.itens.map((i) => (i.produto_id === productId ? { ...i, quantidade_contada: fmt(quantidade) } : i));
    state.inv = inventario({ ...state.inv, itens, itens_contados: itens.filter((i) => i.quantidade_contada !== null).length });
    return json(200, state.inv);
  };
  for (const productId of [7, 8, 9]) mock.on(`PUT /api/v1/inventarios/1/itens/${productId}`, countHandler(productId));
  mock.on("POST /api/v1/inventarios/1/fechar", () => {
    const itens = state.inv.itens.map((i) =>
      i.quantidade_contada === null ? i : { ...i, diferenca: i.produto_id === 7 ? "-1.500" : "0.000" },
    );
    const ajustados = itens.filter((i) => i.diferenca !== null && i.diferenca !== "0.000").length;
    state.inv = inventario({ ...state.inv, status: "fechado", fechado_em: "2026-10-13T20:00:00+00:00", itens });
    return json(200, { ...state.inv, ajustados, nao_contados: itens.filter((i) => i.quantidade_contada === null).length });
  });
  mock.on("POST /api/v1/inventarios/1/cancelar", () => {
    state.inv = inventario({ ...state.inv, status: "cancelado" });
    return json(200, state.inv);
  });
  return { mock, state };
}

async function open(permissoes?: string[], initial?: ReturnType<typeof inventario>) {
  const server = setup(permissoes, initial);
  const utils = renderApp("/inventarios/1");
  await screen.findByRole("table", { name: /Contagem de produtos|Resultado do inventário/ });
  return { ...server, ...utils };
}

const input = (name: string) => screen.getByLabelText(`Contagem de ${name}`) as HTMLInputElement;
const FARINHA = "Farinha de Trigo (KG)";
const COCA = "Coca-Cola Lata (UN)";

beforeEach(() => {
  session.reset("anonymous");
});

describe("InventoryDetailPage: contagem", () => {
  it("salva ao sair do campo (PUT com string decimal) e atualiza o progresso com o que a API devolveu", async () => {
    const { mock, user } = await open();
    expect(screen.getByText("0 de 3 contados")).toBeTruthy();

    await user.type(input(FARINHA), "18,5");
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(0); // ainda não saiu do campo
    await user.tab();

    await waitFor(() => expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")[0]!.body).toEqual({ quantidade_contada: "18.5" });
    expect(await screen.findByText("1 de 3 contados")).toBeTruthy();
    expect(input(FARINHA).value).toBe("18,5");
    const progress = screen.getAllByRole("progressbar", { name: "Progresso da contagem" })[0] as HTMLProgressElement;
    expect([progress.value, progress.max]).toEqual([1, 3]);
    expect(within(screen.getByRole("table")).getAllByText("Contado")).toHaveLength(1);
  });

  it("Enter salva e passa para o próximo produto; o blur seguinte não repete a requisição", async () => {
    const { mock, user } = await open();
    await user.type(input(FARINHA), "18,5{Enter}");
    expect(document.activeElement).toBe(input(COCA));
    await user.type(input(COCA), "24");
    await user.tab(); // sai do campo da Coca-Cola: salva a Coca

    await waitFor(() => expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(1); // Enter + blur = uma só requisição
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")[0]!.body).toEqual({ quantidade_contada: "24" });
  });

  it("Enter seguido de blur com o PUT em voo mantém o texto e o 'Salvando…'; se o servidor recusar, o valor digitado continua no campo", async () => {
    const { mock, user } = await open();
    const gate = deferred<Response>();
    mock.on("PUT /api/v1/inventarios/1/itens/7", async () => {
      await gate.promise;
      return apiError(422, "quantidade_fracionada", "A unidade KG aceita no máximo 3 casa(s) decimal(is).");
    });

    await user.type(input(FARINHA), "18,5{Enter}"); // salva e move o foco: o blur chama o salvamento de novo
    expect(document.activeElement).toBe(input(COCA));
    expect(input(FARINHA).value).toBe("18,5");
    expect(screen.getByText("Salvando…")).toBeTruthy();
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(1);

    gate.resolve(new Response());
    expect(await screen.findByText("A unidade KG aceita no máximo 3 casa(s) decimal(is).")).toBeTruthy();
    expect(input(FARINHA).value).toBe("18,5"); // nada foi perdido
    expect(input(FARINHA).getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Salvando…")).toBeNull();
  });

  it("valor igual ao salvo, campo vazio e foco sem digitar não geram requisição", async () => {
    const counted = inventario({ itens: [item({ quantidade_contada: "18.500" }), ITEMS[1]!, ITEMS[2]!] });
    const { mock, user } = await open(undefined, counted);
    expect(input(FARINHA).value).toBe("18,5");

    await user.clear(input(FARINHA));
    await user.tab(); // vazio: nada a enviar (não existe "descontar"), o campo volta ao valor salvo
    expect(input(FARINHA).value).toBe("18,5");

    await user.clear(input(FARINHA));
    await user.type(input(FARINHA), "18,500"); // mesmo valor, escrito de outro jeito
    await user.tab();
    await user.click(input(COCA));
    await user.tab();
    expect(mock.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("quantidade fracionada em unidade inteira é recusada antes de enviar, com a mensagem no campo", async () => {
    const { mock, user } = await open();
    await user.type(input(COCA), "1,5");
    await user.tab();
    expect(await screen.findByText("A unidade UN não aceita casas decimais: use um número inteiro.")).toBeTruthy();
    expect(input(COCA).getAttribute("aria-invalid")).toBe("true");
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")).toHaveLength(0);

    await user.clear(input(COCA));
    await user.type(input(COCA), "20");
    await user.tab();
    await waitFor(() => expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")).toHaveLength(1));
    expect(screen.queryByText(/não aceita casas decimais/)).toBeNull();
  });

  it("negativo é recusado; zero é uma contagem válida", async () => {
    const { mock, user } = await open();
    await user.type(input(FARINHA), "-1");
    await user.tab();
    expect(await screen.findByText("A quantidade não pode ser negativa.")).toBeTruthy();
    await user.clear(input(FARINHA));
    await user.type(input(FARINHA), "0");
    await user.tab();
    await waitFor(() => expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(1));
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")[0]!.body).toEqual({ quantidade_contada: "0" });
  });

  it("os salvamentos vão em fila: o 2º PUT só sai depois do 1º responder, e o texto digitado em outra linha não se perde", async () => {
    const { mock, state, user } = await open();
    const first = deferred<Response>();
    mock.on("PUT /api/v1/inventarios/1/itens/7", async (call) => {
      await first.promise;
      const itens = state.inv.itens.map((i) => (i.produto_id === 7 ? { ...i, quantidade_contada: fmt((call.body as { quantidade_contada: string }).quantidade_contada) } : i));
      state.inv = inventario({ ...state.inv, itens });
      return json(200, state.inv);
    });

    await user.type(input(FARINHA), "18,5");
    await user.tab(); // PUT da Farinha em voo; o foco vai para a Coca-Cola
    await user.type(input(COCA), "20");
    await user.tab(); // blur da Coca: entra na fila
    expect(await screen.findAllByText("Salvando…")).toHaveLength(2);
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/7")).toHaveLength(1);
    expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")).toHaveLength(0); // espera o primeiro terminar

    first.resolve(new Response());
    await waitFor(() => expect(mock.callsTo("PUT /api/v1/inventarios/1/itens/8")).toHaveLength(1));
    expect(await screen.findByText("2 de 3 contados")).toBeTruthy();
    expect(input(FARINHA).value).toBe("18,5");
    expect(input(COCA).value).toBe("20");
  });

  it("erro do backend aparece na linha e a tela recarrega quando o inventário deixou de estar aberto", async () => {
    const { mock, state, user } = await open();
    mock.on("PUT /api/v1/inventarios/1/itens/7", () => {
      state.inv = inventario({ ...state.inv, status: "fechado" }); // outra pessoa fechou: o recarregamento já vê o novo estado
      return apiError(409, "inventario_nao_aberto", "O inventário está fechado.");
    });
    await user.type(input(FARINHA), "18,5");
    await user.tab();
    expect(await screen.findByText("O inventário está fechado.")).toBeTruthy();
    // a invalidação recarrega o detalhe: a grade vira somente leitura
    await waitFor(() => expect(screen.queryByLabelText(`Contagem de ${FARINHA}`)).toBeNull());
    expect(screen.getByText(/somente leitura/)).toBeTruthy();
  });

  it("busca por nome e 'só pendentes' filtram a grade sem requisição", async () => {
    const counted = inventario({ itens: [item({ quantidade_contada: "18.500" }), ITEMS[1]!, ITEMS[2]!] });
    const { mock, user } = await open(undefined, counted);
    await user.type(screen.getByLabelText("Buscar produto"), "queijo");
    expect(screen.queryByLabelText(`Contagem de ${COCA}`)).toBeNull();
    expect(screen.getByLabelText("Contagem de Queijo Mussarela (KG)")).toBeTruthy();
    await user.clear(screen.getByLabelText("Buscar produto"));
    await user.click(screen.getByRole("checkbox", { name: "Só pendentes" }));
    expect(screen.queryByLabelText(`Contagem de ${FARINHA}`)).toBeNull();
    expect(screen.getByLabelText(`Contagem de ${COCA}`)).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/inventarios/1")).toHaveLength(1);
  });
});

describe("InventoryDetailPage: fechar e cancelar", () => {
  it("a confirmação mostra quantos itens não foram contados (e que não serão alterados); o resultado mostra ajustados e não contados", async () => {
    const { mock, user } = await open();
    await user.type(input(FARINHA), "18,5");
    await user.tab();
    await screen.findByText("1 de 3 contados");

    await user.click(screen.getByRole("button", { name: "Fechar inventário" }));
    const dialog = await screen.findByRole("dialog", { name: "Fechar inventário" });
    expect(within(dialog).getByText("2")).toBeTruthy();
    expect(within(dialog).getByText(/itens não foram contados e não serão alterados/)).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/inventarios/1/fechar")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Fechar inventário" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/inventarios/1/fechar")).toHaveLength(1));
    const result = await screen.findByText(/1 produto\(s\) ajustado\(s\) e 2 não contado\(s\)/);
    expect(result.textContent).toContain("mantêm o saldo");

    // fechado: somente leitura, com a diferença que a API calculou
    expect(screen.queryByLabelText(/^Contagem de /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar inventário" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar inventário" })).toBeNull();
    const table = screen.getByRole("table", { name: "Resultado do inventário" });
    expect(within(table).getByText("-1,5 KG")).toBeTruthy();
    expect(within(table).getAllByText("Não contado")).toHaveLength(2);
    expect(screen.getByText(/Fechado/, { selector: "span" })).toBeTruthy();
  });

  it("antes de abrir a confirmação espera as contagens em voo terminarem (o número de não contados fica certo)", async () => {
    const { mock, state, user } = await open();
    const gate = deferred<Response>();
    mock.on("PUT /api/v1/inventarios/1/itens/7", async () => {
      await gate.promise;
      const itens = state.inv.itens.map((i) => (i.produto_id === 7 ? { ...i, quantidade_contada: "18.500" } : i));
      state.inv = inventario({ ...state.inv, itens });
      return json(200, state.inv);
    });
    await user.type(input(FARINHA), "18,5");
    await user.click(screen.getByRole("button", { name: "Fechar inventário" })); // o clique tira o foco do campo e dispara o salvamento
    expect(screen.queryByRole("dialog")).toBeNull();

    gate.resolve(new Response());
    const dialog = await screen.findByRole("dialog", { name: "Fechar inventário" });
    expect(within(dialog).getByText(/itens não foram contados/)).toBeTruthy();
    expect(within(dialog).getByText("2")).toBeTruthy();
  });

  it("todos contados: a confirmação diz isso", async () => {
    const all = inventario({ itens: ITEMS.map((i) => ({ ...i, quantidade_contada: "1.000" })) });
    const { user } = await open(undefined, all);
    await user.click(screen.getByRole("button", { name: "Fechar inventário" }));
    const dialog = await screen.findByRole("dialog", { name: "Fechar inventário" });
    expect(within(dialog).getByText("Todos os itens foram contados.")).toBeTruthy();
  });

  it("erro ao fechar aparece dentro da confirmação", async () => {
    const { mock, user } = await open();
    mock.on("POST /api/v1/inventarios/1/fechar", apiError(409, "inventario_nao_aberto", "O inventário já está fechado."));
    await user.click(screen.getByRole("button", { name: "Fechar inventário" }));
    const dialog = await screen.findByRole("dialog", { name: "Fechar inventário" });
    await user.click(within(dialog).getByRole("button", { name: "Fechar inventário" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("O inventário já está fechado.");
  });

  it("cancelar pede confirmação, usa POST /cancelar e deixa a tela somente leitura", async () => {
    const { mock, user } = await open();
    await user.click(screen.getByRole("button", { name: "Cancelar inventário" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancelar inventário" });
    expect(mock.callsTo("POST /api/v1/inventarios/1/cancelar")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar inventário" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/inventarios/1/cancelar")).toHaveLength(1));
    expect(await screen.findByText(/Este inventário está cancelado e é somente leitura/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Contagem de /)).toBeNull();
  });
});

describe("InventoryDetailPage: somente leitura e permissões", () => {
  it("inventário fechado abre sem campos de contagem, com sistema, contada e diferença da API", async () => {
    const closed = inventario({
      status: "fechado",
      fechado_em: "2026-10-13T20:00:00+00:00",
      itens: [item({ quantidade_contada: "18.500", diferenca: "-1.500" }), item({ produto_id: 8, produto_nome: "Coca-Cola Lata", unidade: "UN", quantidade_sistema: "24.000", quantidade_contada: "25.000", diferenca: "1.000" }), ITEMS[2]!],
    });
    await open(undefined, closed);
    const table = screen.getByRole("table", { name: "Resultado do inventário" });
    expect(screen.queryByRole("textbox", { name: /Contagem/ })).toBeNull();
    expect(within(table).getByText("-1,5 KG")).toBeTruthy();
    expect(within(table).getByText("+1 UN")).toBeTruthy();
    expect(within(table).getByText("18,5 KG")).toBeTruthy();
    expect(within(table).getByText("Não contado")).toBeTruthy();
    expect(screen.getByText(/somente leitura/)).toBeTruthy();
    expect(screen.getByText(/A diferença é calculada pelo sistema no fechamento/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar inventário" })).toBeNull();
  });

  it("só com inventarios.listar não há campos nem botões, e um aviso explica", async () => {
    await open(["inventarios.listar"]);
    expect(screen.queryByLabelText(/^Contagem de /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar inventário" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar inventário" })).toBeNull();
    expect(screen.getByText(/não tem permissão para lançar contagens/)).toBeTruthy();
  });

  it("com contar mas sem fechar/criar só há os campos de contagem", async () => {
    await open(["inventarios.listar", "inventarios.contar"]);
    expect(screen.getByLabelText(`Contagem de ${FARINHA}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar inventário" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar inventário" })).toBeNull();
  });

  it("id inválido na URL e inventário inexistente mostram erro claro", async () => {
    const mock = mockApi();
    signIn({ permissoes: INVENTORY_PERMISSIONS });
    mock.on("GET /api/v1/inventarios/999", apiError(404, "nao_encontrado", "Inventário não encontrado(a)."));
    renderApp("/inventarios/abc");
    expect(await screen.findByText("Inventário inválido")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/inventarios/999")).toHaveLength(0);
  });

  it("404 do backend mostra a mensagem", async () => {
    const mock = mockApi();
    signIn({ permissoes: INVENTORY_PERMISSIONS });
    mock.on("GET /api/v1/inventarios/999", apiError(404, "nao_encontrado", "Inventário não encontrado(a)."));
    renderApp("/inventarios/999");
    expect(await screen.findByText("Inventário não encontrado(a).")).toBeTruthy();
  });
});
