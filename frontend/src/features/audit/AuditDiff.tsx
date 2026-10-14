import { useState } from "react";
import { diffRows, formatValue, isSensitiveKey, type DiffRow, type JsonObject } from "./diff";
import { Badge } from "@/components/Badge";
import { Checkbox } from "@/components/controls";

function Cell({ row, side }: { row: DiffRow; side: "antes" | "depois" }) {
  const present = side === "antes" ? row.hasAntes : row.hasDepois;
  const value = side === "antes" ? row.antes : row.depois;
  if (!present) return <span className="text-muted">—</span>;
  if (isSensitiveKey(row.campo)) {
    return (
      <span className="text-muted">
        ••••••••<span className="sr-only"> (valor oculto)</span>
      </span>
    );
  }
  const text = formatValue(value);
  const tone = !row.changed ? "text-fg" : side === "antes" ? "bg-danger-soft text-danger-text" : "bg-success-soft text-success-text";
  return (
    <pre className={`whitespace-pre-wrap break-words rounded px-1.5 py-0.5 font-mono text-xs ${tone}`}>
      {row.changed && (
        <span aria-hidden="true" className="mr-1 select-none font-bold">
          {side === "antes" ? "−" : "+"}
        </span>
      )}
      {text}
    </pre>
  );
}

/** Diff campo a campo entre antes e depois, com cor e símbolo (+/−) para não depender só da cor. */
export function AuditDiff({ antes, depois, camposAlterados }: { antes: JsonObject | null; depois: JsonObject | null; camposAlterados: string[] | null }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const rows = diffRows(antes, depois, camposAlterados);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Este registro não guardou valores de antes/depois.</p>;
  }

  const changed = rows.filter((r) => r.changed);
  const visible = showUnchanged ? rows : changed;
  const kind = antes === null && depois !== null ? "Criação" : depois === null && antes !== null ? "Exclusão" : "Alteração";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{kind}</Badge>
        <span className="text-sm text-muted">{changed.length} campo(s) alterado(s)</span>
        {changed.length > 0 && changed.length < rows.length && <Checkbox className="ml-auto" label="Mostrar campos sem alteração" checked={showUnchanged} onChange={(e) => setShowUnchanged(e.target.checked)} />}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Campos do registro antes e depois da alteração</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-semibold text-muted">
              <th scope="col" className="px-3 py-2 font-semibold">Campo</th>
              <th scope="col" className="px-3 py-2 font-semibold">Antes</th>
              <th scope="col" className="px-3 py-2 font-semibold">Depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => (
              <tr key={row.campo} className="align-top">
                <th scope="row" className="px-3 py-2 font-mono text-xs font-medium text-fg">
                  {row.campo}
                </th>
                <td className="px-3 py-2">
                  <Cell row={row} side="antes" />
                </td>
                <td className="px-3 py-2">
                  <Cell row={row} side="depois" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
