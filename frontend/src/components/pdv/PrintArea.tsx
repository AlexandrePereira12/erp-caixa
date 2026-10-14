import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * Impressão limpa sem mexer no layout do app: o conteúdo a imprimir vai para um portal direto
 * em <body> e, em @media print, todo o resto do <body> (app, menus, diálogos, avisos) some.
 * Na tela o portal fica oculto. O recibo sai sempre preto no branco, mesmo no tema escuro.
 */
const PRINT_CSS = `
@media screen { .print-root { display: none; } }
@media print {
  @page { margin: 8mm; }
  body > *:not(.print-root) { display: none !important; }
  html, body { background: #fff !important; color: #000 !important; }
  .print-root { display: block; color-scheme: light; background: #fff; color: #000; font-size: 12px; line-height: 1.35; }
  .print-root, .print-root * { color: #000 !important; background: transparent !important; border-color: #000 !important; box-shadow: none !important; }
  .print-root table { width: 100%; border-collapse: collapse; }
  .print-root tr { break-inside: avoid; }

  /* Comprovante (recibo e conferência): máquina de escrever, título serifado, valores à direita. */
  .rc { max-width: 80mm; margin: 0 auto; font-family: "Courier Prime", ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.4; }
  .rc-title { margin: 0 0 8px; font-family: "Fraunces Variable", Georgia, serif; font-variation-settings: "SOFT" 100; font-size: 1.75em; font-weight: 700; line-height: 1.1; }
  .rc-stamp { display: inline-block; margin: 0 0 8px; padding: 1px 8px; border: 2px solid #000; border-radius: 3px; font-weight: 700; letter-spacing: 0.08em; transform: rotate(-2deg); }
  .rc-block { margin: 0; padding: 8px 0; }
  header .rc-block { padding: 0 0 10px; border-bottom: 1px dashed #000; }
  .rc-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1em; padding: 1px 0; }
  .rc-row dt { flex: none; }
  .rc-row dd { margin: 0; min-width: 0; text-align: right; overflow-wrap: anywhere; }
  .rc-row.rc-sub { padding-left: 1.4em; }
  .rc-row.rc-strong { font-weight: 700; }
  .rc-items { margin-top: 8px; }
  .rc-items th { padding: 0 0 4px; border-bottom: 1px solid #000; font-weight: 700; text-align: left; }
  .rc-items td { padding: 5px 0; border-bottom: 1px dotted #000; vertical-align: top; }
  .rc-items .rc-num { padding-left: 0.8em; text-align: right; white-space: nowrap; }
  .rc-name { display: block; font-weight: 700; line-height: 1.25; }
  .rc-unit { display: block; font-size: 0.9em; }
  .rc-totalbox { margin: 0; }
  .rc-total { display: flex; align-items: baseline; justify-content: space-between; margin: 6px 0 4px; padding: 6px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 1.5em; font-weight: 700; }
  .rc-total dd { margin: 0; }
  .rc-sec { margin: 10px 0 0; font-size: 1em; font-weight: 700; }
  .rc-foot { margin: 12px 0 0; padding-top: 8px; border-top: 1px dashed #000; font-size: 0.9em; text-align: center; }
}
`;

function PrintDocument({ children, onAfterPrint }: { children: ReactNode; onAfterPrint: () => void }) {
  useEffect(() => {
    window.addEventListener("afterprint", onAfterPrint, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [onAfterPrint]);

  return createPortal(
    <div className="print-root" data-testid="print-root">
      <style>{PRINT_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Hook de impressão: `print()` monta o conteúdo, chama window.print() e desmonta no `afterprint`.
 * Render `{printArea(<Recibo />)}` na tela que imprime.
 */
export function usePrint() {
  const [round, setRound] = useState(0);
  const [active, setActive] = useState(false);
  const print = useCallback(() => {
    setRound((r) => r + 1);
    setActive(true);
  }, []);
  const done = useCallback(() => setActive(false), []);
  const printArea = useCallback(
    (content: ReactNode) =>
      active ? (
        <PrintDocument key={round} onAfterPrint={done}>
          {content}
        </PrintDocument>
      ) : null,
    [active, round, done],
  );
  return { print, printArea };
}
