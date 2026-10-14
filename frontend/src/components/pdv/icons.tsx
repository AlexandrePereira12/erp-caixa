import type { SVGProps } from "react";

/* Ícones da operação do PDV (mesmo traço dos ícones de components/icons.tsx). */
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

export const TableIcon = icon(["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"]);
export const ReceiptIcon = icon(["M6 3h12v18l-3-2-3 2-3-2-3 2V3z", "M9 8h6", "M9 12h6"]);
export const CashIcon = icon(["M3 7h18v10H3z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M6 10h.01", "M18 14h.01"]);
export const BagIcon = icon(["M5 8h14l-1 12H6L5 8z", "M9 8V6a3 3 0 0 1 6 0v2"]);
export const WalletIcon = icon([
  "M3 7a2 2 0 0 1 2-2h13v4",
  "M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z",
  "M16 14h.01",
]);
export const CardIcon = icon(["M3 6h18v12H3z", "M3 10h18", "M7 15h3"]);
export const ArchiveIcon = icon(["M3 5h18v4H3z", "M5 9v10h14V9", "M10 13h4"]);
export const PrinterIcon = icon([
  "M7 9V3h10v6",
  "M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",
  "M7 14h10v7H7z",
]);
export const MinusIcon = icon(["M5 12h14"]);
export const BanIcon = icon(["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M5.6 5.6l12.8 12.8"]);
export const ClockIcon = icon(["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"]);
export const UserIcon = icon(["M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]);
export const SwapIcon = icon(["M7 7h13", "M16 3l4 4-4 4", "M17 17H4", "M8 13l-4 4 4 4"]);
export const CalendarIcon = icon(["M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M16 3v4", "M8 3v4", "M4 11h16"]);
export const RefreshIcon = icon(["M20 11a8 8 0 0 0-14.9-3", "M4 4v4h4", "M4 13a8 8 0 0 0 14.9 3", "M20 20v-4h-4"]);
export const PencilIcon = icon(["M4 20h4L19 9l-4-4L4 16v4z", "M13.5 6.5l4 4"]);
export const UtensilsIcon = icon(["M6 3v7a2 2 0 0 0 2 2v9", "M10 3v7a2 2 0 0 1-2 2", "M18 3c-2 1-3 4-3 7h3v11"]);
export const SplitIcon = icon(["M12 3v6", "M12 9l-6 6v6", "M12 9l6 6v6"]);
export const ArrowRightIcon = icon(["M5 12h14", "M13 6l6 6-6 6"]);
export const ChevronDownIcon = icon(["M6 9l6 6 6-6"]);
export const TrashIcon = icon(["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"]);
export const FlagIcon = icon(["M5 21V4", "M5 4h12l-2 4 2 4H5"]);
