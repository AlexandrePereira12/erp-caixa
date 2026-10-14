import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json } from "@/test/mockFetch";
import { BaixaPagarDialog } from "./BaixaPagarDialog";
import { TODAS_AS_PERMISSOES, detalhe, renderDialog, setup, titulo } from "./testSupport";

const POST = "POST /api/v1/contas-pagar/8/baixas";
const UUID = /^[0-9a-f-]{36}$/;

beforeEach(() => {
  session.reset("anonymous");
});

async function abrir(conta = titulo(), permissoes = TODAS_AS_PERMISSOES) {
  const mock = setup(permissoes);
  mock.on(POST, json(201, detalhe({ status: "pago", valor_pago: "100.00", saldo: "0.00" })));
  const onClose = vi.fn();
  const view = renderDialog(<BaixaPagarDialog titulo={conta as never} onClose={onClose} />);
  const dialog = await screen.findByRole("dialog", { name: "Registrar pagamento" });
  if (permissoes.includes("formas_pagamento.listar")) await within(dialog).findByRole("combobox", { name: /Forma de pagamento/ });
  return { mock, onClose, dialog, ...view };
}

describe("BaixaPagarDialog", () => {
  it("abre com o saldo no valor, sem fiado nas formas, e paga o total com chave de idempotência", async () => {
    const { mock, user, dialog, onClose } = await abrir();
    expect((within(dialog).getByLabelText(/^Valor pago/) as HTMLInputElement).value).toBe("100,00");
    expect(dialog.textContent).toContain("Distribuidora Sol");
    const formas = within(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ })).getAllByRole("option").map((o) => o.textContent);
    expect(formas).toEqual(["Selecione…", "Dinheiro", "Pix", "Cartão de crédito"]);

    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "2");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    await waitFor(() => expect(mock.callsTo(POST)).toHaveLength(1));
    // Sem data nem observação preenchidas, essas chaves nem vão no corpo (a data padrão é "hoje na empresa").
    expect(mock.callsTo(POST)[0]!.body).toEqual({ valor: "100.00", forma_pagamento_id: 2, chave: expect.stringMatching(UUID) });
    expect(await screen.findByText("Pagamento registrado.")).toBeTruthy();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("pagamento parcial com data e observação vai como string decimal", async () => {
    const { mock, user, dialog } = await abrir();
    const valor = within(dialog).getByLabelText(/^Valor pago/);
    await user.clear(valor);
    await user.type(valor, "35,5");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.type(within(dialog).getByLabelText("Data do pagamento"), "2026-10-12");
    await user.type(within(dialog).getByLabelText("Observação"), "Adiantamento");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    await waitFor(() => expect(mock.callsTo(POST)).toHaveLength(1));
    expect(mock.callsTo(POST)[0]!.body).toEqual({
      valor: "35.50",
      forma_pagamento_id: 1,
      data_pagamento: "2026-10-12",
      observacao: "Adiantamento",
      chave: expect.stringMatching(UUID),
    });
  });

  it("'Usar o saldo todo' devolve o saldo ao campo", async () => {
    const { user, dialog } = await abrir();
    const valor = within(dialog).getByLabelText(/^Valor pago/) as HTMLInputElement;
    await user.clear(valor);
    await user.type(valor, "5");
    await user.click(within(dialog).getByRole("button", { name: /Usar o saldo todo/ }));
    expect(valor.value).toBe("100,00");
  });

  it("barra valor zerado, acima do saldo e forma não escolhida antes de chamar a API", async () => {
    const { mock, user, dialog } = await abrir();
    const valor = within(dialog).getByLabelText(/^Valor pago/);

    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await within(dialog).findByText("Escolha a forma de pagamento.")).toBeTruthy();

    await user.clear(valor);
    await user.type(valor, "100,01");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect((await within(dialog).findByText(/O valor passa do saldo da conta/)).textContent?.replace(/\u00a0/g, " ")).toContain("R$ 100,00");

    await user.clear(valor);
    await user.type(valor, "0");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await within(dialog).findByText("Informe um valor maior que zero, como 25,00.")).toBeTruthy();
    expect(mock.callsTo(POST)).toHaveLength(0);
  });

  it("valor_acima_do_saldo (saldo mudou) mostra a mensagem do backend e a nova tentativa reusa a mesma chave", async () => {
    const { mock, user, dialog } = await abrir();
    let chamadas = 0;
    mock.on(POST, () => {
      chamadas += 1;
      return chamadas === 1 ? apiError(409, "valor_acima_do_saldo", "O valor passa do saldo da conta (60.00).") : json(201, detalhe({ status: "pago", valor_pago: "100.00", saldo: "0.00" }));
    });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));

    const alerta = await within(dialog).findByRole("alert");
    expect(alerta.textContent).toContain("O valor passa do saldo da conta (60.00).");
    expect(alerta.textContent).toContain("O saldo da conta mudou");

    const valor = within(dialog).getByLabelText(/^Valor pago/);
    await user.clear(valor);
    await user.type(valor, "60");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    await waitFor(() => expect(mock.callsTo(POST)).toHaveLength(2));
    const [primeira, segunda] = mock.callsTo(POST).map((c) => c.body as { chave: string });
    expect(segunda!.chave).toBe(primeira!.chave);
  });

  it("data futura e forma inválida (422) aparecem no próprio campo", async () => {
    const { mock, user, dialog } = await abrir();
    let chamadas = 0;
    mock.on(POST, () => {
      chamadas += 1;
      return chamadas === 1
        ? apiError(422, "data_futura", "A data do pagamento não pode ser futura: lance o pagamento no dia em que ele ocorrer.")
        : apiError(422, "forma_invalida", "Escolha uma forma de pagamento ativa que não seja fiado.");
    });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Forma de pagamento/ }), "1");
    await user.type(within(dialog).getByLabelText("Data do pagamento"), "2030-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await within(dialog).findByText(/não pode ser futura: lance/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Data do pagamento").getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog).queryByRole("alert")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Confirmar pagamento" }));
    expect(await within(dialog).findByText(/ativa que não seja fiado/)).toBeTruthy();
  });

  it("conta que deixou de estar em aberto avisa e bloqueia o envio", async () => {
    const { dialog } = await abrir(titulo({ status: "pago", situacao: "pago", saldo: "0.00", valor_pago: "100.00", dias_para_vencer: null }));
    expect(within(dialog).getByText("A conta não está mais em aberto")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Confirmar pagamento" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sem formas_pagamento.listar avisa e não deixa enviar, sem consultar as formas", async () => {
    const { mock, dialog } = await abrir(titulo(), ["contas_pagar.listar", "contas_pagar.baixar"]);
    expect(within(dialog).getByText("Você não tem permissão para listar as formas de pagamento.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Confirmar pagamento" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.callsTo("GET /api/v1/formas-pagamento")).toHaveLength(0);
  });
});
