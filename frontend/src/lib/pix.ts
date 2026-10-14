/*
 * Pix copia e cola estático (BR Code) com o valor da venda. O código cadastrado nas configurações não
 * tem valor; para cobrar o valor exato basta inserir o campo 54 e refazer o CRC16, sem API de banco.
 * Espelha backend/src/app/core/pix.py (a validação do que pode ser cadastrado fica lá): os vetores
 * dos testes foram montados com o CRC do backend, e os dois lados concordam neles.
 */

const encoder = new TextEncoder();

/** CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF, sem reflexão) sobre os bytes UTF-8. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of encoder.encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

type Campo = [id: string, valor: string];

/** Lê `ID + TAMANHO + VALOR` em sequência (tamanho em caracteres); null se o texto não fechar certo. */
function campos(texto: string): Campo[] | null {
  const chars = Array.from(texto);
  const lista: Campo[] = [];
  let i = 0;
  while (i < chars.length) {
    const cabecalho = chars.slice(i, i + 4).join("");
    if (!/^\d{4}$/.test(cabecalho)) return null;
    const fim = i + 4 + Number(cabecalho.slice(2));
    if (fim > chars.length) return null;
    lista.push([cabecalho.slice(0, 2), chars.slice(i + 4, fim).join("")]);
    i = fim;
  }
  return lista;
}

/**
 * Devolve o código com o valor (campo 54, "40.00") no lugar certo e o CRC refeito. `valor` é string
 * decimal com ponto e no máximo 2 casas; null se o valor não for maior que zero ou o código estiver quebrado.
 */
export function pixComValor(codigo: string, valor: string): string | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(valor) || Number(valor) <= 0) return null;
  const lista = campos(codigo);
  if (!lista || lista.at(-1)?.[0] !== "63") return null;
  const semCrcNemValor = lista.slice(0, -1).filter(([id]) => id !== "54");
  // Os campos vão em ordem de ID: o valor entra antes do primeiro campo maior que 54 (58, 59, 60...).
  const posicao = semCrcNemValor.findIndex(([id]) => id > "54");
  const campo54: Campo = ["54", valor];
  const todos = posicao === -1 ? [...semCrcNemValor, campo54] : [...semCrcNemValor.slice(0, posicao), campo54, ...semCrcNemValor.slice(posicao)];
  const corpo = todos.map(([id, v]) => `${id}${String(Array.from(v).length).padStart(2, "0")}${v}`).join("") + "6304";
  return corpo + crc16(corpo);
}
