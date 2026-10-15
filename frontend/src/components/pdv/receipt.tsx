import type { ReactNode } from "react";
import { maskCnpj, maskPhone } from "@/features/cadastros/masks";
import type { Empresa } from "@/lib/api/types";

/**
 * Peças dos comprovantes impressos, no formato de cupom de impressora térmica (80 mm, fonte
 * monoespaçada, filetes tracejados). O estilo vive em PRINT_CSS (PrintArea.tsx), sob a classe `.rc`:
 * aqui só a estrutura.
 */

/** Cabeçalho do cupom: dados da empresa; cada linha só aparece se foi preenchida nas configurações. */
export function ReceiptHeader({ empresa }: { empresa: Empresa | undefined }) {
  if (!empresa) return null;
  return (
    <div className="rc-empresa">
      <p className="rc-nome">{empresa.nome_exibicao}</p>
      {empresa.endereco && <p>{empresa.endereco}</p>}
      {empresa.telefone && <p>Fone(s) {maskPhone(empresa.telefone)}</p>}
      {empresa.cnpj && <p>CNPJ {maskCnpj(empresa.cnpj)}</p>}
      {empresa.email_contato && <p>{empresa.email_contato}</p>}
    </div>
  );
}

/** Filete do cupom: tracejado entre blocos, duplo para abrir e fechar o cupom. */
export function ReceiptRule({ duplo }: { duplo?: boolean }) {
  return <hr className={`rc-hr${duplo ? " rc-hr-duplo" : ""}`} />;
}

/** Linha `rótulo ........ valor`: rótulo à esquerda, valor à direita. */
export function ReceiptRow({ label, value, strong, sub }: { label: string; value: ReactNode; strong?: boolean; sub?: boolean }) {
  return (
    <div className={`rc-row${strong ? " rc-strong" : ""}${sub ? " rc-sub" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Item em duas linhas: `código DESCRIÇÃO` e `qtd x unitário => total`. */
export function ReceiptItem({ codigo, descricao, calculo, observacao }: { codigo: number; descricao: string; calculo: string; observacao?: string | null }) {
  return (
    <div className="rc-item">
      <p className="rc-item-nome">
        {codigo} {descricao}
      </p>
      <p className="rc-item-calculo">{calculo}</p>
      {observacao && <p className="rc-item-obs">Obs.: {observacao}</p>}
    </div>
  );
}

/** Linha de total: o número que o cliente confere primeiro, entre dois filetes. */
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
