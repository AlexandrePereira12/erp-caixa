import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { HOME_ITEM, NAV_MODULES, type NavItem, type NavModule } from "./navigation";
import { useNavOpen } from "./useNavOpen";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Drawer } from "@/components/Drawer";
import { ChevronRightIcon, LogoutIcon, MenuIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "@/lib/auth/auth";
import { usePermissions } from "@/lib/auth/hooks";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 text-side-fg">
      <BrandMark size={30} />
      <span className="font-display text-lg font-semibold">PDV Restaurante</span>
    </div>
  );
}

/** Iniciais para o selo do usuário (primeiro e último nome). */
function initials(nome: string | undefined): string {
  const parts = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const linkBase = "relative flex items-center rounded-md text-sm transition-colors motion-reduce:transition-none focus-visible:outline-accent";

function NavLinkItem({ item, onNavigate, nested }: { item: NavItem; onNavigate: (() => void) | undefined; nested: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      {...(item.ariaLabel ? { "aria-label": item.ariaLabel } : {})}
      className={({ isActive }) =>
        `${linkBase} ${nested ? "px-3 py-1.5" : "gap-3 px-3 py-2 font-medium"} ${
          isActive
            ? `bg-side-active font-semibold text-side-fg ${nested ? "before:absolute before:inset-y-1.5 before:-left-[13px] before:w-[3px] before:rounded-full before:bg-accent" : "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent"}`
            : "text-side-muted hover:bg-side-active/60 hover:text-side-fg"
        }`
      }
    >
      {!nested && <item.icon />}
      {item.label}
    </NavLink>
  );
}

function NavGroup({ module, items, isOpen, isActive, onToggle, onNavigate }: { module: NavModule; items: NavItem[]; isOpen: boolean; isActive: boolean; onToggle: () => void; onNavigate: (() => void) | undefined }) {
  const listId = `nav-${module.id}`;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        className={`${linkBase} w-full gap-3 px-3 py-2 text-left font-semibold hover:bg-side-active/60 hover:text-side-fg ${isActive ? "text-side-fg" : "text-side-fg/85"}`}
      >
        <module.icon />
        <span className="flex-1">{module.label}</span>
        {isActive && !isOpen && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />}
        <ChevronRightIcon width={16} height={16} className={`text-side-muted transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`} />
      </button>
      <ul id={listId} hidden={!isOpen} className="ml-[1.45rem] mt-0.5 space-y-0.5 border-l border-side-line pl-3">
        {items.map((item) => (
          <li key={item.to}>
            <NavLinkItem item={item} onNavigate={onNavigate} nested />
          </li>
        ))}
      </ul>
    </li>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = usePermissions();
  const { pathname } = useLocation();
  const { open, toggle, activeId } = useNavOpen(pathname);
  // Só aparecem os módulos com algum submódulo cuja permissão de listar/ver a pessoa tem.
  const groups = NAV_MODULES.map((module) => ({ module, items: module.items.filter((item) => !item.permission || can(item.permission)) })).filter((group) => group.items.length > 0);
  return (
    <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        <li>
          <NavLinkItem item={HOME_ITEM} onNavigate={onNavigate} nested={false} />
        </li>
        {groups.map(({ module, items }) => (
          <NavGroup key={module.id} module={module} items={items} isOpen={open.has(module.id)} isActive={activeId === module.id} onToggle={() => toggle(module.id)} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const { me } = usePermissions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-fg focus:shadow-lg">
        Ir para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-side-line bg-side text-side-fg lg:flex">
        <div className="flex h-16 items-center border-b border-side-line">
          <Brand />
        </div>
        <NavList />
      </aside>

      <Drawer open={drawerOpen} onClose={closeDrawer} label="Menu de navegação">
        <div className="flex h-16 shrink-0 items-center border-b border-side-line">
          <Brand />
        </div>
        <NavList onNavigate={closeDrawer} />
        <div className="space-y-2 border-t border-side-line p-3">
          <div className="px-3">
            <p className="truncate text-sm font-semibold text-side-fg">{me?.nome}</p>
            <p className="truncate text-xs text-side-muted">{me?.email}</p>
          </div>
          <Link to="/trocar-senha" onClick={closeDrawer} className="block rounded-md px-3 py-2 text-sm font-medium text-side-fg hover:bg-side-active">
            Trocar senha
          </Link>
          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-side-muted">Tema</span>
            <ThemeToggle />
          </div>
        </div>
      </Drawer>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-page/95 px-4 lg:px-8">
          <Button variant="secondary" size="sm" className="w-9 px-0 lg:hidden" aria-label="Abrir menu" aria-haspopup="dialog" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </Button>
          <span className="flex items-center gap-2 font-display text-lg font-semibold text-fg lg:hidden">
            <BrandMark size={26} />
            PDV Restaurante
          </span>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle className="hidden sm:inline-flex" />
            <span aria-hidden="true" className="hidden h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent sm:flex">
              {initials(me?.nome)}
            </span>
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold leading-tight text-fg">{me?.nome}</p>
              <p className="truncate text-xs text-muted">{me?.papeis.join(", ")}</p>
            </div>
            <Link to="/trocar-senha" className="hidden rounded-md px-2 py-1 text-sm font-medium text-brand-text underline decoration-brand-text/30 underline-offset-4 hover:decoration-brand-text sm:block">
              Trocar senha
            </Link>
            <Button size="sm" variant="secondary" onClick={() => void logout()}>
              <LogoutIcon width={16} height={16} />
              Sair
            </Button>
          </div>
        </header>

        <main id="conteudo" tabIndex={-1} className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-9">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
