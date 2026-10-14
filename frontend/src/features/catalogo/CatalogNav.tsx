import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/produtos", label: "Produtos" },
  { to: "/categorias", label: "Categorias" },
  { to: "/unidades", label: "Unidades" },
];

/** Atalhos entre as páginas do catálogo (produtos, categorias e unidades). */
export function CatalogNav() {
  return (
    <nav aria-label="Catálogo" className="mb-5 flex gap-1 border-b border-line">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? "border-brand text-brand-text" : "border-transparent text-muted hover:text-fg"}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
