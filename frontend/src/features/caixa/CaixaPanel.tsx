import { useState, type ReactNode } from "react";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { ReasonDialog } from "@/components/pdv/ReasonDialog";
import { caixaStatusLabel, caixaStatusTone, movimentoLabel } from "@/components/pdv/labels";
import type { Caixa, MovimentoCaixa } from "@/components/pdv/types";
import { useToast } from "@/components/Toast";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { CAIXA_PAGE_SIZE, useCaixaMutations, useMovimentos } from "./api";
import { ConferenciaTabela } from "./CloseCaixaDialog";
import { MovementDialog, type MovementKind } from "./MovementDialog";

export interface CaixaPanelProps {
  caixa: Caixa;
  /** Pode registrar sangria/reforço e fechar (caixa.operar e dono do caixa, ou caixa.gerenciar_todos). */
  canOperate: boolean;
  /** Abre o fechamento. O diálogo vive na página, para sobreviver à mudança de estado do caixa. */
  onRequestClose: (caixa: Caixa) => void;
  /** Mostra o dono do caixa no resumo (histórico). */
  showOperator?: boolean;
}

/** Resumo do caixa (valores da API), movimentos paginados e ações. Usado em /caixa e em /caixas/:id. */
export function CaixaPanel({ caixa, canOperate, onRequestClose, showOperator = false }: CaixaPanelProps) {
  const { can } = usePermissions();
  const toast = useToast();
  const { reopen } = useCaixaMutations();
  const [offset, setOffset] = useState(0);
  const [movement, setMovement] = useState<MovementKind | null>(null);
  const [reopening, setReopening] = useState(false);
  const [showEsperado, setShowEsperado] = useState(false);
  const movimentos = useMovimentos(caixa.id, offset);

  const aberto = caixa.status === "aberto";
  // O esperado por forma revela o que deveria haver no caixa: fica oculto (fechamento cego) e só quem
  // gerencia todos os caixas pode mostrá-lo enquanto o caixa está aberto.
  const canSeeEsperado = can("caixa.gerenciar_todos");

  const columns: Column<MovimentoCaixa>[] = [
    { key: "quando", header: "Quando", cell: (m) => <span className="whitespace-nowrap text-muted">{formatDateTime(m.created_at)}</span> },
    { key: "tipo", header: "Tipo", cell: (m) => <span className="font-medium text-fg">{movimentoLabel(m.tipo)}</span> },
    { key: "forma", header: "Forma", cell: (m) => <span>{m.forma}</span> },
    { key: "descricao", header: "Descrição", cell: (m) => <span className="text-muted">{m.descricao ?? "—"}</span> },
    {
      key: "valor",
      header: "Valor",
      className: "md:text-right",
      headerClassName: "md:text-right",
      cell: (m) => <span className={`font-medium tabular-nums ${compareDecimal(m.valor, "0") < 0 ? "text-danger-text" : "text-fg"}`}>{formatMoney(m.valor)}</span>,
    },
    { key: "usuario", header: "Usuário", cell: (m) => <span className="text-muted">{m.usuario_nome ?? "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg">
              Caixa #{caixa.id}
              <Badge tone={caixaStatusTone(caixa.status)}>{caixaStatusLabel(caixa.status)}</Badge>
            </h2>
            <p className="text-sm text-muted">
              {showOperator && <>Operador: {caixa.operador.nome} · </>}
              Aberto em {formatDateTime(caixa.aberto_em)}
              {caixa.fechado_em && <> · Fechado em {formatDateTime(caixa.fechado_em)}</>}
              {caixa.rodada > 1 && <> · Reaberto {caixa.rodada - 1}×</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {aberto && canOperate && (
              <>
                <Button className="min-h-11" onClick={() => setMovement("sangria")}>
                  Sangria
                </Button>
                <Button className="min-h-11" onClick={() => setMovement("reforco")}>
                  Reforço
                </Button>
                <Button variant="primary" className="min-h-11" onClick={() => onRequestClose(caixa)}>
                  Fechar caixa
                </Button>
              </>
            )}
            {!aberto && can("caixa.reabrir") && (
              <Button className="min-h-11" onClick={() => setReopening(true)}>
                Reabrir caixa
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Valor de abertura" value={formatMoney(caixa.valor_abertura)} />
          <Stat label={`Vendas (${caixa.vendas_qtd})`} value={formatMoney(caixa.vendas_total)} />
          <Stat label="Sangrias" value={formatMoney(caixa.sangrias)} />
          <Stat label="Reforços" value={formatMoney(caixa.reforcos)} />
        </dl>
      </Card>

      {aberto && (
        <Card className="p-4">
          <h3 className="text-base font-semibold text-fg">Esperado por forma de pagamento</h3>
          {showEsperado && canSeeEsperado ? (
            <>
              <ul className="mt-2 divide-y divide-line text-sm">
                {caixa.esperado.map((s) => (
                  <li key={s.forma_pagamento_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-fg">{s.forma}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(s.esperado)}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-2 min-h-11" onClick={() => setShowEsperado(false)}>
                Ocultar valores esperados
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Oculto: o fechamento é cego, para a contagem não ser influenciada pelo valor esperado. A diferença só aparece depois de informar o contado.</p>
              {canSeeEsperado && (
                <Button className="mt-2 min-h-11" onClick={() => setShowEsperado(true)}>
                  Mostrar valores esperados
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {!aberto && (
        <Card className="p-4">
          <h3 className="mb-2 text-base font-semibold text-fg">Conferência do fechamento</h3>
          <ConferenciaTabela conferencias={caixa.conferencias} />
        </Card>
      )}

      <Card>
        <h3 className="border-b border-line px-4 py-3 text-base font-semibold text-fg">Movimentos</h3>
        <DataTable
          caption="Movimentos do caixa"
          columns={columns}
          rows={movimentos.data?.itens}
          getRowKey={(m) => m.id}
          isLoading={movimentos.isLoading}
          isFetching={movimentos.isFetching}
          error={movimentos.error}
          onRetry={() => void movimentos.refetch()}
          emptyTitle="Nenhum movimento ainda"
          emptyDescription="Vendas, recebimentos, sangrias e reforços deste caixa aparecem aqui."
        />
        {movimentos.data && !movimentos.error && (
          <Pagination total={movimentos.data.total} limite={CAIXA_PAGE_SIZE} deslocamento={offset} disabled={movimentos.isFetching} onChange={setOffset} />
        )}
      </Card>

      {movement && <MovementDialog caixaId={caixa.id} kind={movement} onClose={() => setMovement(null)} />}
      <ReasonDialog
        open={reopening}
        title={`Reabrir caixa #${caixa.id}`}
        description="O caixa volta a aceitar movimentos e um novo fechamento será necessário."
        label="Justificativa"
        confirmLabel="Reabrir caixa"
        tone="primary"
        onClose={() => setReopening(false)}
        onSubmit={async (justificativa) => {
          await reopen.mutateAsync({ caixaId: caixa.id, justificativa });
          toast.success("Caixa reaberto.");
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function CaixaNotice({ children }: { children: ReactNode }) {
  return <Alert tone="info">{children}</Alert>;
}
