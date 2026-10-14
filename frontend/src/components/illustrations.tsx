import type { SVGProps } from "react";

/*
 * Ilustrações de apoio (estados vazios, tela de entrada): traço solto, cores do tema. Decorativas
 * (aria-hidden): o texto ao lado diz o que importa.
 */
type Props = SVGProps<SVGSVGElement>;

const ink = { stroke: "var(--c-fg)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function Svg({ children, ...props }: Props) {
  return (
    <svg aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

/** Prato com ovo, garfo e faca: lista vazia. */
export function PlateScene(props: Props) {
  return (
    <Svg viewBox="0 0 160 110" {...props}>
      <path d="M12 93c38 3 100-3 136 0" {...ink} opacity={0.5} />
      <ellipse cx="80" cy="70" rx="45" ry="15" {...ink} fill="var(--c-surface)" />
      <ellipse cx="80" cy="69" rx="31" ry="9" {...ink} opacity={0.35} />
      <ellipse cx="78" cy="68" rx="15" ry="7.5" fill="#fffdf8" stroke="var(--c-fg)" strokeWidth="1.6" />
      <circle cx="80" cy="67" r="4.6" fill="var(--c-accent)" stroke="var(--c-fg)" strokeWidth="1.4" />
      <path d="M24 44v42M20 44v13M24 44v13M28 44v13M20 57c1 7 7 7 8 0" {...ink} />
      <path d="M136 44c8 9 8 20 0 30M136 74v12" {...ink} />
      <path d="M66 38c-4-5 3-8-1-13M80 36c-4-5 3-8-1-13M94 38c-4-5 3-8-1-13" {...ink} strokeWidth={1.6} opacity={0.45} />
    </Svg>
  );
}

/** Mesa com duas cadeiras e uma luminária: salão sem mesas, tela de entrada. */
export function TableScene(props: Props) {
  return (
    <Svg viewBox="0 0 220 160" {...props}>
      <path d="M110 0v30" {...ink} />
      <path d="M92 52c0-14 8-22 18-22s18 8 18 22z" fill="var(--c-accent)" stroke="var(--c-fg)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M96 60c8 5 20 5 28 0" {...ink} strokeWidth={1.4} opacity={0.4} />
      <ellipse cx="110" cy="106" rx="72" ry="14" fill="var(--c-surface)" stroke="var(--c-fg)" strokeWidth="2" />
      <path d="M110 120v28M90 148h40" {...ink} />
      <path d="M28 76v56M28 108h30M31 108v24M55 108v24" {...ink} />
      <path d="M192 76v56M192 108h-30M189 108v24M165 108v24" {...ink} />
      <path d="M100 96c-2-10 2-16 10-18 8 2 12 8 10 18z" fill="var(--c-brand-soft)" stroke="var(--c-fg)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M110 78c-6-9-4-16 2-20M110 78c7-7 11-6 14-2" {...ink} strokeWidth={1.6} />
    </Svg>
  );
}

/** Comanda com linhas e uma moeda: sem vendas, sem contas. */
export function ReceiptScene(props: Props) {
  return (
    <Svg viewBox="0 0 160 120" {...props}>
      <path d="M44 12h66v90l-8-7-8 7-8-7-8 7-8-7-8 7-8-7-8 7V12z" fill="var(--c-surface)" stroke="var(--c-fg)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M58 34h38M58 48h26M58 62h34" {...ink} opacity={0.55} />
      <path d="M58 80c6-6 8 4 14-2s8 4 16-2" {...ink} strokeWidth={2.4} />
      <circle cx="118" cy="86" r="17" fill="var(--c-accent)" stroke="var(--c-fg)" strokeWidth="2" />
      <circle cx="118" cy="86" r="10" {...ink} strokeWidth={1.6} opacity={0.55} />
    </Svg>
  );
}
