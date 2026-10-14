import { formatDay } from "@/components/pdv/dates";
import { compareDecimal } from "@/lib/decimal";
import { dayColumnItems } from "../dayColumns";
import { ColumnChart } from "./ColumnChart";

export interface DayColumnChartProps {
  janela: { de: string; ate: string };
  /** Valor de cada dia com movimento (`chave` = "YYYY-MM-DD", `valor` = decimal em texto). */
  linhas: { chave: string; valor: string }[];
  /** O que as colunas medem, para o resumo lido por leitores de tela ("faturamento por dia"). */
  subject: string;
}

/** Colunas por dia da janela com o resumo "Maior dia: ..." para leitores de tela. Sem dias na janela, não desenha nada. */
export function DayColumnChart({ janela, linhas, subject }: DayColumnChartProps) {
  const items = dayColumnItems(janela, linhas);
  const first = items[0];
  if (!first) return null;
  const top = items.reduce((best, item) => (compareDecimal(item.value, best.value) > 0 ? item : best), first);
  const aria = `Gráfico de colunas: ${subject}, de ${formatDay(janela.de)} a ${formatDay(janela.ate)}. Maior dia: ${top.label}, ${top.valueText}.`;
  return <ColumnChart items={items} ariaLabel={aria} />;
}
