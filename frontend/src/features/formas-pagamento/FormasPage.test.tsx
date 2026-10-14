import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { businessError, forma, FORMAS, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const LISTA = [...FORMAS, forma({ id: 5, nome: "Vale-refeição", tipo: "vale", ativa: false, ordem: 4 })];

beforeEach(() => {
  session.reset("anonymous");
});

describe("FormasPage", () => {
  it("lista as formas com situação; dinheiro e fiado aparecem como protegidos e sem desativar/excluir", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    renderApp("/formas-pagamento");

    expect(await screen.findByText("Vale-refeição")).toBeTruthy();
    expect(screen.getAllByText("Protegida")).toHaveLength(2);
    expect(screen.getByText("Inativa")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Desativar Dinheiro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir Dinheiro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desativar Fiado" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar Dinheiro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desativar Pix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ativar Vale-refeição" })).toBeTruthy();
  });

  it("ativar e desativar enviam ativa no PATCH", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    mock.on("PATCH /api/v1/formas-pagamento/2", json(200, { ...LISTA[1], ativa: false }));
    mock.on("PATCH /api/v1/formas-pagamento/5", json(200, { ...LISTA[4], ativa: true }));
    const { user } = renderApp("/formas-pagamento");

    await user.click(await screen.findByRole("button", { name: "Desativar Pix" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/formas-pagamento/2")[0]?.body).toEqual({ ativa: false }));
    await user.click(screen.getByRole("button", { name: "Ativar Vale-refeição" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/formas-pagamento/5")[0]?.body).toEqual({ ativa: true }));
  });

  it("cadastrar valida o nome e envia nome, tipo e ordem; nome repetido mostra o erro no campo", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    let calls = 0;
    mock.on("POST /api/v1/formas-pagamento", () => {
      calls += 1;
      return calls === 1 ? businessError(409, "forma_nome_em_uso", "Já existe uma forma de pagamento com este nome.") : json(201, forma({ id: 6, nome: "Débito Visa", tipo: "debito", ordem: 7 }));
    });
    const { user } = renderApp("/formas-pagamento");

    await user.click(await screen.findByRole("button", { name: "Nova forma" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova forma de pagamento" });
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Informe o nome da forma de pagamento.")).toBeTruthy();
    expect(mock.callsTo("POST /api/v1/formas-pagamento")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Nome/), "Débito Visa");
    await user.selectOptions(within(dialog).getByLabelText("Tipo"), "debito");
    await user.type(within(dialog).getByLabelText("Ordem"), "7");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Já existe uma forma de pagamento com este nome.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/formas-pagamento")).toHaveLength(2));
    expect(mock.callsTo("POST /api/v1/formas-pagamento")[1]!.body).toEqual({ nome: "Débito Visa", tipo: "debito", ordem: 7 });
  });

  it("excluir forma já usada orienta desativar", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    mock.on("DELETE /api/v1/formas-pagamento/2", businessError(409, "forma_em_uso", "Esta forma já foi usada em movimentos de caixa: desative-a em vez de excluir."));
    const { user } = renderApp("/formas-pagamento");

    await user.click(await screen.findByRole("button", { name: "Excluir Pix" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir forma de pagamento" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("desative-a em vez de excluir");
  });

  it("editar não altera o tipo e envia só o que mudou", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    mock.on("PATCH /api/v1/formas-pagamento/2", json(200, { ...LISTA[1], nome: "Pix QR" }));
    const { user } = renderApp("/formas-pagamento");

    await user.click(await screen.findByRole("button", { name: "Editar Pix" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Pix" });
    expect((within(dialog).getByLabelText("Tipo") as HTMLSelectElement).disabled).toBe(true);
    const nome = within(dialog).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Pix QR");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/formas-pagamento/2")[0]?.body).toEqual({ nome: "Pix QR" }));
  });

  it("só com formas_pagamento.listar a tela é consulta: sem ações de gestão", async () => {
    const mock = mockApi();
    signInAs("frente");
    mock.on("GET /api/v1/formas-pagamento", json(200, LISTA));
    renderApp("/formas-pagamento");
    expect(await screen.findByText("Vale-refeição")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nova forma" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
  });

  it("sem formas_pagamento.listar a tela é negada", async () => {
    mockApi();
    signInAs("atendente");
    renderApp("/formas-pagamento");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
  });
});
