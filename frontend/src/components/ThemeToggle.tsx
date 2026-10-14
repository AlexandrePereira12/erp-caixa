import { useRef, type KeyboardEvent } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Tema claro", icon: SunIcon },
  { value: "system", label: "Tema do sistema", icon: MonitorIcon },
  { value: "dark", label: "Tema escuro", icon: MoonIcon },
];

/**
 * Alternância de tema (claro, sistema, escuro): grupo de opções exclusivas (radiogroup) com setas
 * do teclado. A escolha é salva neste navegador.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const current = useThemePreference();
  const refs = useRef(new Map<ThemePreference, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % OPTIONS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    if (next === null) return;
    event.preventDefault();
    const option = OPTIONS[next];
    if (!option) return;
    setThemePreference(option.value);
    refs.current.get(option.value)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={`inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-[3px] ${className}`}>
      {OPTIONS.map((option, index) => {
        const checked = option.value === current;
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (el) refs.current.set(option.value, el);
              else refs.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => setThemePreference(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors motion-reduce:transition-none ${
              checked ? "bg-surface text-fg shadow-[0_0_0_1px_var(--c-line-strong)]" : "text-muted hover:text-fg"
            }`}
          >
            <option.icon width={15} height={15} />
          </button>
        );
      })}
    </div>
  );
}
