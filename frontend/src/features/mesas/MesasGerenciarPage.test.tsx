import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { businessError, signInAs } from "@/features/comandas/fixtures";
import { session } from "@/lib/auth/session";
import { json, mockApi } from "@/test/mockFetch";
import { renderApp } from "@/test/render";

const mesa = (over: Record<string, unknown> = {}) => ({ id: 1, nome: "Mesa 1", capacidade: 4, ativa: true, status: "livre", ...over });
const MESAS = [mesa(), mesa({ id: 2, nome: "Mesa 2", status: "reservada" }), mesa({ id: 3, nome: "Mesa 3", status: "ocupada" }), mesa({ id: 4, nome: "Mesa 4", status: "bloqueada", ativa: false })];

beforeEach(() => {
  session.reset("anonymous");
});

describe("MesasGerenciarPage", () => {
  it("mostra as ações permitidas para cada status", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas", json(200, MESAS));
    renderApp("/mesas/gerenciar");

    await screen.findByText("Mesa 1");
    expect(screen.getByRole("button", { name: "Reservar Mesa 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bloquear Mesa 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Liberar Mesa 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reservar Mesa 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Liberar Mesa 2" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bloquear Mesa 3" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Liberar Mesa 3" })).toBeNull();
    expect(screen.getByRole("button", { name: "Liberar Mesa 4" })).toBeTruthy();
    expect(screen.getByText("Inativa")).toBeTruthy();
  });

  it("reservar, bloquear e liberar chamam os endpoints da mesa", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas", json(200, MESAS));
    mock.on("POST /api/v1/mesas/1/reservar", json(200, mesa({ status: "reservada" })));
    mock.on("POST /api/v1/mesas/1/bloquear", json(200, mesa({ status: "bloqueada" })));
    mock.on("POST /api/v1/mesas/2/liberar", json(200, mesa({ id: 2, status: "livre" })));
    const { user } = renderApp("/mesas/gerenciar");

    await user.click(await screen.findByRole("button", { name: "Reservar Mesa 1" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/mesas/1/reservar")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Bloquear Mesa 1" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/mesas/1/bloquear")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Liberar Mesa 2" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/mesas/2/liberar")).toHaveLength(1));
  });

  it("cadastra mesa com nome e lugares como inteiro; nome repetido mostra o erro", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas", json(200, MESAS));
    let calls = 0;
    mock.on("POST /api/v1/mesas", () => {
      calls += 1;
      return calls === 1 ? businessError(409, "mesa_nome_em_uso", "Já existe uma mesa com este nome.") : json(201, mesa({ id: 9, nome: "Varanda 1", capacidade: 6 }));
    });
    const { user } = renderApp("/mesas/gerenciar");

    await user.click(await screen.findByRole("button", { name: "Nova mesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nova mesa" });
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Informe o nome da mesa.")).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Nome/), "Mesa 1");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    expect(await within(dialog).findByText("Já existe uma mesa com este nome.")).toBeTruthy();

    const nome = within(dialog).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Varanda 1");
    await user.type(within(dialog).getByLabelText("Lugares"), "6");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(mock.callsTo("POST /api/v1/mesas")).toHaveLength(2));
    expect(mock.callsTo("POST /api/v1/mesas")[1]!.body).toEqual({ nome: "Varanda 1", capacidade: 6 });
  });

  it("excluir mesa com comanda em andamento mostra o erro do backend", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas", json(200, MESAS));
    mock.on("DELETE /api/v1/mesas/3", businessError(409, "mesa_ocupada", "A mesa tem uma comanda em andamento."));
    const { user } = renderApp("/mesas/gerenciar");
    await user.click(await screen.findByRole("button", { name: "Excluir Mesa 3" }));
    const dialog = await screen.findByRole("dialog", { name: "Excluir mesa" });
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("A mesa tem uma comanda em andamento.");
  });

  it("editar envia só o que mudou (nome e ativa)", async () => {
    const mock = mockApi();
    signInAs("gerente");
    mock.on("GET /api/v1/mesas", json(200, MESAS));
    mock.on("PATCH /api/v1/mesas/1", json(200, mesa({ nome: "Mesa Um", ativa: false })));
    const { user } = renderApp("/mesas/gerenciar");
    await user.click(await screen.findByRole("button", { name: "Editar Mesa 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Mesa 1" });
    const nome = within(dialog).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, "Mesa Um");
    await user.click(within(dialog).getByRole("checkbox", { name: /Mesa ativa/ }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mock.callsTo("PATCH /api/v1/mesas/1")[0]?.body).toEqual({ nome: "Mesa Um", ativa: false }));
  });

  it("sem mesas.gerenciar a tela é negada", async () => {
    mockApi();
    signInAs("frente");
    renderApp("/mesas/gerenciar");
    expect(await screen.findByRole("heading", { name: "Acesso negado" })).toBeTruthy();
  });
});
