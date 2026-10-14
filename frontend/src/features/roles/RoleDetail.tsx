import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PermissionMatrix, groupByModule } from "./PermissionMatrix";
import { useRoleMutations } from "./api";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Textarea } from "@/components/controls";
import { FormField } from "@/components/FormField";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import type { PapelEditarIn, PapelOut, PermissaoOut } from "@/lib/api/types";
import { usePermissions } from "@/lib/auth/hooks";
import { parseMoney } from "@/components/pdv/forms";
import { compareDecimal } from "@/lib/decimal";
import { applyServerError } from "@/lib/forms";
import { moduleLabel } from "@/lib/labels";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do papel.").max(60, "O nome pode ter no máximo 60 caracteres."),
  descricao: z.string().trim().max(500, "A descrição pode ter no máximo 500 caracteres."),
  limite_desconto_pct: z
    .string()
    .trim()
    .refine((v) => parseMoney(v) !== null, "Informe um percentual válido, como 10 ou 12,5.")
    .refine((v) => {
      const parsed = parseMoney(v);
      return parsed === null || (compareDecimal(parsed, "0") >= 0 && compareDecimal(parsed, "100") <= 0);
    }, "O limite deve ficar entre 0 e 100."),
});
type FormValues = z.infer<typeof schema>;

/** "20.00" (API) -> "20,00" (campo). */
const limitText = (value: string) => value.replace(".", ",");

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Painel do papel selecionado. Use `key={role.id}` para zerar o estado local ao trocar de papel. */
export function RoleDetail({ role, catalog, catalogError, onDeleted }: { role: PapelOut; catalog: PermissaoOut[] | undefined; catalogError: unknown; onDeleted: () => void }) {
  const toast = useToast();
  const { can } = usePermissions();
  const { update, setPermissions, remove } = useRoleMutations();

  // Papéis de sistema ficam somente leitura. O backend segue como autoridade (papel_protegido).
  const locked = role.sistema;
  const canEdit = can("papeis.editar") && !locked;
  // O limite de desconto é ajustável também nos papéis de sistema (só nome, descrição e exclusão são protegidos).
  const canEditLimit = can("papeis.editar");
  const canDelete = can("papeis.excluir") && !locked;

  const currentCodes = role.permissoes.map((p) => p.codigo);
  const [selected, setSelected] = useState<string[]>(currentCodes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { nome: role.nome, descricao: role.descricao ?? "", limite_desconto_pct: limitText(role.limite_desconto_pct) } });

  async function saveData(values: FormValues) {
    setDataError(null);
    const body: PapelEditarIn = {};
    if (values.nome !== role.nome) body.nome = values.nome;
    // Descrição limpa vai como "" (string vazia): null poderia ser lido como "sem alteração".
    if (values.descricao !== (role.descricao ?? "")) body.descricao = values.descricao;
    const limite = parseMoney(values.limite_desconto_pct);
    if (limite !== null && compareDecimal(limite, role.limite_desconto_pct) !== 0) body.limite_desconto_pct = limite;
    try {
      const saved = await update.mutateAsync({ id: role.id, body });
      reset({ nome: saved.nome, descricao: saved.descricao ?? "", limite_desconto_pct: limitText(saved.limite_desconto_pct) });
      toast.success("Dados do papel salvos.");
    } catch (error) {
      setDataError(applyServerError(error, setError, ["nome", "descricao", "limite_desconto_pct"]));
    }
  }

  const permsDirty = !sameSet(selected, currentCodes);
  async function savePermissions() {
    setPermError(null);
    try {
      await setPermissions.mutateAsync({ id: role.id, permissoes: selected });
      toast.success("Permissões do papel salvas.");
    } catch (error) {
      setPermError(errorMessage(error));
    }
  }

  const grouped = groupByModule(role.permissoes);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-fg">{role.nome}</h2>
          {locked && <Badge tone="brand">Papel de sistema</Badge>}
        </div>
        {locked && <Alert tone="info" className="mb-4">Papéis de sistema são protegidos: não podem ser renomeados, ter as permissões alteradas nem ser excluídos. Só o limite de desconto pode ser ajustado.</Alert>}

        <form onSubmit={handleSubmit(saveData)} noValidate className="space-y-4">
          {dataError && <Alert tone="danger">{dataError}</Alert>}
          <FormField label="Nome" error={errors.nome?.message} required>
            <Input autoComplete="off" disabled={!canEdit} {...register("nome")} />
          </FormField>
          <FormField label="Descrição" error={errors.descricao?.message}>
            <Textarea disabled={!canEdit} {...register("descricao")} />
          </FormField>
          <FormField
            label="Limite de desconto (%)"
            error={errors.limite_desconto_pct?.message}
            hint="Maior desconto, em % do consumo, que este papel aplica sem a ajuda de um gerente."
            required
          >
            <Input inputMode="decimal" autoComplete="off" disabled={!canEditLimit} {...register("limite_desconto_pct")} />
          </FormField>
          {canEditLimit && (
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
              Salvar dados
            </Button>
          )}
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold text-fg">Permissões</h2>
        <p className="mb-4 text-sm text-muted">{role.permissoes.length} permissão(ões) neste papel.</p>
        {permError && <Alert tone="danger" className="mb-4">{permError}</Alert>}

        {canEdit && catalog ? (
          <>
            <PermissionMatrix catalog={catalog} value={selected} onChange={setSelected} />
            <div className="mt-4 flex gap-2">
              <Button variant="primary" loading={setPermissions.isPending} disabled={!permsDirty} onClick={() => void savePermissions()}>
                Salvar permissões
              </Button>
              <Button disabled={!permsDirty || setPermissions.isPending} onClick={() => setSelected(currentCodes)}>
                Desfazer
              </Button>
            </div>
          </>
        ) : catalog && !locked ? (
          <PermissionMatrix catalog={catalog} value={currentCodes} onChange={() => {}} disabled />
        ) : (
          // Sem catálogo (ou papel de sistema): lista só o que o papel já tem, agrupado por módulo.
          <>
            {!locked && can("papeis.editar") && catalogError !== undefined && catalogError !== null && (
              <Alert tone="warning" className="mb-4">
                Não foi possível carregar o catálogo de permissões; a edição está indisponível.
              </Alert>
            )}
            {grouped.length === 0 ? (
              <p className="text-sm text-muted">Este papel não tem permissões.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {grouped.map(([modulo, items]) => (
                  <div key={modulo} className="rounded-md border border-line p-3">
                    <h3 className="mb-2 text-sm font-semibold text-fg">{moduleLabel(modulo)}</h3>
                    <ul className="space-y-1 text-sm">
                      {items.map((p) => (
                        <li key={p.codigo}>
                          <span className="text-fg">{p.descricao}</span> <span className="font-mono text-xs text-muted [overflow-wrap:anywhere]">{p.codigo}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {canDelete && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-danger p-5">
          <div>
            <h2 className="font-semibold text-fg">Excluir papel</h2>
            <p className="text-sm text-muted">Só é possível excluir papéis que não estejam atribuídos a usuários.</p>
          </div>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Excluir papel
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir papel"
        description={
          <>
            Excluir o papel <strong>{role.nome}</strong>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove.mutateAsync(role.id);
          toast.success(`Papel "${role.nome}" excluído.`);
          onDeleted();
        }}
      />
    </div>
  );
}
