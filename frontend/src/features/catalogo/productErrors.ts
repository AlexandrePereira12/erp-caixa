import { ApiError } from "@/lib/api/errors";

/** Mensagens claras para recusas de exclusão de produto; os demais erros seguem como vieram do backend. */
export function explainProductDeleteError(error: unknown): unknown {
  if (error instanceof ApiError) {
    if (error.codigo === "produto_em_uso") {
      return new ApiError(error.status, error.codigo, "Não é possível excluir: este produto é insumo na ficha técnica de outro produto. Remova-o dessa ficha técnica e tente de novo.", error.detalhes);
    }
    if (error.codigo === "produto_com_saldo") {
      return new ApiError(error.status, error.codigo, "Não é possível excluir: o produto ainda tem saldo em estoque. Zere o saldo (ajuste ou inventário) e tente de novo.", error.detalhes);
    }
  }
  return error;
}
