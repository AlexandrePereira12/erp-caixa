import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

/* Botão "de apertar": a base é uma sombra sólida que some ao pressionar. */
const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[background-color,border-color,box-shadow,transform] duration-100 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:translate-y-0";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand shadow-[0_2px_0_0_rgb(0_0_0/0.22)] hover:bg-brand-hover active:shadow-[0_1px_0_0_rgb(0_0_0/0.22)]",
  secondary: "border border-line-strong/70 bg-surface text-fg shadow-[0_1px_0_0_var(--c-line)] hover:border-fg/70 hover:bg-surface-2",
  danger: "bg-danger text-on-brand shadow-[0_2px_0_0_rgb(0_0_0/0.22)] hover:bg-danger-hover active:shadow-[0_1px_0_0_rgb(0_0_0/0.22)]",
  ghost: "text-fg hover:bg-surface-2",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-10 px-4.5 text-sm",
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
