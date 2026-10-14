import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInventory, useInventoryMutations } from "./api";
import { ProgressBar } from "./ProgressBar";
import { statusLabel, type InventarioFechadoOut, type InventarioItemOut, type InventarioOut } from "./types";
import { useInventoryCounting, type RowState } from "./useInventoryCounting";
import { decimalToInput, formatSigned } from "@/features/catalogo/decimalInput";
import { Alert } from "@/components/Alert";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button, buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Checkbox, Input } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { ArrowLeftIcon, CheckIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/States";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { parsePositiveInt } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { compareDecimal } from "@/lib/decimal";
import { formatDateTime } from "@/lib/format";
import { formatDecimal } from "@/lib/money";
import { usePageTitle } from "@/lib/usePageTitle";

const STATUS_TONES: Record<string, BadgeTone> = { aberto: "brand", fechado: "success", cancelado: "neutral" };
/** Cor da diferença pelo sinal que a API devolveu (só comparação com zero, sem conta). */
const DIFF_TONES = { "-1": "text-danger-text", 0: "text-muted", 1: "text-success-text" } as const;

function CountInput({
  item,
  value,
  state,
  onChange,
  onCommit,
  onEnter,
  register,
}: {
  item: InventarioItemOut;
  value: string;
  state: RowState | undefined;
  onChange: (text: string) => void;
  onCommit: (text: string) => void;
  onEnter: (text: string) => void;
  register: (element: HTMLInputElement | null) => void;
}) {
  const errorId = `contagem-erro-${item.produto_id}`;
  const error = state?.status === "error" ? state.message : undefined;
  return (
    <div className="min-w-32">
      <div className="flex items-center gap-2">
        <Input
          ref={register}
          inputMode="decimal"
          autoComplete="off"
          className="max-w-36"
          aria-label={`Contagem de ${item.produto_nome} (${item.unidade})`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter(event.currentTarget.value);
            }
          }}
        />
        <span className="text-sm text-muted">{item.unidade}</span>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function RowStatus({ item, state }: { item: InventarioItemOut; state: RowState | undefined }) {
  if (state?.status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <Spinner /> Salvando…
      </span>
    );
  }
  if (state?.status === "error") return <span className="text-sm text-danger-text">Não salvo</span>;
  if (item.quantidade_contada !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-success-text">
        <CheckIcon width={16} height={16} /> Contado
      </span>
    );
  }
  return <span className="text-sm text-muted">Pendente</span>;
}

type Dialog = "close" | "cancel" | null;

export function InventoryDetailPage() {
  const { id: idParam } = useParams();
  const inventoryId = parsePositiveInt(idParam);
  const inventory = useInventory(inventoryId);
  usePageTitle(inventory.data ? `Inventário: ${inventory.data.descricao}` : "Inventário");

  return (
    <div>
      <Link to="/inventarios" className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-3 mb-3" })}>
        <ArrowLeftIcon width={16} height={16} />
        Inventários
      </Link>
      {inventoryId === undefined ? (
        <ErrorState error={new Error("invalid")} title="Inventário inválido" />
      ) : inventory.isLoading ? (
        <LoadingBlock />
      ) : inventory.error || !inventory.data ? (
        <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
      ) : (
        <InventoryView key={inventoryId} inventoryId={inventoryId} inventory={inventory.data} />
      )}
    </div>
  );
}

