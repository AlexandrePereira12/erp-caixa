import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { NAV_MODULES, type NavItem } from "@/app/navigation";
import { useCaixaAtual } from "@/features/caixa/api";
import { usePermissions } from "@/lib/auth/hooks";
import { formatDateTime } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

const dateLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

/** Cor de cada módulo no atalho: variedade com os tons do tema, sem significado de estado. */
const TONES: Record<string, string> = {
  atendimento: "bg-terra-soft text-terra-text",
  vendas: "bg-brand-soft text-brand-text",
  financeiro: "bg-warning-soft text-warning-text",
  estoque: "bg-brand-soft text-brand-text",
  cadastros: "bg-terra-soft text-terra-text",
  relatorios: "bg-warning-soft text-warning-text",
  administracao: "bg-surface-2 text-fg",
};

function Shortcut({ item, tone, note }: { item: NavItem; tone: string; note?: { text: string; className: string } | undefined }) {
  return (
    <li>
      <Link
        to={item.to}
        className="group flex min-h-[4.5rem] items-center gap-3.5 rounded-xl border border-line bg-surface p-3.5 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
          <item.icon width={22} height={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-fg">{item.label}</span>
          {note ? <span className={`block text-xs font-medium ${note.className}`}>{note.text}</span> : item.hint && <span className="block text-xs text-muted">{item.hint}</span>}
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-[1.9rem] font-semibold leading-tight text-fg sm:text-[2.4rem]">
          Olá, <span className="marker">{firstName}</span>
        </h1>
        <p className="mt-1.5 text-[0.95rem] text-muted first-letter:uppercase">{dateLong.format(new Date())}</p>
      </div>
      {modules.length === 0 ? (
        <Card className="p-6 text-sm text-muted">Seu perfil ainda não tem acesso a nenhum módulo. Fale com o administrador.</Card>
      ) : (
        <div className="space-y-9">
          {modules.map(({ module, items }) => (
            <section key={module.id} aria-labelledby={`home-${module.id}`}>
              <h2 id={`home-${module.id}`} className="mb-3 font-display text-xl font-semibold text-fg">
                {module.label}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <Shortcut key={item.to} item={item} tone={TONES[module.id] ?? TONES.administracao!} note={noteOf(item)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
