import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input, Textarea } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { SearchIcon } from "@/components/icons";
import { PlusIcon } from "@/components/icons";
import { Stepper } from "@/components/pdv/Stepper";
import type { Produto } from "@/components/pdv/types";
import { Alert } from "@/components/Alert";
import { ErrorState, LoadingBlock } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import { compareDecimal, parseDecimalInput } from "@/lib/decimal";
import { formatMoney } from "@/lib/money";
import { PRODUTOS_LIMIT, produtosVendaveisQuery, useCategorias, useProdutosVendaveis } from "./api";

export interface ProductPanelProps {
  /** Lança o item: toque simples usa quantidade "1". Rejeita com o erro do backend. */
  onAdd: (produto: Produto, quantidade: string, observacao?: string) => Promise<unknown>;
}

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const semEstoque = (p: Produto) => p.controla_estoque && p.saldo !== null && compareDecimal(p.saldo, "0") <= 0;

/** Painel de produtos: busca (nome/código/código de barras), categorias e toque para lançar. */
export function ProductPanel({ onAdd }: ProductPanelProps) {
  const toast = useToast();
  const client = useQueryClient();
  const searchId = useId();
  const [term, setTerm] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | undefined>();
  const [detail, setDetail] = useState<Produto | null>(null);
  const q = useDebounced(term.trim());

  const categorias = useCategorias();
  const produtos = useProdutosVendaveis({ q, categoriaId });
  const items = produtos.data?.itens ?? [];

  async function add(produto: Produto, quantidade = "1", observacao?: string) {
    try {
      await onAdd(produto, quantidade, observacao);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  function quickAdd(produto: Produto) {
    void add(produto).catch(() => undefined);
  }

  async function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Leitor de código de barras: digita o código e envia Enter em poucos milissegundos, antes da busca
    // com debounce rodar. Por isso a consulta é feita na hora, sem depender da lista que está na tela.
    if (event.key !== "Enter") return;
    event.preventDefault();
    const typed = term.trim();
    if (!typed) return;
    try {
      const page = await client.fetchQuery({ ...produtosVendaveisQuery({ q: typed }), staleTime: 0 });
      const found = page.itens.find((p) => p.codigo_barras === typed || p.codigo === typed) ?? (page.itens.length === 1 ? page.itens[0] : undefined);
      if (!found) {
        toast.error(`Nenhum produto encontrado para “${typed}”.`);
        return;
      }
      setTerm("");
      await add(found).catch(() => undefined);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-label="Produtos" className="space-y-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Buscar produto por nome, código ou código de barras
        </label>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
        <Input
          id={searchId}
          type="search"
          className="min-h-11 pl-9"
          placeholder="Buscar por nome, código ou código de barras"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => void onSearchKeyDown(e)}
          autoComplete="off"
        />
      </div>

      {categorias.data && categorias.data.length > 0 && (
        <div role="group" aria-label="Categorias" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <CategoryChip active={categoriaId === undefined} onClick={() => setCategoriaId(undefined)}>
            Todas
          </CategoryChip>
          {categorias.data.map((c) => (
            <CategoryChip key={c.id} active={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>
              {c.nome}
            </CategoryChip>
          ))}
        </div>
      )}

      {produtos.isLoading ? (
        <LoadingBlock label="Carregando produtos…" />
      ) : produtos.error ? (
        <ErrorState error={produtos.error} onRetry={() => void produtos.refetch()} />
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {q || categoriaId ? "Nenhum produto encontrado para este filtro." : "Nenhum produto disponível para venda."}
        </p>
      ) : (
        <>
          <ul aria-label="Lista de produtos" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => quickAdd(p)}
                  aria-label={`Adicionar ${p.nome}, ${formatMoney(p.preco_venda)}`}
                  className="flex min-h-24 flex-1 flex-col items-start gap-1 p-3 text-left transition-colors hover:bg-brand-soft active:bg-brand-soft"
                >
                  <span className="line-clamp-2 text-[0.84rem] font-semibold text-fg">{p.nome}</span>
                  <span className="mt-auto flex w-full items-end justify-between gap-2">
                    <span className="text-base font-bold tabular-nums text-fg">{formatMoney(p.preco_venda)}</span>
                    <span className="text-xs text-muted">/{p.unidade.sigla}</span>
                  </span>
                  {semEstoque(p) && <Badge tone="warning">Sem estoque</Badge>}
                </button>
                <button
                  type="button"
                  onClick={() => setDetail(p)}
                  aria-label={`Quantidade e observação de ${p.nome}`}
                  className="flex min-h-11 items-center justify-center gap-1 border-t border-line bg-surface-2 px-2 text-[0.78rem] font-semibold text-brand-text hover:bg-brand-soft"
                >
                  <PlusIcon width={14} height={14} />
                  Qtd. / obs.
                </button>
              </li>
            ))}
          </ul>
          {produtos.data && produtos.data.total > items.length && (
            <p className="text-center text-xs text-muted">
              Mostrando {items.length} de {produtos.data.total} produtos (máximo de {PRODUTOS_LIMIT} por busca). Refine a busca ou escolha uma categoria.
            </p>
          )}
        </>
      )}

      {detail && <AddDetailDialog produto={detail} onClose={() => setDetail(null)} onAdd={add} />}
    </section>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-md border px-4 text-[0.84rem] font-semibold transition-colors ${active ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface text-fg hover:bg-surface-2"}`}
    >
      {children}
    </button>
  );
}

function AddDetailDialog({ produto, onClose, onAdd }: { produto: Produto; onClose: () => void; onAdd: (p: Produto, quantidade: string, observacao?: string) => Promise<unknown> }) {
  const formId = useId();
  const casas = produto.unidade.casas_decimais;
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const parsed = parseDecimalInput(quantidade, casas);
  const valid = parsed !== null && compareDecimal(parsed, "0") > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || parsed === null) {
      setError(casas === 0 ? "Informe uma quantidade inteira maior que zero." : `Informe uma quantidade maior que zero (até ${casas} casa(s) decimal(is)).`);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onAdd(produto, parsed, observacao.trim() || undefined);
      onClose();
    } catch {
      // O toast de erro já foi mostrado por quem chamou; mantém o diálogo para tentar de novo.
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      dismissible={!pending}
      title={produto.nome}
      description={`${formatMoney(produto.preco_venda)} por ${produto.unidade.sigla}`}
      footer={
        <>
          <Button className="min-h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" className="min-h-11" loading={pending}>
            Adicionar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-fg">Quantidade ({produto.unidade.sigla})</p>
          <Stepper label="Quantidade" value={quantidade} onChange={setQuantidade} casas={casas} />
        </div>
        <FormField label="Observação" hint="Ex.: sem cebola, ponto da carne.">
          <Textarea rows={2} maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </FormField>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}
