import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarList, TopBarList } from "./BarList";
import { DayColumnChart } from "./DayColumnChart";
import { ColumnChart, type ColumnItem } from "./ColumnChart";
import { KpiCard, KpiGrid } from "./KpiCard";

describe("BarList", () => {
  const items = [
    { key: 1, label: "Pix", value: "700.00", valueText: "R$ 700,00" },
    { key: 2, label: "Dinheiro", value: "350.00", valueText: "R$ 350,00" },
    { key: 3, label: "Fiado", value: "0.01", valueText: "R$ 0,01" },
    { key: 4, label: "Vale", value: "0.00", valueText: "R$ 0,00" },
  ];

  it("é uma imagem com resumo e desenha cada barra proporcional à maior (valor positivo nunca some)", () => {
    render(<BarList ariaLabel="Gráfico de barras: total por forma." items={items} />);
    const chart = screen.getByRole("img", { name: "Gráfico de barras: total por forma." });
    const widths = Array.from(chart.querySelectorAll<HTMLElement>("[style*=\"width\"]")).map((bar) => bar.style.width);
    expect(widths).toEqual(["100%", "50%", "1%", "0%"]);
    // Na ordem recebida, com rótulo e valor formatado ao lado de cada barra.
    expect(within(chart).getAllByText(/^(Pix|Dinheiro|Fiado|Vale)$/).map((n) => n.textContent)).toEqual(["Pix", "Dinheiro", "Fiado", "Vale"]);
    expect(within(chart).getByText("R$ 700,00")).toBeTruthy();
  });

  it("sem itens não quebra", () => {
    render(<BarList ariaLabel="vazio" items={[]} />);
    expect(screen.getByRole("img", { name: "vazio" }).children).toHaveLength(0);
  });
});

describe("ColumnChart", () => {
  const make = (n: number): ColumnItem[] =>
    Array.from({ length: n }, (_, i) => ({ key: `d${i}`, label: `Dia ${i + 1}`, shortLabel: String(i + 1), value: `${(i + 1) * 10}.00`, valueText: `R$ ${(i + 1) * 10},00` }));

  it("altura proporcional à maior coluna, dica em cada coluna e o maior valor por extenso", () => {
    render(<ColumnChart ariaLabel="Gráfico de colunas" items={make(4)} />);
    const chart = screen.getByRole("img", { name: "Gráfico de colunas" });
    const columns = Array.from(chart.querySelectorAll<HTMLElement>("[title]"));
    expect(columns.map((c) => c.title)).toEqual(["Dia 1: R$ 10,00", "Dia 2: R$ 20,00", "Dia 3: R$ 30,00", "Dia 4: R$ 40,00"]);
    expect(columns.map((c) => (c.firstElementChild as HTMLElement).style.height)).toEqual(["25%", "50%", "75%", "100%"]);
    expect(screen.getByText("Maior valor: R$ 40,00")).toBeTruthy();
  });

  it("até 12 colunas rotula todas; com mais, só algumas (nunca texto amontoado)", () => {
    const { unmount } = render(<ColumnChart ariaLabel="a" items={make(12)} />);
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(12);
    unmount();
    render(<ColumnChart ariaLabel="b" items={make(31)} />);
    const labels = screen.getAllByText(/^\d+$/).map((n) => n.textContent);
    expect(labels).toEqual(["1", "5", "9", "13", "17", "21", "25", "29"]);
  });

  it("períodos longos rolam dentro do gráfico: largura mínima de 0,5 rem por coluna", () => {
    render(<ColumnChart ariaLabel="c" items={make(100)} />);
    const chart = screen.getByRole("img", { name: "c" });
    expect((chart.querySelector("[style*='min-width']") as HTMLElement).style.minWidth).toBe("50rem");
  });

  it("todos os valores zerados: colunas vazias, sem divisão por zero", () => {
    const items = make(3).map((item) => ({ ...item, value: "0.00", valueText: "R$ 0,00" }));
    render(<ColumnChart ariaLabel="zeros" items={items} />);
    const chart = screen.getByRole("img", { name: "zeros" });
    expect(Array.from(chart.querySelectorAll<HTMLElement>("[title]")).map((c) => (c.firstElementChild as HTMLElement).style.height)).toEqual(["0%", "0%", "0%"]);
  });
});

