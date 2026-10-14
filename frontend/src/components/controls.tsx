import { forwardRef, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

const control =
  "block w-full rounded-md border border-line-strong/80 bg-surface px-3 py-2 text-fg shadow-[inset_0_1px_2px_rgb(70_45_10/0.07)] transition-colors placeholder:text-muted hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:border-2";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`${control} h-10 ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={`${control} ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${control} h-10 ${className}`} {...rest}>
      {children}
    </select>
  );
});

/** Campo de senha com botão mostrar/ocultar. `id`, aria-* e ref repassados ao <input>. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput(
  { className = "", ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={visible ? "text" : "password"} className={`${control} h-10 pr-11 ${className}`} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-fg"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

/** Checkbox com rótulo clicável (label envolve o input). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, className = "", ...rest }, ref) {
  return (
    <label className={`flex items-start gap-2.5 ${rest.disabled ? "opacity-70" : "cursor-pointer"} ${className}`}>
      <input ref={ref} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand" {...rest} />
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
});
