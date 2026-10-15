import type { Comanda } from "@/components/pdv/types";
import { comandaLocal, comandaStatusLabel } from "@/components/pdv/labels";
import { ReceiptHeader, ReceiptItem, ReceiptRow, ReceiptRule, ReceiptTotal } from "@/components/pdv/receipt";
import type { Empresa } from "@/lib/api/types";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal, formatMoney } from "@/lib/money";

const tresCasas = { minimumFractionDigits: 3, maximumFractionDigits: 3 };

/** Resumo da comanda para conferência (impressão). Todos os valores vêm da API; não é documento fiscal. */
export function ComandaReceipt({ comanda, empresa }: { comanda: Comanda; empresa?: Empresa | undefined }) {
  const ativos = comanda.itens.filter((i) => i.status === "ativo");
  const ajustes = comanda.ajustes.filter((a) => !a.removido);
  const t = comanda.totais;
  const cliente = comanda.cliente?.nome ?? comanda.nome_cliente;

  return (
    <article className="rc" aria-label={`Conferência da comanda ${comanda.id}`}>
      <header>
        <ReceiptHeader empresa={empresa} />
        <ReceiptRule duplo />
        <p className="rc-secao">Cliente</p>
        <p className="rc-cliente">{cliente ?? "Consumidor"}</p>
        <ReceiptRule />
        <h1 className="rc-titulo">Conferência da comanda #{comanda.id}</h1>
        <p>Local...: {comandaLocal(comanda)}</p>
        <p>Aberta..: {formatDateTime(comanda.aberta_em).replace(", ", " ")}</p>
        {comanda.num_pessoas && <p>Pessoas.: {comanda.num_pessoas}</p>}
        <p>Situação: {comandaStatusLabel(comanda.status)}</p>
      </header>
      <ReceiptRule />

      {ativos.map((item) => (
        <ReceiptItem
          key={item.id}
          codigo={item.produto_id}
          descricao={item.descricao}
          calculo={`${formatDecimal(item.quantidade, tresCasas)} x ${formatMoney(item.preco_unitario)} => ${formatMoney(item.total)}`}
          observacao={item.observacao}
        />
      ))}
      <ReceiptRule />

      <dl className="rc-block">
        <ReceiptRow label="Subtotal" value={formatMoney(t.subtotal)} />
        {ajustes.map((a) => (
          <ReceiptRow key={a.id} label={a.tipo === "desconto" ? "Desconto" : "Acréscimo"} value={`${a.tipo === "desconto" ? "- " : ""}${formatMoney(a.valor_calculado)}`} />
        ))}
        {compareDecimal(t.taxa_servico, "0") > 0 && <ReceiptRow label={`Taxa de serviço (${formatDecimal(comanda.taxa_servico_pct, { maximumFractionDigits: 2 })}%)`} value={formatMoney(t.taxa_servico)} />}
      </dl>
      <ReceiptTotal label="TOTAL" value={formatMoney(t.total)} />

      <ReceiptRule duplo />
      <p className="rc-foot">Conferência de consumo. Não é documento fiscal.</p>
    </article>
  );
}
