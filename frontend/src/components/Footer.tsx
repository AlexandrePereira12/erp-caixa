import { Link } from "react-router-dom";

/** Rodapé de todas as telas: nome do sistema, direitos e o link para os créditos. */
export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`grid gap-1 border-t border-line px-4 py-5 text-center text-[0.8125rem] text-muted ${className}`}>
      <p>
        <strong className="font-bold text-fg">
          ERP <span className="text-brand-text">Restaurante</span>
        </strong>{" "}
        · Gestão de salão, comandas e caixa para restaurantes.
      </p>
      <p>
        © {new Date().getFullYear()} alexandre-dev. Todos os direitos reservados. ·{" "}
        <Link to="/creditos" className="underline underline-offset-[3px] hover:text-fg">
          Créditos
        </Link>
      </p>
    </footer>
  );
}
