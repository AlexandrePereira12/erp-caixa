import { formatDay } from "@/components/pdv/dates";
import { formatMoney } from "@/lib/money";
import type { ColumnItem } from "./components/ColumnChart";
import { eachDay } from "./period";

/**
 * Uma coluna por dia da janela, com zero nos dias sem movimento (a API só devolve os dias com
 * movimento; sem preencher, colunas vizinhas pulariam dias). `chave` é "YYYY-MM-DD".
 */
export function dayColumnItems(janela: { de: string; ate: string }, linhas: { chave: string; valor: string }[]): ColumnItem[] {
  const byDay = new Map(linhas.map((linha) => [linha.chave, linha.valor]));
  return eachDay(janela.de, janela.ate).map((day) => {
    const value = byDay.get(day) ?? "0";
    return { key: day, label: formatDay(day), shortLabel: day.slice(8), value, valueText: formatMoney(value) };
  });
}
