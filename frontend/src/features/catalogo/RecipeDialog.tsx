import { useRef, useState } from "react";
import { useProductMutations, useRecipeInputSearch, useUnitScales } from "./api";
import { decimalToInput, formatCost, parseQuantityInput } from "./decimalInput";
import { productTypeLabel, type ProdutoOut } from "./types";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useToast } from "@/components/Toast";
import { useDebouncedValue } from "@/components/useListParams";
import { errorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/auth/hooks";
import { formatMoney } from "@/lib/money";

interface Row {
  insumo_id: number;
  nome: string;
  /** Sigla da unidade do insumo: a quantidade da ficha segue as casas dela. */
  unidade: string;
  text: string;
  /** Custo do item calculado pela API; some quando a quantidade é editada (só volta ao salvar). */
  custo_item: string | null;
}

function toRows(product: ProdutoOut): Row[] {
  return product.composicao.map((item) => ({
    insumo_id: item.insumo_id,
    nome: item.insumo_nome,
    unidade: item.unidade,
    text: decimalToInput(item.quantidade, { trim: true }),
    custo_item: item.custo_item,
  }));
}

/** Ficha técnica (só produto "preparado"): insumos e a quantidade de cada um por unidade do produto. */
export function RecipeDialog({ product, onClose }: { product: ProdutoOut; onClose: () => void }) {
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can("catalogo.editar");
  const { scaleOf } = useUnitScales();
  const { setRecipe } = useProductMutations();

  const [current, setCurrent] = useState(product);
  const [rows, setRows] = useState<Row[]>(() => toRows(product));
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRecipeInputSearch(useDebouncedValue(query.trim(), 250), canEdit);
  const focusAfterAdd = useRef<number | null>(null);

  // Mesmas regras do backend para insumo: controla estoque, sem ficha própria, não é o próprio produto.
  const taken = new Set(rows.map((row) => row.insumo_id));
  const candidates = search.items.filter((item) => item.id !== product.id && item.controla_estoque && item.composicao.length === 0 && !taken.has(item.id));
  const options: ComboOption[] = candidates.map((item) => ({ id: item.id, label: item.nome, description: `${productTypeLabel(item.tipo)} · ${item.unidade.sigla}` }));

  function addInput(option: ComboOption) {
    const item = candidates.find((candidate) => candidate.id === option.id);
    if (!item) return;
    setRows((list) => [...list, { insumo_id: item.id, nome: item.nome, unidade: item.unidade.sigla, text: "", custo_item: null }]);
    focusAfterAdd.current = item.id;
    setQuery("");
  }

  function setText(insumoId: number, text: string) {
    setRows((list) => list.map((row) => (row.insumo_id === insumoId ? { ...row, text, custo_item: null } : row)));
    setRowErrors((errors) => {
      if (!(insumoId in errors)) return errors;
      const { [insumoId]: _removed, ...rest } = errors;
      return rest;
    });
  }

  function removeRow(insumoId: number) {
    setRows((list) => list.filter((row) => row.insumo_id !== insumoId));
    setRowErrors((errors) => {
      const { [insumoId]: _removed, ...rest } = errors;
      return rest;
    });
  }

  async function save() {
    setFormError(null);
    const errors: Record<number, string> = {};
    const itens: { insumo_id: number; quantidade: string }[] = [];
    for (const row of rows) {
      const parsed = parseQuantityInput(row.text, { scale: scaleOf(row.unidade), unit: row.unidade });
      if (parsed.error !== undefined) errors[row.insumo_id] = parsed.error;
      else itens.push({ insumo_id: row.insumo_id, quantidade: parsed.value });
    }
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const saved = await setRecipe.mutateAsync({ id: product.id, itens });
      setCurrent(saved);
      setRows(toRows(saved));
      toast.success("Ficha técnica salva.");
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title={`Ficha técnica — ${product.nome}`}
      description={`Insumos consumidos por 1 ${current.unidade.sigla} de ${product.nome}.`}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Fechar
          </Button>
          {canEdit && (
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Salvar ficha técnica
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {!canEdit && <Alert tone="info">Você pode ver a ficha técnica, mas não tem permissão para alterá-la.</Alert>}

        <div className="rounded-md border border-line bg-surface-2 px-4 py-3 text-sm">
          <p className="text-muted">Custo da ficha</p>
          <p className="text-lg font-semibold text-fg">{formatCost(current.custo_ficha)}</p>
          <p className="text-xs text-muted">Calculado pelo sistema, com o custo médio dos insumos, ao salvar a ficha.</p>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nenhum insumo na ficha técnica.</p>
        ) : (
          <ul aria-label="Insumos da ficha técnica" className="divide-y divide-line rounded-md border border-line">
            {rows.map((row) => {
              const error = rowErrors[row.insumo_id];
              const errorId = `recipe-error-${row.insumo_id}`;
              return (
                <li key={row.insumo_id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_11rem_8rem_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{row.nome}</p>
                    <p className="text-xs text-muted">Unidade: {row.unidade}</p>
                  </div>
                  <div>
                    {canEdit ? (
                      <>
                        <Input
                          ref={(el) => {
                            // Linha recém-adicionada: leva o foco direto para a quantidade.
                            if (el && focusAfterAdd.current === row.insumo_id) {
                              focusAfterAdd.current = null;
                              el.focus();
                            }
                          }}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`Quantidade de ${row.nome} (${row.unidade})`}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? errorId : undefined}
                          placeholder="Quantidade"
                          value={row.text}
                          onChange={(event) => setText(row.insumo_id, event.target.value)}
                        />
                        {error && (
                          <p id={errorId} className="mt-1 text-sm text-danger-text">
                            {error}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-fg">
                        {row.text} {row.unidade}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-fg sm:pt-2">
                    <span className="text-muted sm:hidden">Custo do item: </span>
                    {row.custo_item === null ? <span className="text-muted">—</span> : formatMoney(row.custo_item)}
                  </p>
                  {canEdit && (
                    <Button variant="ghost" size="sm" aria-label={`Remover ${row.nome} da ficha`} className="text-danger-text" onClick={() => removeRow(row.insumo_id)}>
                      Remover
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <SearchCombobox
            label="Adicionar insumo"
            placeholder="Buscar por nome ou código"
            hint="Insumo, embalagem ou revenda que controla estoque e não tem ficha técnica própria."
            query={query}
            onQueryChange={setQuery}
            options={options}
            onSelect={addInput}
            isLoading={search.isLoading}
            error={search.error}
            emptyText="Nenhum insumo disponível para esta busca."
          />
        )}
      </div>
    </Dialog>
  );
}