describe("KpiCard", () => {
  it("é uma definição (rótulo e valor) dentro de uma lista de definições", () => {
    const { container } = render(
      <KpiGrid>
        <KpiCard label="Faturamento" value="R$ 10,00" hint="Vendas válidas" />
      </KpiGrid>,
    );
    expect(container.querySelector("dl > div > dt")?.textContent).toBe("Faturamento");
    expect(container.querySelectorAll("dl > div > dd")).toHaveLength(2);
  });

  it("o tom muda a cor por tokens e o destaque aumenta o número", () => {
    const { container } = render(
      <KpiGrid>
        <KpiCard label="A" value="1" tone="danger" featured />
        <KpiCard label="B" value="2" />
      </KpiGrid>,
    );
    const [a, b] = Array.from(container.querySelectorAll("dl > div"));
    expect(a!.className).toContain("bg-danger-soft");
    expect(a!.querySelector("dd")!.className).toContain("text-danger-text");
    expect(a!.querySelector("dd")!.className).toContain("text-3xl");
    expect(b!.className).toContain("bg-surface");
    expect(b!.querySelector("dd")!.className).toContain("text-fg");
  });
});

describe("TopBarList", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ key: i, label: `Item ${i + 1}`, value: `${100 - i}.00`, valueText: `R$ ${100 - i},00` }));

  it("mostra só as primeiras barras, resume a maior e avisa que a tabela traz todas", () => {
    render(<TopBarList items={items} subject="total por item" />);
    const chart = screen.getByRole("img", { name: "Gráfico de barras: total por item. Maior: Item 1, R$ 100,00." });
    expect(chart.children).toHaveLength(10);
    expect(screen.getByText("Gráfico com os 10 maiores; a tabela traz todos os 12.")).toBeTruthy();
  });

  it("sem excesso não há aviso; o termo do aviso pode ser 'primeiros'; sem itens não desenha nada", () => {
    const { container, rerender } = render(<TopBarList items={items.slice(0, 3)} subject="x" />);
    expect(screen.queryByText(/a tabela traz todos/)).toBeNull();
    rerender(<TopBarList items={items} subject="x" limit={5} noun="primeiros" />);
    expect(screen.getByText("Gráfico com os 5 primeiros; a tabela traz todos os 12.")).toBeTruthy();
    rerender(<TopBarList items={[]} subject="x" />);
    expect(container.textContent).toBe("");
  });
});

describe("DayColumnChart", () => {
  it("uma coluna por dia da janela, zero nos dias sem movimento, e resumo com o maior dia", () => {
    render(<DayColumnChart janela={{ de: "2026-10-30", ate: "2026-11-02" }} linhas={[{ chave: "2026-10-31", valor: "50.00" }, { chave: "2026-11-02", valor: "200.00" }]} subject="valor por dia" />);
    const chart = screen.getByRole("img", { name: /Gráfico de colunas: valor por dia, de 30\/10\/2026 a 02\/11\/2026. Maior dia: 02\/11\/2026, R\$\s200,00/ });
    const columns = Array.from(chart.querySelectorAll<HTMLElement>("[title]"));
    expect(columns.map((c) => c.title.replace(/\s/g, " "))).toEqual(["30/10/2026: R$ 0,00", "31/10/2026: R$ 50,00", "01/11/2026: R$ 0,00", "02/11/2026: R$ 200,00"]);
    expect(columns.map((c) => (c.firstElementChild as HTMLElement).style.height)).toEqual(["0%", "25%", "0%", "100%"]);
  });

  it("janela inválida não desenha nada", () => {
    const { container } = render(<DayColumnChart janela={{ de: "2026-11-02", ate: "2026-10-30" }} linhas={[]} subject="x" />);
    expect(container.textContent).toBe("");
  });
});
