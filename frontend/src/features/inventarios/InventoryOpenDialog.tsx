import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useInventoryMutations, useInventoryProductSearch } from "./api";
import type { InventarioCriarIn } from "./types";
import { useCategories } from "@/features/catalogo/api";
import { mapServerError } from "@/features/catalogo/formErrors";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/controls";
import { Dialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { SearchCombobox } from "@/components/SearchCombobox";
import { useToast } from "@/components/Toast";
import { parsePositiveInt, useDebouncedValue } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";

const schema = z.object({ descricao: z.string().trim().min(1, "Informe a descrição.").max(160, "A descrição pode ter no máximo 160 caracteres.") });
type FormValues = z.infer<typeof schema>;

type Scope = "todos" | "categoria" | "selecao";

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "todos", label: "Todos os produtos controlados", hint: "Todos os produtos ativos que controlam estoque." },
  { value: "categoria", label: "Uma categoria", hint: "Só os produtos controlados da categoria escolhida." },
  { value: "selecao", label: "Seleção de produtos", hint: "Escolha produto a produto." },
];

interface Picked {
  id: number;
  nome: string;
  unidade: string;
}

function ProductSelection({ picked, onChange, error }: { picked: Picked[]; onChange: (list: Picked[]) => void; error?: string | undefined }) {
  const [query, setQuery] = useState("");
  const search = useInventoryProductSearch(useDebouncedValue(query.trim(), 250), true);
  const chosen = new Set(picked.map((item) => item.id));
  const available = (search.data ?? []).filter((item) => !chosen.has(item.id));
  return (
    <div className="space-y-2">
      <SearchCombobox
        label="Adicionar produto"
        placeholder="Buscar por nome ou código"
        query={query}
        onQueryChange={setQuery}
        options={available.map((item) => ({ id: item.id, label: item.nome, description: item.unidade.sigla }))}
        onSelect={(option) => {
          const item = available.find((candidate) => candidate.id === option.id);
          if (item) onChange([...picked, { id: item.id, nome: item.nome, unidade: item.unidade.sigla }]);
          setQuery("");
        }}
        isLoading={search.isLoading}
        error={search.error}
        emptyText="Nenhum produto ativo com controle de estoque encontrado."
        errorText={error}
      />
      {picked.length > 0 && (
        <ul aria-label="Produtos selecionados" className="divide-y divide-line rounded-md border border-line">
          {picked.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-fg">
                {item.nome} <span className="text-muted">({item.unidade})</span>
              </span>
              <Button variant="ghost" size="sm" className="text-danger-text" aria-label={`Remover ${item.nome}`} onClick={() => onChange(picked.filter((p) => p.id !== item.id))}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Abre um inventário: todos os produtos controlados, uma categoria ou uma seleção. */
export function InventoryOpenDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCatalog = can("catalogo.listar");
  const { create } = useInventoryMutations();
  const categories = useCategories({ ativo: true, enabled: canCatalog });
  const [scope, setScope] = useState<Scope>("todos");
  const [categoryId, setCategoryId] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [scopeError, setScopeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { descricao: "" } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    setScopeError(undefined);
    const body: InventarioCriarIn = { descricao: values.descricao };
    if (scope === "categoria") {
      const id = parsePositiveInt(categoryId);
      if (id === undefined) {
        setScopeError("Escolha a categoria.");
        return;
      }
      body.categoria_id = id;
    } else if (scope === "selecao") {
      if (picked.length === 0) {
        setScopeError("Escolha ao menos um produto.");
        return;
      }
      body.produto_ids = picked.map((item) => item.id);
    }
    try {
      const created = await create.mutateAsync(body);
      toast.success(`Inventário aberto com ${created.total_itens} produto(s).`);
      onClose();
      navigate(`/inventarios/${created.id}`);
    } catch (error) {
      setFormError(mapServerError(error, setError, {}, ["descricao"]));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!isSubmitting}
      size="lg"
      title="Novo inventário"
      description="O sistema registra o saldo de cada produto neste momento; depois é só lançar as contagens."
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={isSubmitting}>
            Abrir inventário
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Descrição" error={errors.descricao?.message} hint="Ex.: Contagem geral de outubro, Câmara fria." required>
          <Input autoComplete="off" {...register("descricao")} />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-fg">Escopo</legend>
          {SCOPES.map((item) => {
            const disabled = item.value !== "todos" && !canCatalog;
            const inputId = `${formId}-escopo-${item.value}`;
            return (
              <div key={item.value} className={`flex items-start gap-2.5 ${disabled ? "opacity-60" : ""}`}>
                <input
                  id={inputId}
                  type="radio"
                  name="inventario-escopo"
                  className="mt-0.5 h-4 w-4 accent-brand"
                  value={item.value}
                  checked={scope === item.value}
                  disabled={disabled}
                  aria-describedby={`${inputId}-hint`}
                  onChange={() => setScope(item.value)}
                />
                <div>
                  <label htmlFor={inputId} className={`block text-sm text-fg ${disabled ? "" : "cursor-pointer"}`}>
                    {item.label}
                  </label>
                  <p id={`${inputId}-hint`} className="text-xs text-muted">
                    {disabled ? "Exige permissão para consultar o catálogo." : item.hint}
                  </p>
                </div>
              </div>
            );
          })}
        </fieldset>

        {scope === "categoria" && (
          <FormField label="Categoria" error={scopeError} required>
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Selecione…</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.nome}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {scope === "selecao" && <ProductSelection picked={picked} onChange={setPicked} error={scopeError} />}
      </form>
    </Dialog>
  );
}
