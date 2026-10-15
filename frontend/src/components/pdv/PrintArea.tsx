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

  /*
   * Cupom (recibo e conferência), no jeito de impressora térmica: 80 mm, fonte monoespaçada do sistema
   * (não precisa empacotar fonte), sem cor, filetes tracejados entre os blocos e duplos nas pontas.
   * O @page acima é o dos relatórios (A4): aqui só a largura da coluna muda.
   */
  .rc { max-width: 80mm; margin: 0 auto; font-family: "DejaVu Sans Mono", "Liberation Mono", Consolas, "Courier New", monospace; font-size: 11px; line-height: 1.35; font-variant-numeric: tabular-nums; }
  .rc p { margin: 0; overflow-wrap: anywhere; }
  .rc-empresa { text-align: center; }
  .rc-nome { font-size: 1.2em; font-weight: 700; text-transform: uppercase; }
  .rc-hr { height: 0; margin: 6px 0; border: 0; border-top: 1px dashed #000; }
  .rc-hr-duplo { border-top: 3px double #000; }
  .rc-secao { font-weight: 700; text-transform: uppercase; }
  .rc-cliente { text-transform: uppercase; }
  .rc-titulo { margin: 0 0 4px; font-size: 1em; font-weight: 700; text-align: center; text-transform: uppercase; }
  .rc-stamp { margin: 0 0 4px; padding: 1px 6px; border: 2px solid #000; font-weight: 700; text-align: center; letter-spacing: 0.08em; }
  .rc-item { padding: 2px 0; break-inside: avoid; }
  .rc-item-nome { text-transform: uppercase; }
  .rc-item-calculo { padding-left: 0.5em; }
  .rc-item-obs { padding-left: 0.5em; font-size: 0.95em; }
  .rc-block { margin: 0; padding: 2px 0; }
  .rc-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1em; padding: 1px 0; text-transform: uppercase; }
  .rc-row dt { flex: none; }
  .rc-row dd { margin: 0; min-width: 0; text-align: right; overflow-wrap: anywhere; }
  .rc-row.rc-sub { padding-left: 1.4em; }
  .rc-row.rc-strong { font-weight: 700; }
  .rc-totalbox { margin: 0; }
  .rc-total { display: flex; align-items: baseline; justify-content: space-between; margin: 4px 0; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: 1.3em; font-weight: 700; }
  .rc-total dd { margin: 0; }
  .rc-foot { text-align: center; }
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
