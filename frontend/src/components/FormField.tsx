import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

export interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** Um único controle (Input, Select, Textarea, PasswordInput...); recebe id e aria-* automaticamente. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean }>;
}

/** Associa rótulo, dica e mensagem de erro ao controle via id/aria-describedby. */
export function FormField({ label, error, hint, required, className = "", children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  });

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-semibold text-fg">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-text">
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[0.8125rem] text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
