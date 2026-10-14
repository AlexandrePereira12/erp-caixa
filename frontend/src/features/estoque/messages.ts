import { formatDecimal } from "@/lib/money";

/**
 * A mensagem de `estoque_insuficiente` traz os números crus da API ("saldo 20.000, necessário 30.000"),
 * que em pt-BR se leem como vinte mil. Aqui só se reformatam os trechos "saldo N" e "necessário N"
 * (formatação, sem conta); se o backend mudar o texto, a mensagem passa como veio.
 * Os `detalhes` estruturados (produto_id, saldo, necessario) não chegam ao ApiError: errors.ts só
 * aceita `detalhes` em lista.
 */
export function humanizeStockMessage(message: string, unit: string): string {
  return message.replace(/\b(saldo|necessário)\s+(-?\d+\.\d+)/g, (_match, label: string, value: string) => `${label} ${formatDecimal(value)} ${unit}`);
}
