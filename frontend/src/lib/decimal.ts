/**
 * Aritmética decimal EXATA (BigInt sobre strings), usada só para entrada e exibição no cliente.
 * O backend é a única fonte da verdade de totais, troco e saldos: recalcula e valida tudo.
 * Valores monetários e quantidades trafegam sempre como string decimal ("12.50"), nunca number.
 */

interface Parsed {
  negative: boolean;
  digits: bigint; // valor sem o ponto, em unidades de 10^-scale
  scale: number;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function parse(value: string): Parsed {
  if (!DECIMAL.test(value)) throw new Error(`decimal inválido: "${value}"`);
  const negative = value.startsWith("-");
  const [int, frac = ""] = (negative ? value.slice(1) : value).split(".");
  return { negative, digits: BigInt(int + frac), scale: frac.length };
}

function format(digits: bigint, scale: number, negative: boolean): string {
  const text = digits.toString().padStart(scale + 1, "0");
  const int = scale ? text.slice(0, -scale) : text;
  const frac = scale ? text.slice(-scale) : "";
  const out = frac ? `${int}.${frac}` : int;
  return negative && digits !== 0n ? `-${out}` : out;
}

function signed(p: Parsed, scale: number): bigint {
  const v = p.digits * 10n ** BigInt(scale - p.scale);
  return p.negative ? -v : v;
}

function combine(a: string, b: string, op: (x: bigint, y: bigint) => bigint): string {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const result = op(signed(pa, scale), signed(pb, scale));
  return format(result < 0n ? -result : result, scale, result < 0n);
}

export const addDecimal = (a: string, b: string): string => combine(a, b, (x, y) => x + y);
export const subDecimal = (a: string, b: string): string => combine(a, b, (x, y) => x - y);

export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.scale, pb.scale);
  const x = signed(pa, scale);
  const y = signed(pb, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function sumDecimals(values: string[]): string {
  return values.reduce((acc, v) => addDecimal(acc, v), "0");
}

/**
 * Converte o texto digitado ("12,50", "1.234,56", "12.5") na string decimal da API ("12.50").
 * Com vírgula, ela é o separador decimal e os pontos são milhar. Só com pontos, um único ponto
 * seguido de até `maxScale` dígitos é decimal; grupos de 3 dígitos ("1.234.567") são milhar.
 * Devolve null se o texto não for um número válido (ou tiver casas além de `maxScale`).
 */
export function parseDecimalInput(text: string, maxScale = 2): string | null {
  const raw = text.trim().replace(/\s/g, "");
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(",")) {
    if (raw.indexOf(",") !== raw.lastIndexOf(",")) return null;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw) && !(raw.split(".").length === 2 && maxScale >= 3)) {
    normalized = raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }
  if (!DECIMAL.test(normalized)) return null;
  const frac = normalized.split(".")[1] ?? "";
  if (frac.length > maxScale) return null;
  return normalized;
}
