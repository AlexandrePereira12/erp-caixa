import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RoleDetail } from "./RoleDetail";
import { RoleFormDialog } from "./RoleFormDialog";
import { usePermissionCatalog, useRoles } from "./api";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { PlusIcon } from "@/components/icons";
import { positiveIntParam } from "@/components/pdv/forms";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";

export function RolesPage() {
  usePageTitle("Papéis e permissões");
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  const roles = useRoles();
  const catalog = usePermissionCatalog({ enabled: can("permissoes.listar") });

  const list = roles.data;
  const requestedId = positiveIntParam(params.get("papel"));
  const selected = list?.find((r) => r.id === requestedId) ?? list?.[0];

  function select(id: number | undefined) {
    const next = new URLSearchParams(params);
    if (id) next.set("papel", String(id));
    else next.delete("papel");
    setParams(next, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Papéis e permissões"
        description="Defina o que cada papel pode fazer no sistema."
        actions={
          can("papeis.criar") && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <PlusIcon width={16} height={16} />
              Novo papel
            </Button>
          )
        }
      />

      {roles.error ? (
        <Card>
          <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
        </Card>
      ) : !list ? (
        <Card>
          <LoadingBlock />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum papel cadastrado" />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Papéis">
            <ul className="space-y-2">
              {list.map((role) => {
                const active = role.id === selected?.id;
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => select(role.id)}
                      aria-current={active ? "true" : undefined}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2"}`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{role.nome}</span>
                        {role.sistema && <Badge tone="brand">Sistema</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{role.permissoes.length} permissão(ões)</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selected && <RoleDetail key={selected.id} role={selected} catalog={catalog.data} catalogError={catalog.error} onDeleted={() => select(undefined)} />}
        </div>
      )}

      {creating && <RoleFormDialog catalog={catalog.data} onClose={() => setCreating(false)} onCreated={(role) => select(role.id)} />}
    </div>
  );
}
