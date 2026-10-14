import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api/errors";
import { applyServerError } from "@/lib/forms";

/**
 * Leva um erro do backend para o formulário.
 * - `codeFields`: códigos de erro de negócio que pertencem a um campo (ex.: sigla_em_uso -> sigla);
 * - `fields`: campos que podem vir em `detalhes` de um 422 de validação.
 * Devolve a mensagem geral a mostrar num Alert, ou null quando o erro virou mensagem de campo.
 */
export function mapServerError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, codeFields: Record<string, Path<T>>, fields: readonly Path<T>[]): string | null {
  if (error instanceof ApiError) {
    const target = codeFields[error.codigo];
    if (target) {
      setError(target, { type: "server", message: error.message });
      return null;
    }
  }
  const message = applyServerError(error, setError, fields);
  // Detalhes de campos que o formulário não mapeia (ex.: endereços) entram na mensagem geral.
  if (message && error instanceof ApiError && error.codigo === "validacao" && error.detalhes.length > 0) {
    return `${message} ${error.detalhes.map((d) => (d.campo ? `${d.campo}: ${d.mensagem}` : d.mensagem)).join("; ")}`;
  }
  return message;
}
