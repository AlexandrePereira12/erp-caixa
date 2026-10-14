import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function icon(paths: string[]) {
  return function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

/** Pessoas (cartão de contato). */
export const ContactsIcon = icon(["M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M7.5 17a4.5 4.5 0 0 1 9 0"]);
/** Produtos (caixa). */
export const BoxIcon = icon(["M21 8l-9-5-9 5 9 5 9-5z", "M3 8v8l9 5 9-5V8", "M12 13v8"]);
/** Estoque (prateleiras). */
export const StockIcon = icon(["M3 21V9l9-6 9 6v12", "M3 21h18", "M8 21v-7h8v7", "M8 17.5h8"]);
/** Inventários (prancheta com marcação). */
export const ClipboardCheckIcon = icon(["M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z", "M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2", "M9 14l2 2 4-4"]);
