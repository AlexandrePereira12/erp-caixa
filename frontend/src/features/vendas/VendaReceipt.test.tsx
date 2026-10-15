import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComandaReceipt } from "@/features/comandas/ComandaReceipt";
import { comanda, venda } from "@/features/comandas/fixtures";
import type { Comanda, Venda } from "@/components/pdv/types";
import type { Empresa } from "@/lib/api/types";
import { VendaReceipt } from "./VendaReceipt";

const EMPRESA: Empresa = { nome_exibicao: "Restaurante do Zé", cnpj: "11222333000181", telefone: "8533334444", endereco: "Rua das Oliveiras, 1234 - Centro", email_contato: "contato@zerestaurante.com.br" };

const asVenda = (over: Record<string, unknown> = {}) => venda(over) as unknown as Venda;
const asComanda = (over: Record<string, unknown> = {}) => comanda(over) as unknown as Comanda;

describe("Recibo da venda (cupom)", () => {
  it("cabeçalho com os dados da empresa, cliente, itens em duas linhas, totais e pagamento", () => {
    render(<VendaReceipt venda={asVenda()} empresa={EMPRESA} />);
    const cupom = screen.getByRole("article", { name: "Recibo da venda 31" });

    expect(within(cupom).getByText("Restaurante do Zé")).toBeTruthy();
    expect(within(cupom).getByText("Rua das Oliveiras, 1234 - Centro")).toBeTruthy();
    expect(within(cupom).getByText("Fone(s) (85) 3333-4444")).toBeTruthy();
    expect(within(cupom).getByText("CNPJ 11.222.333/0001-81")).toBeTruthy();
    expect(within(cupom).getByText("contato@zerestaurante.com.br")).toBeTruthy();

    expect(within(cupom).getByText("Cliente")).toBeTruthy();
    expect(within(cupom).getByText("Consumidor")).toBeTruthy();
    expect(within(cupom).getByText("Recibo de venda #31")).toBeTruthy();
    expect(within(cupom).getByText(/^Comanda: #12$/)).toBeTruthy();
    expect(within(cupom).getByText("Operador: Ana Souza")).toBeTruthy();
    expect(within(cupom).getByText(/^Data\.\.\.: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)).toBeTruthy(); // sem a vírgula do formato da tela

    // item em duas linhas: "código DESCRIÇÃO" e "qtd x unitário => total" (quantidade com 3 casas, dinheiro com 2)
    expect(within(cupom).getByText("7 Chopp 300ml")).toBeTruthy();
    expect(within(cupom).getByText("2,000 x R$ 9,00 => R$ 18,00")).toBeTruthy();

    expect(within(cupom).getByText("Subtotal")).toBeTruthy();
    expect(within(cupom).getByText("TOTAL")).toBeTruthy();
    expect(within(cupom).getAllByText("R$ 19,80").length).toBeGreaterThanOrEqual(2); // total e pagamento
    expect(within(cupom).getByText("Dinheiro")).toBeTruthy();
    expect(within(cupom).getByText("Comprovante sem valor fiscal.")).toBeTruthy();
  });

  it("usa o nome do cliente e mostra desconto, recebido e troco quando existem", () => {
    render(<VendaReceipt venda={asVenda({ cliente: { id: 20, nome: "Maria Souza" }, desconto_total: "2.00" })} empresa={EMPRESA} />);
    const cupom = screen.getByRole("article");
    expect(within(cupom).getByText("Maria Souza")).toBeTruthy();
    expect(within(cupom).getByText("Descontos")).toBeTruthy();
    expect(within(cupom).getByText("Recebido")).toBeTruthy();
    expect(within(cupom).getAllByText("TROCO")).toHaveLength(1); // só o total: o troco por pagamento repetia o mesmo valor
  });

  it("empresa sem os dados opcionais mostra só o nome; sem empresa não há cabeçalho", () => {
    const { unmount } = render(<VendaReceipt venda={asVenda()} empresa={{ nome_exibicao: "Só o Nome", cnpj: null, telefone: null, endereco: null, email_contato: null }} />);
    expect(screen.getByText("Só o Nome")).toBeTruthy();
    expect(screen.queryByText(/CNPJ/)).toBeNull();
    expect(screen.queryByText(/Fone\(s\)/)).toBeNull();
    unmount();

    render(<VendaReceipt venda={asVenda()} />);
    expect(screen.queryByText("Só o Nome")).toBeNull();
    expect(screen.getByText("Recibo de venda #31")).toBeTruthy(); // o cupom sai mesmo sem os dados da empresa
  });

  it("venda estornada leva o carimbo", () => {
    render(<VendaReceipt venda={asVenda({ estorno: { em: "2026-10-13T13:00:00+00:00", por: "Ana", motivo: "Erro" } })} empresa={EMPRESA} />);
    expect(screen.getByText("VENDA ESTORNADA")).toBeTruthy();
  });
});

describe("Conferência da comanda (cupom)", () => {
  it("cabeçalho da empresa, local, itens em duas linhas e total", () => {
    render(<ComandaReceipt comanda={asComanda()} empresa={EMPRESA} />);
    const cupom = screen.getByRole("article", { name: "Conferência da comanda 12" });
    expect(within(cupom).getByText("Restaurante do Zé")).toBeTruthy();
    expect(within(cupom).getByText("Conferência da comanda #12")).toBeTruthy();
    expect(within(cupom).getByText("Consumidor")).toBeTruthy();
    expect(within(cupom).getByText("2,000 x R$ 9,00 => R$ 18,00")).toBeTruthy();
    expect(within(cupom).getByText("Conferência de consumo. Não é documento fiscal.")).toBeTruthy();
  });
});
