import type { Venda } from "@/components/pdv/types";
import { ReceiptRow, ReceiptTotal } from "@/components/pdv/receipt";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import { compareDecimal } from "@/lib/decimal";

/** Recibo da venda para impressão (renderizado dentro de <PrintArea>). Todos os valores vêm da API. */
export function VendaReceipt({ venda }: { venda: Venda }) {
  const temDesconto = compareDecimal(venda.desconto_total, "0") > 0;
  const temAcrescimo = compareDecimal(venda.acrescimo_total, "0") > 0;
  const temTaxa = compareDecimal(venda.taxa_servico, "0") > 0;

  return (
    <article className="rc" aria-label={`Recibo da venda ${venda.id}`}>
      <header>
        {venda.estorno && <p className="rc-stamp">VENDA ESTORNADA</p>}
        <h1 className="rc-title">Recibo de venda #{venda.id}</h1>
        <dl className="rc-block">
          <ReceiptRow label="Comanda" value={`#${venda.comanda_id}`} />
          <ReceiptRow label="Data" value={formatDateTime(venda.created_at)} />
          {venda.operador && <ReceiptRow label="Operador" value={venda.operador} />}
          {venda.cliente && <ReceiptRow label="Cliente" value={venda.cliente.nome} />}
        </dl>
      </header>

      <table className="rc-items">
        <thead>
          <tr>
            <th>Item</th>
            <th className="rc-num">Qtd</th>
            <th className="rc-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {venda.itens.map((item, i) => (
            <tr key={`${item.produto_id}-${i}`}>
              <td>
                <span className="rc-name">{item.descricao}</span>
                <span className="rc-unit">{formatMoney(item.preco_unitario)} un.</span>
              </td>
              <td className="rc-num">{formatDecimal(item.quantidade)}</td>
              <td className="rc-num">{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="rc-block">
        <ReceiptRow label="Subtotal" value={formatMoney(venda.subtotal)} />
        {temDesconto && <ReceiptRow label="Desconto" value={`- ${formatMoney(venda.desconto_total)}`} />}
        {temAcrescimo && <ReceiptRow label="Acréscimo" value={formatMoney(venda.acrescimo_total)} />}
        {temTaxa && <ReceiptRow label="Taxa de serviço" value={formatMoney(venda.taxa_servico)} />}
      </dl>
      <ReceiptTotal label="TOTAL" value={formatMoney(venda.total)} />

      <h2 className="rc-sec">Pagamentos</h2>
      <dl className="rc-block">
        {venda.pagamentos.map((p) => (
          <div key={p.id}>
            <ReceiptRow label={`${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ""}`} value={formatMoney(p.valor)} />
            {p.valor_recebido && <ReceiptRow sub label="Recebido" value={formatMoney(p.valor_recebido)} />}
            {p.troco && compareDecimal(p.troco, "0") > 0 && <ReceiptRow sub label="Troco" value={formatMoney(p.troco)} />}
          </div>
        ))}
        {compareDecimal(venda.troco_total, "0") > 0 && <ReceiptRow strong label="TROCO" value={formatMoney(venda.troco_total)} />}
      </dl>

      <p className="rc-foot">Comprovante sem valor fiscal.</p>
    </article>
  );
}
