/** Escolha única em botões grandes (radio escondido, rótulo clicável com ≥44px). */
export function Choice<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  columns = 2,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-fg">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map(([optionValue, label]) => (
          <label
            key={optionValue}
            className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${value === optionValue ? "border-brand bg-brand-soft text-brand-text" : "border-line-strong bg-surface text-fg hover:bg-surface-2"}`}
          >
            <input type="radio" name={name} className="sr-only" checked={value === optionValue} onChange={() => onChange(optionValue)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
