import type { ReactNode } from "react";

/**
 * Peças dos comprovantes impressos (recibo da venda, conferência da comanda). O estilo vive em
 * PRINT_CSS (PrintArea.tsx), sob a classe `.rc`: aqui só a estrutura.
 */
export function ReceiptRow({ label, value, strong, sub }: { label: string; value: ReactNode; strong?: boolean; sub?: boolean }) {
  return (
    <div className={`rc-row${strong ? " rc-strong" : ""}${sub ? " rc-sub" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Linha de total: bloco com filete duplo, o número que o cliente confere primeiro. */
export function ReceiptTotal({ label, value }: { label: string; value: string }) {
  return (
    <dl className="rc-totalbox">
      <div className="rc-total">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </dl>
  );
}
