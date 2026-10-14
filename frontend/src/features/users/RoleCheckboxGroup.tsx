import { Checkbox } from "@/components/controls";
import type { PapelOut } from "@/lib/api/types";

export interface RoleCheckboxGroupProps {
  roles: PapelOut[];
  value: number[];
  onChange: (value: number[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function RoleCheckboxGroup({ roles, value, onChange, error, disabled }: RoleCheckboxGroupProps) {
  function toggle(id: number, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  }
  return (
    <fieldset aria-describedby={error ? "papeis-erro" : undefined} className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-fg">
        Papéis
        <span aria-hidden="true" className="ml-0.5 text-danger-text">
          *
        </span>
      </legend>
      <div className="grid gap-2 rounded-md border border-line-strong p-3 sm:grid-cols-2">
        {roles.map((role) => (
          <Checkbox
            key={role.id}
            label={role.nome}
            {...(role.descricao ? { description: role.descricao } : {})}
            checked={value.includes(role.id)}
            disabled={disabled ?? false}
            onChange={(event) => toggle(role.id, event.target.checked)}
          />
        ))}
      </div>
      {error && (
        <p id="papeis-erro" className="mt-1 text-sm text-danger-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}
