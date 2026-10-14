import { Select } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { parsePositiveInt } from "@/components/useListParams";
import { useCategories } from "@/features/catalogo/api";
import { PRODUCT_TYPES, productTypeLabel, type TipoProduto } from "@/features/catalogo/types";
import { usePermissions } from "@/lib/auth/hooks";

/** Valor de ?tipo= -> tipo de produto conhecido; qualquer outra coisa vira "sem filtro". */
export function parseTipo(value: string | null): TipoProduto | undefined {
  return PRODUCT_TYPES.find((tipo) => tipo === value);
}

/** Valor de ?categoria= -> id inteiro positivo; qualquer outra coisa vira "sem filtro". */
export function parseCategoria(value: string | null): number | undefined {
  return parsePositiveInt(value);
}

export function TipoSelect({ value, onChange }: { value: TipoProduto | undefined; onChange: (value: string | undefined) => void }) {
  return (
    <FormField label="Tipo de produto">
      <Select className="min-h-11" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Todos os tipos</option>
        {PRODUCT_TYPES.map((tipo) => (
          <option key={tipo} value={tipo}>
            {productTypeLabel(tipo)}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

/** Categoria do catálogo. Só aparece para quem pode listar o catálogo (a lista de categorias exige a permissão). */
export function CategoriaSelect({ value, onChange }: { value: number | undefined; onChange: (value: string | undefined) => void }) {
  const { can } = usePermissions();
  const allowed = can("catalogo.listar");
  const categorias = useCategories({ enabled: allowed });
  if (!allowed) return null;
  return (
    <FormField label="Categoria">
      <Select className="min-h-11" value={value ? String(value) : ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Todas as categorias</option>
        {(categorias.data ?? []).map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.nome}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
