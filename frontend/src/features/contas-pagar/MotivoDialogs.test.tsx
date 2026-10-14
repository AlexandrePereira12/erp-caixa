import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { session } from "@/lib/auth/session";
import { apiError, json } from "@/test/mockFetch";
import { CancelarContaDialog } from "./CancelarContaDialog";
import { EstornarBaixaDialog } from "./EstornarBaixaDialog";
import { baixa, detalhe, renderDialog, setup, titulo } from "./testSupport";

beforeEach(() => {
  session.reset("anonymous");
});

describe("CancelarContaDialog", () => {
  const ROTA = "POST /api/v1/contas-pagar/8/cancelar";

  it("não envia sem motivo de 3 caracteres e manda o motivo aparado", async () => {
    const mock = setup();
    mock.on(ROTA, json(200, detalhe({ status: "cancelado", situacao: "cancelado", dias_para_vencer: null, cancelado_motivo: "Duplicada" })));
    const onClose = vi.fn();
    const { user } = renderDialog(<CancelarContaDialog titulo={titulo() as never} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Cancelar conta" });
    expect(dialog.textContent).toContain("Compra de insumos");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Motivo/), " Duplicada ");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    await waitFor(() => expect(mock.callsTo(ROTA)).toHaveLength(1));
    expect(mock.callsTo(ROTA)[0]!.body).toEqual({ motivo: "Duplicada" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("erro do backend aparece no diálogo, que continua aberto", async () => {
    const mock = setup();
    mock.on(ROTA, apiError(409, "titulo_pago", "A conta já está paga: estorne os pagamentos antes de cancelar."));
    const onClose = vi.fn();
    const { user } = renderDialog(<CancelarContaDialog titulo={titulo() as never} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Cancelar conta" });
    await user.type(within(dialog).getByLabelText(/^Motivo/), "Teste");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar conta" }));
    expect(await within(dialog).findByText("A conta já está paga: estorne os pagamentos antes de cancelar.")).toBeTruthy();
    expect(within(dialog).getByText(/Os dados da conta foram atualizados/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("EstornarBaixaDialog", () => {
  const ROTA = "POST /api/v1/contas-pagar/8/baixas/5/estornar";

  it("descreve o pagamento, pede o motivo e estorna a baixa certa", async () => {
    const mock = setup();
    mock.on(ROTA, json(200, detalhe()));
    const onClose = vi.fn();
    const { user } = renderDialog(<EstornarBaixaDialog titulo={titulo() as never} baixa={baixa({ id: 5, valor: "25.00", forma: "Pix", data_pagamento: "2026-10-09" })} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Estornar pagamento" });
    expect(dialog.textContent).toMatch(/R\$\s25,00/);
    expect(dialog.textContent).toContain("09/10/2026");
    expect(dialog.textContent).toContain("Pix");

    await user.type(within(dialog).getByLabelText(/^Motivo/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Estornar pagamento" }));
    expect(await within(dialog).findByText("Informe pelo menos 3 caracteres.")).toBeTruthy();
    expect(mock.callsTo(ROTA)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Motivo/), "c");
    await user.click(within(dialog).getByRole("button", { name: "Estornar pagamento" }));
    await waitFor(() => expect(mock.callsTo(ROTA)).toHaveLength(1));
    expect(mock.callsTo(ROTA)[0]!.body).toEqual({ motivo: "abc" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
