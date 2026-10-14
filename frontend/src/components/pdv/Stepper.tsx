import { addDecimal, compareDecimal, parseDecimalInput, subDecimal } from "@/lib/decimal";
import { PlusIcon } from "@/components/icons";
import { MinusIcon } from "./icons";

/** Casas decimais -> passo do botão (+/-): unidades inteiras andam de 1 em 1; fracionárias de 0,1 em 0,1. */
export function stepFor(casasDecimais: number): string {
  return casasDecimais > 0 ? "0.1" : "1";
}

export interface StepperProps {
  label: string;
  /** Texto digitado (aceita vírgula). */
  value: string;
  onChange: (value: string) => void;
  /** Casas decimais da unidade (escala permitida). */
  casas: number;
  /** Menor quantidade aceita (ex.: a atual do item, que só pode aumentar). */
  min?: string;
}

/** Quantidade com botões +/- (≥44px) e campo numérico; trabalha só com strings decimais. */
export function Stepper({ label, value, onChange, casas, min = "0" }: StepperProps) {
  const step = stepFor(casas);
  const parsed = parseDecimalInput(value, casas);

  function bump(direction: 1 | -1) {
    const base = parsed ?? min;
    const next = direction === 1 ? addDecimal(base, step) : subDecimal(base, step);
    const floor = compareDecimal(min, "0") > 0 ? min : step;
    onChange((compareDecimal(next, floor) < 0 ? floor : next).replace(".", ","));
  }

  const atMin = parsed !== null && compareDecimal(parsed, compareDecimal(min, "0") > 0 ? min : step) <= 0;

  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={atMin}
        aria-label={`Diminuir ${label.toLowerCase()}`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line-strong bg-surface text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MinusIcon />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block min-h-11 w-24 rounded-md border border-control-line bg-input px-3 text-center text-fg aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger-text"
        aria-invalid={value.trim() !== "" && parsed === null ? true : undefined}
      />
      <button
        type="button"
        onClick={() => bump(1)}
        aria-label={`Aumentar ${label.toLowerCase()}`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line-strong bg-surface text-fg hover:bg-surface-2"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
