import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];

export type InventarioOut = Schemas["InventarioOut"];
export type InventarioResumoOut = Schemas["InventarioResumoOut"];
export type InventarioFechadoOut = Schemas["InventarioFechadoOut"];
export type InventarioItemOut = Schemas["InventarioItemOut"];
export type InventarioCriarIn = Schemas["InventarioCriarIn"];

export const INVENTORY_STATUSES = ["aberto", "fechado", "cancelado"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const STATUS_LABELS: Record<InventoryStatus, string> = { aberto: "Aberto", fechado: "Fechado", cancelado: "Cancelado" };

export function statusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}
