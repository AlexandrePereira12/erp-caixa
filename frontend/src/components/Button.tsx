import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border font-semibold leading-none transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55";
const variants: Record<ButtonVariant, string> = {
  primary: "border-brand bg-brand text-on-brand hover:border-brand-hover hover:bg-brand-hover",
  secondary: "border-line-strong bg-surface text-fg hover:bg-surface-2",
  danger: "border-danger bg-danger text-on-danger hover:border-danger-hover hover:bg-danger-hover",
  ghost: "border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-fg",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.84rem]",
  md: "h-10 px-4 text-[0.84rem]",
};

/** Classes de botão, também usadas em <Link> que deve parecer botão. */
export function buttonClasses({ variant = "secondary", size = "md", className = "" }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading = false, disabled, className, type = "button", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, ...(className ? { className } : {}) })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});
