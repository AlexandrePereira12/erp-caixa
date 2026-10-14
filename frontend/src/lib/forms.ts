import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError, errorMessage, fieldErrors } from "@/lib/api/errors";

/**
 * Leva os `detalhes` do backend para os campos do formulário. Devolve a mensagem geral a exibir
 * em um Alert, ou null quando o erro foi totalmente explicado por mensagens de campo.
 */
export function applyServerError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]): string | null {
  const byField = fieldErrors(error);
  let mapped = false;
  for (const field of fields) {
    const message = byField[field];
    if (message) {
      setError(field, { type: "server", message });
      mapped = true;
    }
  }
  if (mapped && error instanceof ApiError && error.codigo === "validacao") return null;
  return errorMessage(error);
}
