import type { Venda } from "@/components/pdv/types";
import { ReceiptHeader, ReceiptItem, ReceiptRow, ReceiptRule, ReceiptTotal } from "@/components/pdv/receipt";
import type { Empresa } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";
import { compareDecimal } from "@/lib/decimal";

const tresCasas = { minimumFractionDigits: 3, maximumFractionDigits: 3 };

/** "14/10/2026, 21:09:00" -> "14/10/2026 21:09:00", como no cupom de impressora. */
const dataDoCupom = (iso: string): string => formatDateTime(iso).replace(", ", " ");

/** Recibo da venda para impressão (renderizado dentro de <PrintArea>). Todos os valores vêm da API. */
export function VendaReceipt({ venda, empresa }: { venda: Venda; empresa?: Empresa | undefined }) {
  const temDesconto = compareDecimal(venda.desconto_total, "0") > 0;
  const temAcrescimo = compareDecimal(venda.acrescimo_total, "0") > 0;
  const temTaxa = compareDecimal(venda.taxa_servico, "0") > 0;

  return (
    <article className="rc" aria-label={`Recibo da venda ${venda.id}`}>
      <header>
        <ReceiptHeader empresa={empresa} />
        <ReceiptRule duplo />
        <p className="rc-secao">Cliente</p>
        <p className="rc-cliente">{venda.cliente?.nome ?? "Consumidor"}</p>
        <ReceiptRule />
        {venda.estorno && <p className="rc-stamp">VENDA ESTORNADA</p>}
        <h1 className="rc-titulo">Recibo de venda #{venda.id}</h1>
        <p>Data...: {dataDoCupom(venda.created_at)}</p>
        <p>Comanda: #{venda.comanda_id}</p>
        {venda.operador && <p>Operador: {venda.operador}</p>}
      </header>
      <ReceiptRule />

      {venda.itens.map((item, i) => (
        <ReceiptItem
          key={`${item.produto_id}-${i}`}
          codigo={item.produto_id}
          descricao={item.descricao}
          calculo={`${formatDecimal(item.quantidade, tresCasas)} x ${formatMoney(item.preco_unitario)} => ${formatMoney(item.total)}`}
        />
      ))}
      <ReceiptRule />

      <dl className="rc-block">
        <ReceiptRow label="Subtotal" value={formatMoney(venda.subtotal)} />
        {temDesconto && <ReceiptRow label="Descontos" value={`- ${formatMoney(venda.desconto_total)}`} />}
        {temAcrescimo && <ReceiptRow label="Acréscimos" value={formatMoney(venda.acrescimo_total)} />}
        {temTaxa && <ReceiptRow label="Taxa de serviço" value={formatMoney(venda.taxa_servico)} />}
      </dl>
      <ReceiptTotal label="TOTAL" value={formatMoney(venda.total)} />

      <dl className="rc-block">
        {venda.pagamentos.map((p) => (
          <div key={p.id}>
            <ReceiptRow label={`${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ""}`} value={formatMoney(p.valor)} />
            {p.valor_recebido && <ReceiptRow sub label="Recebido" value={formatMoney(p.valor_recebido)} />}
          </div>
        ))}
        {compareDecimal(venda.troco_total, "0") > 0 && <ReceiptRow strong label="TROCO" value={formatMoney(venda.troco_total)} />}
      </dl>

      <ReceiptRule duplo />
      <p className="rc-foot">Comprovante sem valor fiscal.</p>
    </article>
  );
}