function InventoryView({ inventoryId, inventory }: { inventoryId: number; inventory: InventarioOut }) {
  const toast = useToast();
  const { can } = usePermissions();
  const { close, cancel } = useInventoryMutations();
  const counting = useInventoryCounting(inventoryId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [waiting, setWaiting] = useState<Exclude<Dialog, null> | null>(null);
  const [result, setResult] = useState<InventarioFechadoOut | null>(null);
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const isOpen = inventory.status === "aberto";
  const canCount = isOpen && can("inventarios.contar");
  const uncounted = inventory.itens.filter((item) => item.quantidade_contada === null).length;

  const term = search.trim().toLowerCase();
  const visible = inventory.itens.filter((item) => (!term || item.produto_nome.toLowerCase().includes(term)) && (!onlyPending || item.quantidade_contada === null));

  /** Espera as contagens em voo terminarem antes de abrir a confirmação (o número de não contados fica certo). */
  async function ask(kind: Exclude<Dialog, null>) {
    setWaiting(kind);
    try {
      await counting.idle();
    } finally {
      setWaiting(null);
    }
    setDialog(kind);
  }

  function focusNext(item: InventarioItemOut) {
    const index = visible.findIndex((candidate) => candidate.produto_id === item.produto_id);
    const next = visible[index + 1];
    if (next) inputs.current.get(next.produto_id)?.focus();
  }

  const editableColumns: Column<InventarioItemOut>[] = [
    {
      key: "produto",
      header: "Produto",
      cell: (item) => (
        <div className="min-w-40">
          <p className="font-medium text-fg">{item.produto_nome}</p>
        </div>
      ),
    },
    { key: "sistema", label: "No sistema", header: "No sistema", cell: (item) => <span className="whitespace-nowrap tabular-nums">{formatDecimal(item.quantidade_sistema)} {item.unidade}</span> },
    {
      key: "contagem",
      label: "Contagem",
      header: "Contagem",
      cell: (item) =>
        canCount ? (
          <CountInput
            item={item}
            value={counting.drafts[item.produto_id] ?? decimalToInput(item.quantidade_contada, { trim: true })}
            state={counting.rows[item.produto_id]}
            onChange={(text) => counting.setDraft(item.produto_id, text)}
            onCommit={(text) => counting.commit(item, text)}
            onEnter={(text) => {
              counting.commit(item, text);
              focusNext(item);
            }}
            register={(element) => {
              if (element) inputs.current.set(item.produto_id, element);
              else inputs.current.delete(item.produto_id);
            }}
          />
        ) : item.quantidade_contada === null ? (
          <span className="text-muted">Não contado</span>
        ) : (
          <span>{formatDecimal(item.quantidade_contada)} {item.unidade}</span>
        ),
    },
    { key: "situacao", label: "Situação", header: "Situação", cell: (item) => <RowStatus item={item} state={counting.rows[item.produto_id]} /> },
  ];

  const readOnlyColumns: Column<InventarioItemOut>[] = [
    { key: "produto", header: "Produto", cell: (item) => <span className="font-medium text-fg">{item.produto_nome}</span> },
    { key: "sistema", label: "No sistema", header: "No sistema", cell: (item) => <span className="whitespace-nowrap tabular-nums">{formatDecimal(item.quantidade_sistema)} {item.unidade}</span> },
    {
      key: "contada",
      label: "Contada",
      header: "Contada",
      cell: (item) => (item.quantidade_contada === null ? <span className="text-muted">Não contado</span> : <span className="whitespace-nowrap tabular-nums">{formatDecimal(item.quantidade_contada)} {item.unidade}</span>),
    },
    {
      key: "diferenca",
      label: "Diferença",
      header: "Diferença",
      cell: (item) =>
        item.diferenca === null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={`whitespace-nowrap font-medium ${DIFF_TONES[compareDecimal(item.diferenca, "0")]}`}>
            {formatSigned(item.diferenca)} {item.unidade}
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={inventory.descricao}
        description={`Inventário #${inventory.id} · aberto em ${formatDateTime(inventory.created_at)}${inventory.fechado_em ? ` · fechado em ${formatDateTime(inventory.fechado_em)}` : ""}`}
        actions={
          isOpen && (
            <>
              {can("inventarios.criar") && (
                <Button loading={waiting === "cancel"} disabled={waiting !== null} onClick={() => void ask("cancel")}>
                  Cancelar inventário
                </Button>
              )}
              {can("inventarios.fechar") && (
                <Button variant="primary" loading={waiting === "close"} disabled={waiting !== null} onClick={() => void ask("close")}>
                  Fechar inventário
                </Button>
              )}
            </>
          )
        }
      />

      <div className="space-y-4">
        {result && (
          <Alert tone="success" title="Inventário fechado">
            {result.ajustados} produto(s) ajustado(s) e {result.nao_contados} não contado(s). Produtos não contados mantêm o saldo que tinham.
          </Alert>
        )}
        {!isOpen && (
          <Alert tone="info">
            Este inventário está {statusLabel(inventory.status).toLowerCase()} e é somente leitura.
            {inventory.status === "fechado" && " A diferença é calculada pelo sistema no fechamento: contagem menos o saldo do estoque naquele momento."}
          </Alert>
        )}
        {isOpen && !canCount && <Alert tone="info">Você pode ver este inventário, mas não tem permissão para lançar contagens.</Alert>}

        <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div>
            <p className="text-xs text-muted">Status</p>
            <Badge tone={STATUS_TONES[inventory.status] ?? "neutral"}>{statusLabel(inventory.status)}</Badge>
          </div>
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-xs text-muted">Progresso da contagem</p>
            <ProgressBar counted={inventory.itens_contados} total={inventory.total_itens} label="Progresso da contagem" />
          </div>
        </Card>

        <Card>
          <form role="search" aria-label="Filtrar produtos do inventário" onSubmit={(event) => event.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-[2fr_auto] sm:items-end">
            <FormField label="Buscar produto">
              <Input type="search" placeholder="Nome do produto" value={search} onChange={(event) => setSearch(event.target.value)} />
            </FormField>
            {isOpen && (
              <div className="flex h-10 items-center">
                <Checkbox label="Só pendentes" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
              </div>
            )}
          </form>
          <DataTable
            caption={isOpen ? "Contagem de produtos" : "Resultado do inventário"}
            columns={isOpen ? editableColumns : readOnlyColumns}
            rows={visible}
            getRowKey={(item) => item.produto_id}
            emptyTitle="Nenhum produto encontrado"
            emptyDescription="Ajuste a busca ou o filtro."
          />
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === "close"}
        title="Fechar inventário"
        description={
          <div className="space-y-2">
            <p>
              Fechar <strong>{inventory.descricao}</strong>? Os produtos contados terão o saldo ajustado para a quantidade contada. Esta ação não pode ser desfeita.
            </p>
            <p>
              {uncounted === 0 ? (
                "Todos os itens foram contados."
              ) : (
                <>
                  <strong>{uncounted}</strong> {uncounted === 1 ? "item não foi contado e não será alterado" : "itens não foram contados e não serão alterados"}.
                </>
              )}
            </p>
            {counting.errorCount > 0 && <p className="text-danger-text">{counting.errorCount} contagem(ns) com erro não foram salvas e serão ignoradas.</p>}
          </div>
        }
        confirmLabel="Fechar inventário"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await counting.idle();
          const closed = await close.mutateAsync(inventoryId);
          setResult(closed);
          toast.success(`Inventário fechado: ${closed.ajustados} ajustado(s), ${closed.nao_contados} não contado(s).`);
        }}
      />
      <ConfirmDialog
        open={dialog === "cancel"}
        title="Cancelar inventário"
        description={<>Cancelar <strong>{inventory.descricao}</strong>? As contagens lançadas serão descartadas e o saldo do estoque não será alterado.</>}
        confirmLabel="Cancelar inventário"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await counting.idle();
          await cancel.mutateAsync(inventoryId);
          toast.success("Inventário cancelado.");
        }}
      />
    </>
  );
}
