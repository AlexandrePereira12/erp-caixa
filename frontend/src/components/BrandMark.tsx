/** Marca do sistema: um prato visto de cima sobre um quadrado amarelo-gema. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="9" fill="#f2b32e" />
      <circle cx="16" cy="16" r="9" fill="#fffdf8" />
      <circle cx="16" cy="16" r="5.6" fill="none" stroke="#2a2318" strokeWidth="1.5" />
    </svg>
  );
}
