import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { usePrint } from "@/components/pdv/PrintArea";

/*
 * Folha de impressão simples: o próprio resultado do relatório (indicadores e tabelas), em preto e
 * branco, sem os gráficos (a tabela traz os mesmos números) e com as tabelas em formato de tabela
 * mesmo em página estreita (no celular elas viram cartões).
 */
const SHEET_CSS = `
@media print {
  .rp { font-size: 12px; }
  .rp > h1 { margin: 0 0 2px; font-size: 1.7em; font-weight: 700; }
  .rp > p { margin: 0 0 10px; }
  .rp [role="img"], .rp .rp-chart { display: none !important; }
  .rp section { margin: 0 0 14px; break-inside: avoid-page; }
  .rp dl { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .rp dl > div { padding: 6px 8px !important; border: 1px solid currentColor; border-radius: 0 !important; }
  .rp dd { font-size: 1.15em !important; }
  .rp a { text-decoration: none; }
  .rp table { display: table !important; min-width: 0 !important; width: 100%; }
  .rp thead { display: table-header-group !important; position: static !important; width: auto !important; height: auto !important; margin: 0 !important; overflow: visible !important; clip: auto !important; white-space: normal !important; }
  .rp tbody { display: table-row-group !important; }
  .rp tr { display: table-row !important; }
  .rp th, .rp td { display: table-cell !important; padding: 3px 6px !important; text-align: left; vertical-align: top; border-bottom: 1px solid currentColor; }
  .rp td > span[aria-hidden="true"] { display: none !important; }
  .rp .overflow-x-auto { overflow: visible !important; }
}
`;

export interface PrintReportProps {
  /** Título da folha (o mesmo da tela). */
  title: string;
  /** Linha sob o título (filtros aplicados, quando não aparecem no conteúdo). */
  subtitle?: string | undefined;
  /** O resultado do relatório, o mesmo que a tela mostra. */
  children: ReactNode;
}

/** Botão "Imprimir": monta a folha, chama `window.print()` e a desmonta ao terminar. */
export function PrintReport({ title, subtitle, children }: PrintReportProps) {
  const { print, printArea } = usePrint();
  return (
    <>
      <Button onClick={print}>Imprimir</Button>
      {printArea(
        <article className="rp">
          <style>{SHEET_CSS}</style>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
        </article>,
      )}
    </>
  );
}
