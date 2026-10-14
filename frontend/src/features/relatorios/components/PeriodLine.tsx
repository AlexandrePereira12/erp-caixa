import type { ReactNode } from "react";
import { formatDay } from "@/components/pdv/dates";

/** "Período: 01/10/2026 a 14/10/2026": a janela efetiva que o backend usou (datas sem fuso). */
export function PeriodLine({ de, ate, children }: { de: string; ate: string; children?: ReactNode }) {
  return (
    <p className="text-sm text-muted">
      Período:{" "}
      <span className="font-semibold text-fg">
        {formatDay(de)} a {formatDay(ate)}
      </span>
      {children}
    </p>
  );
}
