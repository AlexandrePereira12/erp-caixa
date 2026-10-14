import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json } from "@/test/mockFetch";
import { ContaFormDialog, DICA_VALOR_TRAVADO } from "./ContaFormDialog";
import { TODAS_AS_PERMISSOES, baixa, detalhe, renderDialog, setup } from "./testSupport";

const POST = "POST /api/v1/contas-pagar";
const PATCH = "PATCH /api/v1/contas-pagar/8";

beforeEach(() => {
  session.reset("anonymous");
});

async function abrirNova() {
  const onClose = vi.fn();
  const view = renderDialog(<ContaFormDialog onClose={onClose} />);
  const dialog = await screen.findByRole("dialog", { name: "Nova conta a pagar" });
  return { ...view, dialog, onClose };
}

describe("ContaFormDialog: lançar", () => {
  it("exige descrição, valor e vencimento e não envia nada enquanto faltarem", async () => {
    const mock = setup();
    mock.on(POST, json(201, detalhe()));
    const { user, dialog } = await abrirNova();

    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText("Informe a descrição da conta.")).toBeTruthy();
    expect(within(dialog).getByText("Informe o valor da conta, como 250,00.")).toBeTruthy();
    expect(within(dialog).getByText("Informe a data de vencimento.")).toBeTruthy();
    expect(mock.callsTo(POST)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Valor/), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText("Informe um valor válido, como 12,50.")).toBeTruthy();
    await user.clear(within(dialog).getByLabelText(/^Valor/));
    await user.type(within(dialog).getByLabelText(/^Valor/), "0");
    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText("O valor deve ser maior que zero.")).toBeTruthy();
    expect(mock.callsTo(POST)).toHaveLength(0);
  });

  it("só com os campos obrigatórios envia descrição, valor como string decimal e vencimento", async () => {
    const mock = setup();
    mock.on(POST, json(201, detalhe()));
    const { user, dialog, onClose } = await abrirNova();

    await user.type(within(dialog).getByLabelText(/^Descrição/), "  Conta de luz  ");
    await user.type(within(dialog).getByLabelText(/^Valor/), "250");
    await user.type(within(dialog).getByLabelText(/^Vencimento/), "2026-10-25");
    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));

    await waitFor(() => expect(mock.callsTo(POST)).toHaveLength(1));
    expect(mock.callsTo(POST)[0]!.body).toEqual({ descricao: "Conta de luz", valor_original: "250.00", vencimento: "2026-10-25" });
    expect(await screen.findByText("Conta lançada.")).toBeTruthy();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("com todos os campos envia fornecedor, categoria, documento e observação", async () => {
    const mock = setup();
    mock.on(POST, json(201, detalhe()));
    const { user, dialog } = await abrirNova();

    await user.type(within(dialog).getByLabelText(/^Descrição/), "Aluguel de outubro");
    await user.type(within(dialog).getByRole("combobox", { name: "Fornecedor" }), "Sol");
    await user.click(await screen.findByRole("option", { name: /Distribuidora Sol/ }));
    expect(within(dialog).getByText("Distribuidora Sol")).toBeTruthy();
    await within(dialog).findByRole("option", { name: "Aluguel" });
    // Só categorias de despesa ativas: a inativa "Obras" não é oferecida num lançamento novo.
    expect(within(dialog).queryByRole("option", { name: /Obras/ })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText("Categoria"), "4");
    await user.type(within(dialog).getByLabelText(/^Valor/), "1.234,50");
    await user.type(within(dialog).getByLabelText(/^Vencimento/), "2026-11-05");
    await user.type(within(dialog).getByLabelText("Documento"), "Boleto 77");
    await user.type(within(dialog).getByLabelText("Observação"), "Pagar no dia");
    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));

    await waitFor(() => expect(mock.callsTo(POST)).toHaveLength(1));
    expect(mock.callsTo(POST)[0]!.body).toEqual({
      descricao: "Aluguel de outubro",
      valor_original: "1234.50",
      vencimento: "2026-11-05",
      pessoa_id: 30,
      categoria_id: 4,
      documento: "Boleto 77",
      observacao: "Pagar no dia",
    });
    // A busca de fornecedor para o cadastro só traz os ativos.
    expect(mock.callsTo("GET /api/v1/pessoas").some((c) => c.query.get("papel") === "fornecedor" && c.query.get("ativo") === "true")).toBe(true);
  });

  it("não oferece cadastro rápido de fornecedor (criaria cliente, que o backend recusa)", async () => {
    setup();
    const { dialog } = await abrirNova();
    expect(within(dialog).queryByText(/Cadastro rápido/)).toBeNull();
  });

  it("mostra erro de fornecedor e de categoria nos campos certos e erro de validação no campo", async () => {
    const mock = setup();
    let chamadas = 0;
    mock.on(POST, () => {
      chamadas += 1;
      if (chamadas === 1) return apiError(422, "fornecedor_invalido", "Distribuidora Sol não tem o papel de fornecedor: ajuste o cadastro da pessoa.");
      if (chamadas === 2) return apiError(422, "categoria_invalida", "A categoria Insumos está inativa.");
      return apiError(422, "validacao", "Dados inválidos.", [{ campo: "body.descricao", mensagem: "A descrição é longa demais." }]);
    });
    const { user, dialog, onClose } = await abrirNova();

    await user.type(within(dialog).getByLabelText(/^Descrição/), "Compra");
    await user.type(within(dialog).getByRole("combobox", { name: "Fornecedor" }), "Sol");
    await user.click(await screen.findByRole("option", { name: /Distribuidora Sol/ }));
    await within(dialog).findByRole("option", { name: "Insumos" });
    await user.selectOptions(within(dialog).getByLabelText("Categoria"), "3");
    await user.type(within(dialog).getByLabelText(/^Valor/), "10");
    await user.type(within(dialog).getByLabelText(/^Vencimento/), "2026-10-25");

    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText(/não tem o papel de fornecedor/)).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Fornecedor" }).getAttribute("aria-describedby")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText("A categoria Insumos está inativa.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Categoria").getAttribute("aria-invalid")).toBe("true");

    await user.click(within(dialog).getByRole("button", { name: "Lançar conta" }));
    expect(await within(dialog).findByText("A descrição é longa demais.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ContaFormDialog: editar", () => {
  async function abrirEdicao(conta: ReturnType<typeof detalhe>, permissoes = TODAS_AS_PERMISSOES) {
    const mock = setup(permissoes);
    mock.on(PATCH, json(200, conta));
    const onClose = vi.fn();
    const view = renderDialog(<ContaFormDialog titulo={conta as never} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Editar conta #8" });
    if (permissoes.includes("financeiro.listar")) await within(dialog).findByRole("option", { name: "Aluguel" });
    return { mock, onClose, dialog, ...view };
  }

  it("abre com os dados da conta e envia só o que mudou", async () => {
    const { mock, user, dialog } = await abrirEdicao(detalhe({ observacao: "Urgente" }));
    expect((within(dialog).getByLabelText(/^Descrição/) as HTMLInputElement).value).toBe("Compra de insumos");
    expect((within(dialog).getByLabelText(/^Valor/) as HTMLInputElement).value).toBe("100,00");
    expect((within(dialog).getByLabelText(/^Vencimento/) as HTMLInputElement).value).toBe("2026-10-20");
    expect((within(dialog).getByLabelText("Categoria") as HTMLSelectElement).value).toBe("3");

    const descricao = within(dialog).getByLabelText(/^Descrição/);
    await user.clear(descricao);
    await user.type(descricao, "Compra de verduras");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ descricao: "Compra de verduras" });
    expect(await screen.findByText("Conta atualizada.")).toBeTruthy();
  });

  it("sem pagamento lançado o valor pode mudar (string decimal) e o vencimento também", async () => {
    const { mock, user, dialog } = await abrirEdicao(detalhe());
    expect((within(dialog).getByLabelText(/^Valor/) as HTMLInputElement).disabled).toBe(false);
    const valor = within(dialog).getByLabelText(/^Valor/);
    await user.clear(valor);
    await user.type(valor, "120,5");
    const vencimento = within(dialog).getByLabelText(/^Vencimento/);
    await user.clear(vencimento);
    await user.type(vencimento, "2026-10-30");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ valor_original: "120.50", vencimento: "2026-10-30" });
  });

  it("com qualquer pagamento (inclusive estornado) o valor fica desabilitado, com dica, e nunca vai no PATCH", async () => {
    const estornado = detalhe({ baixas: [baixa({ id: 1, estornada: true }), baixa({ id: 2, valor: "-40.00", estorno_de_id: 1 })] });
    const { mock, user, dialog } = await abrirEdicao(estornado);
    const valor = within(dialog).getByLabelText(/^Valor/) as HTMLInputElement;
    expect(valor.disabled).toBe(true);
    expect(valor.value).toBe("100,00");
    expect(within(dialog).getByText(DICA_VALOR_TRAVADO)).toBeTruthy();

    const observacao = within(dialog).getByLabelText("Observação");
    await user.type(observacao, "Revisada");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ observacao: "Revisada" });
  });

  it("remover fornecedor, categoria, documento e observação envia null", async () => {
    const { mock, user, dialog } = await abrirEdicao(detalhe({ observacao: "Urgente" }));
    await user.click(within(dialog).getByRole("button", { name: "Remover fornecedor Distribuidora Sol" }));
    await user.selectOptions(within(dialog).getByLabelText("Categoria"), "");
    await user.clear(within(dialog).getByLabelText("Documento"));
    await user.clear(within(dialog).getByLabelText("Observação"));
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ pessoa_id: null, categoria_id: null, documento: null, observacao: null });
  });

  it("a categoria atual inativa continua escolhida e não é apagada ao salvar outro campo", async () => {
    const conta = detalhe({ categoria: { id: 5, nome: "Obras" } });
    const { mock, user, dialog } = await abrirEdicao(conta);
    expect(within(dialog).getByRole("option", { name: "Obras (inativa)" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Categoria") as HTMLSelectElement).value).toBe("5");

    await user.type(within(dialog).getByLabelText("Documento"), " v2");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ documento: "NF 1234 v2" });
  });

  it("sem mudança nenhuma não chama a API e só fecha", async () => {
    const { mock, user, dialog, onClose } = await abrirEdicao(detalhe());
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mock.callsTo(PATCH)).toHaveLength(0);
  });

  it("sem financeiro.listar a categoria fica travada e o PATCH não mexe nela", async () => {
    const { mock, user, dialog } = await abrirEdicao(detalhe(), ["contas_pagar.listar", "contas_pagar.editar"]);
    const categoria = within(dialog).getByLabelText("Categoria") as HTMLSelectElement;
    expect(categoria.disabled).toBe(true);
    expect(categoria.value).toBe("3");
    expect(within(dialog).getByText("Você não tem permissão para listar as categorias.")).toBeTruthy();
    expect(mock.callsTo("GET /api/v1/categorias-financeiras")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Documento"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo(PATCH)).toHaveLength(1));
    expect(mock.callsTo(PATCH)[0]!.body).toEqual({ documento: "NF 1234!" });
  });

  it("conta já cancelada (409) mostra a mensagem do backend e mantém o diálogo aberto", async () => {
    const { mock, user, dialog, onClose } = await abrirEdicao(detalhe());
    mock.on(PATCH, apiError(409, "titulo_cancelado", "A conta a pagar está cancelada e não pode ser editada."));
    await user.type(within(dialog).getByLabelText("Documento"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(await within(dialog).findByText("A conta a pagar está cancelada e não pode ser editada.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
