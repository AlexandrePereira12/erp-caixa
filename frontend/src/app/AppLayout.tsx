import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { HOME_ITEM, NAV_MODULES, type NavItem, type NavModule } from "./navigation";
import { useNavOpen } from "./useNavOpen";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Drawer } from "@/components/Drawer";
import { Footer } from "@/components/Footer";
import { ChevronRightIcon, MenuIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { logout } from "@/lib/auth/auth";
import { usePermissions } from "@/lib/auth/hooks";

function Brand() {
  return (
    <div className="flex items-center gap-3 px-4 text-side-fg">
      <BrandMark size={32} />
      <span className="leading-[1.1]">
        <span className="block text-[0.625rem] tracking-[0.16em] text-side-muted">ERP</span>
        <span className="block text-[1.0625rem] font-semibold">Restaurante</span>
      </span>
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

const linkBase = "relative flex w-full items-center rounded-md text-left transition-colors motion-reduce:transition-none focus-visible:outline-side-accent";

function NavLinkItem({ item, onNavigate, nested }: { item: NavItem; onNavigate: (() => void) | undefined; nested: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      {...(item.ariaLabel ? { "aria-label": item.ariaLabel } : {})}
      className={({ isActive }) =>
        `${linkBase} px-3 ${nested ? "h-[2.125rem] text-[0.84rem]" : "h-10 text-sm"} ${
          isActive
            ? `bg-side-active font-semibold text-side-fg ${nested ? "shadow-[inset_2px_0_0_var(--c-side-accent)]" : ""}`
            : `${nested ? "" : "font-medium"} text-side-item hover:bg-side-active/60 hover:text-side-fg`
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

function NavGroup({ module, items, isOpen, isActive, onToggle, onNavigate }: { module: NavModule; items: NavItem[]; isOpen: boolean; isActive: boolean; onToggle: () => void; onNavigate: (() => void) | undefined }) {
  const listId = `nav-${module.id}`;
  return (
    <li className="mb-0.5">
      <button type="button" onClick={onToggle} aria-expanded={isOpen} aria-controls={listId} className={`${linkBase} h-9 gap-2 px-3 hover:bg-side-active/60`}>
        <span className={`flex-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] ${isActive ? "text-side-accent" : "text-side-label"}`}>{module.label}</span>
        {isActive && !isOpen && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-side-accent" />}
        <ChevronRightIcon width={16} height={16} className={`text-side-muted transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`} />
      </button>
      <ul id={listId} hidden={!isOpen} className="mb-1.5 ml-[1.125rem] mt-0.5 space-y-px border-l border-side-line pl-2">
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
    <nav aria-label="Principal" className="flex-1 overflow-y-auto p-3">
      <ul>
        <li className="mb-0.5">
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

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-side text-side-fg lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-side-line">
          <Brand />
        </div>
        <NavList />
      </aside>

      <Drawer open={drawerOpen} onClose={closeDrawer} label="Menu de navegação">
        <div className="flex h-16 shrink-0 items-center border-b border-side-line">
          <Brand />
        </div>
        <NavList onNavigate={closeDrawer} />
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-side-line p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-side-fg">{me?.nome}</p>
            <p className="truncate text-xs text-side-muted">{me?.email}</p>
          </div>
          <Link to="/trocar-senha" onClick={closeDrawer} className="text-sm font-semibold text-side-fg hover:underline">
            Trocar senha
          </Link>
          <div className="flex items-center justify-between">
            <span className="text-xs text-side-muted">Tema</span>
            <ThemeToggle />
          </div>
        </div>
      </Drawer>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:justify-end lg:gap-5 lg:px-8">
          <Button variant="secondary" className="w-10 px-0! lg:hidden" aria-label="Abrir menu" aria-haspopup="dialog" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </Button>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg lg:hidden">ERP Restaurante</span>

          <div className="hidden shrink-0 items-center gap-5 lg:flex">
            <ThemeToggle />
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand">
                {initials(me?.nome)}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[0.8125rem] font-semibold text-fg">{me?.nome}</p>
                <p className="truncate text-xs text-muted">{me?.papeis.join(", ")}</p>
              </div>
            </div>
            <Link to="/trocar-senha" className="text-[0.8125rem] font-medium text-fg underline underline-offset-[3px] hover:text-brand-text">
              Trocar senha
            </Link>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void logout()}>
            Sair
          </Button>
        </header>

        <main id="conteudo" tabIndex={-1} className="flex-1 px-4 pb-12 pt-4 outline-none lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-[90rem]">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
