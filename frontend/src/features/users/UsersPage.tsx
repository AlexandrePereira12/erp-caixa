import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PAGE_SIZE, useUserMutations, useUsers, type UserFilters } from "./api";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { UserFormDialog } from "./UserFormDialog";
import { useRoles } from "@/features/roles/api";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Select } from "@/components/controls";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField } from "@/components/FormField";
import { PlusIcon } from "@/components/icons";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/api/errors";
import type { UsuarioOut } from "@/lib/api/types";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

type Dialog = { kind: "create" } | { kind: "edit" | "suspend" | "reset" | "delete"; user: UsuarioOut } | null;

type StatusFilter = "todos" | "ativos" | "suspensos";

function parseStatus(value: string | null): StatusFilter {
  return value === "ativos" || value === "suspensos" ? value : "todos";
}

export function UsersPage() {
  usePageTitle("Usuários");
  const toast = useToast();
  const { can, me } = usePermissions();
  const [params, setParams] = useSearchParams();

  const status = parseStatus(params.get("situacao"));
  const q = params.get("q") ?? "";
  const papelParam = Number(params.get("papel"));
  const papelId = Number.isInteger(papelParam) && papelParam > 0 ? papelParam : undefined;
  const page = Math.max(1, Math.floor(Number(params.get("pagina"))) || 1);

  const filters: UserFilters = {
    q,
    suspenso: status === "todos" ? undefined : status === "suspensos",
    papelId,
    deslocamento: (page - 1) * PAGE_SIZE,
  };

  // Os timers (debounce) e efeitos chamam updateParams depois de novas renderizações; ler os parâmetros
  // do ref evita gravar uma URL antiga por cima de um filtro escolhido no meio do caminho.
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });

  function updateParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("pagina" in patch)) next.delete("pagina"); // qualquer filtro novo volta para a página 1
    setParams(next, { replace: true });
  }

  // Busca com debounce: o campo é local e a URL só muda depois de 300 ms sem digitar.
  const [searchDraft, setSearchDraft] = useState(q);
  useEffect(() => {
    if (searchDraft.trim() === q) return;
    const timer = setTimeout(() => updateParams({ q: searchDraft.trim() || undefined }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  const canListRoles = can("papeis.listar");
  const roles = useRoles({ enabled: canListRoles });
  const users = useUsers(filters);
  const mutations = useUserMutations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Depois de excluir o último item de uma página, volta para a última página existente.
  const data = users.data;
  useEffect(() => {
    if (data && data.itens.length === 0 && data.total > 0 && data.deslocamento > 0) {
      updateParams({ pagina: String(Math.ceil(data.total / PAGE_SIZE)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function reactivate(user: UsuarioOut) {
    setBusyId(user.id);
    try {
      await mutations.reactivate.mutateAsync(user.id);
      toast.success(`${user.nome} foi reativado.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const canEdit = can("usuarios.editar");
  const canSuspend = can("usuarios.suspender");
  const canReset = can("usuarios.redefinir_senha");
  const canDelete = can("usuarios.excluir");
  const showActions = canEdit || canSuspend || canReset || canDelete;

  const columns: Column<UsuarioOut>[] = [
    {
      key: "usuario",
      header: "Usuário",
      cell: (u) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">
            {u.nome}
            {u.id === me?.id && (
              <Badge tone="brand" className="ml-2 align-middle">
                Você
              </Badge>
            )}
          </p>
          <p className="text-muted">{u.email}</p>
        </div>
      ),
    },
    {
      key: "papeis",
      header: "Papéis",
      cell: (u) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {u.papeis.map((p) => (
            <Badge key={p.id}>{p.nome}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: "situacao",
      header: "Situação",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={u.suspenso ? "warning" : "success"}>{u.suspenso ? "Suspenso" : "Ativo"}</Badge>
          {u.must_change_password && <Badge>Troca de senha pendente</Badge>}
        </div>
      ),
    },
    { key: "login", header: "Último acesso", cell: (u) => <span className="whitespace-nowrap text-muted">{formatDateTime(u.ultimo_login_em, "Nunca")}</span> },
  ];

  if (showActions) {
    columns.push({
      key: "acoes",
      header: <span className="sr-only">Ações</span>,
      cell: (u) => {
        const self = u.id === me?.id; // o backend recusa (acao_em_si_mesmo); a UI nem oferece
        return (
          <div className="flex flex-wrap gap-1">
            {canEdit && (
              <Button variant="ghost" size="sm" aria-label={`Editar ${u.nome}`} onClick={() => setDialog({ kind: "edit", user: u })}>
                Editar
              </Button>
            )}
            {canSuspend && !self && (u.suspenso ? (
              <Button variant="ghost" size="sm" aria-label={`Reativar ${u.nome}`} loading={busyId === u.id} onClick={() => void reactivate(u)}>
                Reativar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" aria-label={`Suspender ${u.nome}`} onClick={() => setDialog({ kind: "suspend", user: u })}>
                Suspender
              </Button>
            ))}
            {canReset && (
              <Button variant="ghost" size="sm" aria-label={`Redefinir senha de ${u.nome}`} onClick={() => setDialog({ kind: "reset", user: u })}>
                Redefinir senha
              </Button>
            )}
            {canDelete && !self && (
              <Button variant="ghost" size="sm" aria-label={`Excluir ${u.nome}`} className="text-danger-text" onClick={() => setDialog({ kind: "delete", user: u })}>
                Excluir
              </Button>
            )}
          </div>
        );
      },
    });
  }

  const hasFilters = Boolean(q || papelId || status !== "todos");

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Pessoas com acesso ao sistema."
        actions={
          can("usuarios.criar") && (
            <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
              <PlusIcon width={16} height={16} />
              Novo usuário
            </Button>
          )
        }
      />

      <Card>
        <form role="search" aria-label="Filtrar usuários" onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          <FormField label="Buscar">
            <Input type="search" placeholder="Nome ou e-mail" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
          </FormField>
          <FormField label="Situação">
            <Select value={status} onChange={(e) => updateParams({ situacao: e.target.value === "todos" ? undefined : e.target.value })}>
              <option value="todos">Todas</option>
              <option value="ativos">Ativos</option>
              <option value="suspensos">Suspensos</option>
            </Select>
          </FormField>
          {canListRoles && (
            <FormField label="Papel">
              <Select value={papelId ?? ""} onChange={(e) => updateParams({ papel: e.target.value || undefined })}>
                <option value="">Todos</option>
                {roles.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {hasFilters && (
            <Button
              onClick={() => {
                setSearchDraft("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Limpar filtros
            </Button>
          )}
        </form>

        <DataTable
          caption="Lista de usuários"
          columns={columns}
          rows={data?.itens}
          getRowKey={(u) => u.id}
          isLoading={users.isLoading}
          isFetching={users.isFetching}
          error={users.error}
          onRetry={() => void users.refetch()}
          emptyTitle={hasFilters ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
          emptyDescription={hasFilters ? "Ajuste ou limpe os filtros para ver mais resultados." : undefined}
        />
        {data && !users.error && (
          <Pagination total={data.total} limite={data.limite} deslocamento={data.deslocamento} disabled={users.isFetching} onChange={(offset) => updateParams({ pagina: String(offset / PAGE_SIZE + 1) })} />
        )}
      </Card>

      {dialog?.kind === "create" && <UserFormDialog roles={roles.data} rolesLoading={roles.isLoading} rolesError={roles.error} canListRoles={canListRoles} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && (
        <UserFormDialog user={dialog.user} roles={roles.data} rolesLoading={roles.isLoading} rolesError={roles.error} canListRoles={canListRoles} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "reset" && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "suspend"}
        title="Suspender usuário"
        description={dialog?.kind === "suspend" ? <>{dialog.user.nome} perderá o acesso ao sistema até ser reativado.</> : undefined}
        confirmLabel="Suspender"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "suspend") return;
          await mutations.suspend.mutateAsync(dialog.user.id);
          toast.success(`${dialog.user.nome} foi suspenso.`);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title="Excluir usuário"
        description={dialog?.kind === "delete" ? <>Excluir <strong>{dialog.user.nome}</strong> ({dialog.user.email})? Esta ação não pode ser desfeita.</> : undefined}
        confirmLabel="Excluir"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await mutations.remove.mutateAsync(dialog.user.id);
          toast.success(`${dialog.user.nome} foi excluído.`);
        }}
      />
    </div>
  );
}
