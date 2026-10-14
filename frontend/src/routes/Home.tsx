import { Link } from "react-router-dom";
import { Card, PageHeader } from "@/components/Card";
import { NAV_MODULES, type NavItem } from "@/app/navigation";
import { useCaixaAtual } from "@/features/caixa/api";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

const dateLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function Shortcut({ item, note }: { item: NavItem; note?: { text: string; className: string } | undefined }) {
  return (
    <li>
      <Link to={item.to} className="flex h-full min-w-0 items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface-2 motion-reduce:transition-none">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-bold text-brand-text">
          {item.label.charAt(0)}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-fg">{item.label}</span>
          {note ? <span className={`mt-0.5 block text-[0.78rem] leading-snug ${note.className}`}>{note.text}</span> : item.hint && <span className="mt-0.5 block text-[0.78rem] leading-snug text-muted">{item.hint}</span>}
        </span>
      </Link>
    </li>
  );
}

export function Home() {
  usePageTitle("Início");
  const { me, can } = usePermissions();
  const caixa = useCaixaAtual({ enabled: can("caixa.operar") });
  const modules = NAV_MODULES.map((module) => ({ module, items: module.items.filter((item) => item.permission && can(item.permission)) })).filter((group) => group.items.length > 0);
  const firstName = me?.nome.split(" ")[0] ?? "";

  function noteOf(item: NavItem) {
    if (item.to !== "/caixa" || caixa.data === undefined) return undefined;
    return caixa.data
      ? { text: `Caixa #${caixa.data.id} aberto desde ${formatDateTime(caixa.data.aberto_em)}`, className: "text-success-text" }
      : { text: "Nenhum caixa aberto: abra para receber pagamentos", className: "text-warning-text" };
  }

  const today = dateLong.format(new Date());

  return (
    <div>
      <PageHeader title={`Olá, ${firstName}`} description={today.charAt(0).toUpperCase() + today.slice(1)} />
      {modules.length === 0 ? (
        <Card className="p-6 text-muted">Seu perfil ainda não tem acesso a nenhum módulo. Fale com o administrador.</Card>
      ) : (
        <div className="space-y-6">
          {modules.map(({ module, items }) => (
            <section key={module.id} aria-labelledby={`home-${module.id}`}>
              <h2 id={`home-${module.id}`} className="mb-3 border-b border-line pb-2.5 text-lg font-semibold text-fg">
                {module.label}
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))] gap-3">
                {items.map((item) => (
                  <Shortcut key={item.to} item={item} note={noteOf(item)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
