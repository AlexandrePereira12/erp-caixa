import { Link, useLocation, useParams } from "react-router-dom";
import { AuditDiff } from "./AuditDiff";
import { useAuditEntry } from "./api";
import { Badge } from "@/components/Badge";
import { buttonClasses } from "@/components/Button";
import { Card, PageHeader } from "@/components/Card";
import { CopyButton } from "@/components/CopyButton";
import { ArrowLeftIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/States";
import { formatDateTime } from "@/lib/format";
import { moduleLabel } from "@/lib/labels";
import { usePageTitle } from "@/lib/usePageTitle";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

export function AuditDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const location = useLocation();
  const entry = useAuditEntry(id);
  usePageTitle(`Auditoria #${params.id ?? ""}`);

  // Volta para a lista com os filtros que estavam ativos.
  const backSearch = (location.state as { search?: string } | null)?.search ?? "";
  const back = (
    <Link to={{ pathname: "/auditoria", search: backSearch }} className={buttonClasses()}>
      <ArrowLeftIcon width={16} height={16} />
      Voltar à lista
    </Link>
  );

  if (entry.isLoading) return <LoadingBlock />;
  if (entry.error || !entry.data) {
    return (
      <div>
        <PageHeader title="Registro de auditoria" actions={back} />
        <Card>
          <ErrorState error={entry.error} onRetry={() => void entry.refetch()} title="Não foi possível carregar o registro" />
        </Card>
      </div>
    );
  }

  const e = entry.data;
  return (
    <div>
      <PageHeader title={`Registro #${e.id}`} description={e.descricao} actions={back} />

      <Card className="mb-6 p-5">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Data e hora">{formatDateTime(e.ocorrido_em)}</Item>
          <Item label="Usuário">
            {e.usuario_nome ?? "Sistema"}
            {e.usuario_id !== null && <span className="text-muted"> (ID {e.usuario_id})</span>}
          </Item>
          <Item label="Papel">{e.papel ?? "—"}</Item>
          <Item label="Ação">
            <Badge tone="brand">{e.acao}</Badge>
          </Item>
          <Item label="Módulo">{moduleLabel(e.modulo)}</Item>
          <Item label="Recurso">
            {e.recurso}
            {e.recurso_id && <span className="text-muted"> #{e.recurso_id}</span>}
          </Item>
          <Item label="IP">{e.ip ?? "—"}</Item>
          <Item label="Navegador">{e.user_agent ?? "—"}</Item>
          <Item label="ID da requisição">
            {e.request_id ? (
              <span className="flex flex-wrap items-center gap-2">
                <code className="select-all break-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{e.request_id}</code>
                <CopyButton text={e.request_id} label="Copiar ID da requisição" successMessage="ID da requisição copiado." />
              </span>
            ) : (
              "—"
            )}
          </Item>
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-fg">O que mudou</h2>
        <AuditDiff antes={e.antes} depois={e.depois} camposAlterados={e.campos_alterados} />
      </Card>
    </div>
  );
}
