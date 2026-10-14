import type { Comanda } from "@/components/pdv/types";
import { comandaLocal, comandaStatusLabel } from "@/components/pdv/labels";
import { ReceiptRow, ReceiptTotal } from "@/components/pdv/receipt";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";

/** Resumo da comanda para conferência (impressão). Todos os valores vêm da API; não é documento fiscal. */
export function ComandaReceipt({ comanda }: { comanda: Comanda }) {
  const ativos = comanda.itens.filter((i) => i.status === "ativo");
  const ajustes = comanda.ajustes.filter((a) => !a.removido);
  const t = comanda.totais;
  const cliente = comanda.cliente?.nome ?? comanda.nome_cliente;

  return (
    <article className="rc" aria-label={`Conferência da comanda ${comanda.id}`}>
      <header>
        <h1 className="rc-title">Conferência da comanda #{comanda.id}</h1>
        <dl className="rc-block">
          <ReceiptRow label="Local" value={comandaLocal(comanda)} />
          <ReceiptRow label="Aberta em" value={formatDateTime(comanda.aberta_em)} />
          {cliente && <ReceiptRow label="Cliente" value={cliente} />}
          {comanda.num_pessoas && <ReceiptRow label="Pessoas" value={comanda.num_pessoas} />}
          <ReceiptRow label="Situação" value={comandaStatusLabel(comanda.status)} />
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
          {ativos.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="rc-name">{item.descricao}</span>
                <span className="rc-unit">{formatMoney(item.preco_unitario)} un.</span>
                {item.observacao && <span className="rc-unit">Obs.: {item.observacao}</span>}
              </td>
              <td className="rc-num">{formatDecimal(item.quantidade)}</td>
              <td className="rc-num">{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="rc-block">
        <ReceiptRow label="Subtotal" value={formatMoney(t.subtotal)} />
        {ajustes.map((a) => (
          <ReceiptRow key={a.id} label={a.tipo === "desconto" ? "Desconto" : "Acréscimo"} value={`${a.tipo === "desconto" ? "- " : ""}${formatMoney(a.valor_calculado)}`} />
        ))}
        {compareDecimal(t.taxa_servico, "0") > 0 && <ReceiptRow label={`Taxa de serviço (${formatDecimal(comanda.taxa_servico_pct, { maximumFractionDigits: 2 })}%)`} value={formatMoney(t.taxa_servico)} />}
      </dl>
      <ReceiptTotal label="TOTAL" value={formatMoney(t.total)} />

      <p className="rc-foot">Conferência de consumo. Não é documento fiscal.</p>
    </article>
  );
}
