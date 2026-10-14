import { useMemo } from "react";
import { Checkbox } from "@/components/controls";
import type { PermissaoOut } from "@/lib/api/types";
import { moduleLabel } from "@/lib/labels";

export interface PermissionMatrixProps {
  catalog: PermissaoOut[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function groupByModule(permissions: PermissaoOut[]): [string, PermissaoOut[]][] {
  const groups = new Map<string, PermissaoOut[]>();
  for (const p of permissions) {
    const list = groups.get(p.modulo) ?? [];
    list.push(p);
    groups.set(p.modulo, list);
  }
  return [...groups.entries()];
}

/** Checklist de permissões agrupada por módulo, com "selecionar todas" por grupo. */
export function PermissionMatrix({ catalog, value, onChange, disabled = false }: PermissionMatrixProps) {
  const groups = useMemo(() => groupByModule(catalog), [catalog]);
  const selected = useMemo(() => new Set(value), [value]);

  function toggle(codes: string[], checked: boolean) {
    const next = new Set(selected);
    for (const code of codes) {
      if (checked) next.add(code);
      else next.delete(code);
    }
    onChange([...next]);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(([modulo, items]) => {
        const codes = items.map((p) => p.codigo);
        const count = codes.filter((c) => selected.has(c)).length;
        return (
          <fieldset key={modulo} className="min-w-0 rounded-md border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-fg">{moduleLabel(modulo)}</legend>
            <Checkbox
              label="Selecionar todas"
              className="mb-2 border-b border-line pb-2"
              checked={count === codes.length}
              disabled={disabled}
              ref={(el) => {
                if (el) el.indeterminate = count > 0 && count < codes.length;
              }}
              onChange={(event) => toggle(codes, event.target.checked)}
              aria-label={`Selecionar todas as permissões de ${moduleLabel(modulo)}`}
            />
            <div className="space-y-2">
              {items.map((p) => (
                <Checkbox key={p.codigo} label={p.descricao} description={p.codigo} checked={selected.has(p.codigo)} disabled={disabled} onChange={(event) => toggle([p.codigo], event.target.checked)} />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
