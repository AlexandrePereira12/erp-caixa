import { compareDecimal, maxDecimal, percentOf } from "@/lib/decimal";

/** Referência (maior valor) de uma lista de valores decimais em texto. */
export function chartMax(values: string[]): string {
  return maxDecimal(values);
}

/**
 * Altura/largura (0 a 100) de uma barra. Valor positivo nunca some: abaixo de 1% a barra fica em
 * 1%, para que "tem venda" não se confunda com "não teve nada".
 */
export function barPercent(value: string, max: string): number {
  const percent = percentOf(value, max);
  return percent === 0 && compareDecimal(value, "0") > 0 ? 1 : percent;
}
