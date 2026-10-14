/** Marca do sistema: um "R" sobre um quadrado teal (o logotipo funciona com qualquer nome). */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className={`flex shrink-0 items-center justify-center rounded-lg bg-[#26c5c7] font-bold leading-none text-[#00282a] ${className}`}
    >
      R
    </span>
  );
}
