/** Máscaras visuais de cadastro (o backend guarda só os dígitos e valida CPF/CNPJ). */

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/** Aplica o padrão (cada "0" consome um dígito) sem inserir separador sobrando no fim. */
function applyPattern(digits: string, pattern: string): string {
  let out = "";
  let used = 0;
  for (const char of pattern) {
    if (used >= digits.length) break;
    if (char === "0") out += digits[used++];
    else out += char;
  }
  return out;
}

const CPF = "000.000.000-00";
const CNPJ = "00.000.000/0000-00";

export function maskCpf(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 11), CPF);
}

export function maskCnpj(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 14), CNPJ);
}

/** F -> CPF, J -> CNPJ. */
export function maskDocument(value: string, tipo: "F" | "J"): string {
  return tipo === "F" ? maskCpf(value) : maskCnpj(value);
}

export function maskCep(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 8), "00000-000");
}

/** Documento vindo da API (só dígitos) para exibir; formatos inesperados aparecem como vieram. */
export function formatDocument(documento: string | null | undefined, tipo: string): string {
  if (!documento) return "—";
  const digits = onlyDigits(documento);
  if (tipo === "F" && digits.length === 11) return maskCpf(digits);
  if (tipo === "J" && digits.length === 14) return maskCnpj(digits);
  return documento;
}

/** Mensagem de documento incompleto (validação leve; o backend confere os dígitos verificadores). */
export function documentLengthError(value: string, tipo: "F" | "J"): string | null {
  const digits = onlyDigits(value);
  if (digits.length === 0) return null;
  if (tipo === "F" && digits.length !== 11) return "O CPF deve ter 11 dígitos.";
  if (tipo === "J" && digits.length !== 14) return "O CNPJ deve ter 14 dígitos.";
  return null;
}
