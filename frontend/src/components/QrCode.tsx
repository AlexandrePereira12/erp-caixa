import { useMemo } from "react";
import { encode } from "uqr";

/** Margem de 4 módulos ao redor (o mínimo da norma): sem ela alguns leitores não acham o QR. */
const MARGEM = 4;

/**
 * QR Code do texto, desenhado em SVG no próprio navegador (nada sai da máquina). Módulos pretos sobre
 * fundo branco nos dois temas: leitor de QR precisa de contraste claro/escuro, o tema do sistema não vale.
 */
export function QrCode({ value, label, size = 224, className = "" }: { value: string; label: string; size?: number; className?: string }) {
  const qr = useMemo(() => {
    try {
      const { data } = encode(value, { ecc: "M", border: MARGEM });
      // Cada trecho contínuo de módulos pretos numa linha vira um retângulo só: SVG bem menor.
      const path = data
        .map((row, y) => {
          const runs: string[] = [];
          for (let x = 0; x < row.length; x++) {
            if (!row[x]) continue;
            let end = x;
            while (end + 1 < row.length && row[end + 1]) end++;
            runs.push(`M${x} ${y}h${end - x + 1}v1h-${end - x + 1}z`);
            x = end;
          }
          return runs.join("");
        })
        .join("");
      return { path, count: data.length };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${qr.count} ${qr.count}`} width={size} height={size} shapeRendering="crispEdges" className={`rounded-md border border-line ${className}`}>
      <rect width={qr.count} height={qr.count} fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}
