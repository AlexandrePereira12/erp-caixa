import type { BadgeTone } from "@/components/Badge";

function pick(map: Record<string, string>, key: string): string {
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

const COMANDA_STATUS: Record<string, string> = {
  aberta: "Aberta",
  aguardando_pagamento: "Aguardando pagamento",
  fechada: "Fechada",
  cancelada: "Cancelada",
};
export const comandaStatusLabel = (status: string) => pick(COMANDA_STATUS, status);
export function comandaStatusTone(status: string): BadgeTone {
  switch (status) {
    case "aberta":
      return "brand";
    case "aguardando_pagamento":
      return "warning";
    case "fechada":
      return "success";
    default:
      return "neutral";
  }
}

const COMANDA_TIPO: Record<string, string> = { mesa: "Mesa", balcao: "Balcão", retirada: "Retirada", delivery: "Delivery" };
export const comandaTipoLabel = (tipo: string) => pick(COMANDA_TIPO, tipo);

/** "Mesa 3" para comanda de mesa; "Balcão", "Retirada" ou "Delivery" nos demais tipos. */
export function comandaLocal(c: { tipo: string; mesa: { nome: string } | null }): string {
  return c.tipo === "mesa" && c.mesa ? c.mesa.nome : comandaTipoLabel(c.tipo);
}

const MESA_STATUS: Record<string, string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  aguardando_pagamento: "Aguardando pagamento",
  reservada: "Reservada",
  bloqueada: "Bloqueada",
};
export const mesaStatusLabel = (status: string) => pick(MESA_STATUS, status);

const FORMA_TIPO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  vale: "Vale",
  fiado: "Fiado",
  outro: "Outro",
};
export const formaTipoLabel = (tipo: string) => pick(FORMA_TIPO, tipo);

const MOVIMENTO: Record<string, string> = {
  abertura: "Abertura",
  venda: "Venda",
  recebimento: "Recebimento de conta",
  sangria: "Sangria",
  reforco: "Reforço",
  estorno_venda: "Estorno de venda",
  estorno_recebimento: "Estorno de recebimento",
};
export const movimentoLabel = (tipo: string) => pick(MOVIMENTO, tipo);

const TITULO_STATUS: Record<string, string> = { aberto: "Aberto", pago: "Pago", cancelado: "Cancelado" };
export const tituloStatusLabel = (status: string) => pick(TITULO_STATUS, status);
export function tituloStatusTone(status: string): BadgeTone {
  return status === "aberto" ? "warning" : status === "pago" ? "success" : "neutral";
}

const CAIXA_STATUS: Record<string, string> = { aberto: "Aberto", fechado: "Fechado" };
export const caixaStatusLabel = (status: string) => pick(CAIXA_STATUS, status);
export const caixaStatusTone = (status: string): BadgeTone => (status === "aberto" ? "success" : "neutral");
