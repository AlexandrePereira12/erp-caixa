/*
 * Ilustração da entrada: uma amostra do próprio sistema (mapa do salão, uma comanda e o caixa) desenhada
 * nas cores do painel grafite. Cores fixas de propósito: o painel é grafite nos dois temas. É só enfeite
 * (valores inventados), por isso fica escondida de leitores de tela.
 */
type Situacao = "livre" | "ocupada" | "conta";

const SITUACAO: Record<Situacao, { texto: string; largura: number; fundo: string; cor: string }> = {
  livre: { texto: "Livre", largura: 36, fundo: "rgb(46 125 50 / 0.24)", cor: "#7fd68a" },
  ocupada: { texto: "Ocupada", largura: 52, fundo: "rgb(25 118 210 / 0.22)", cor: "#7db8f0" },
  conta: { texto: "Conta pedida", largura: 72, fundo: "rgb(249 168 37 / 0.16)", cor: "#f5c04a" },
};

const MESAS: { nome: string; situacao: Situacao; total?: string; comanda?: string }[] = [
  { nome: "Mesa 1", situacao: "livre" },
  { nome: "Mesa 2", situacao: "ocupada", total: "R$ 46,00", comanda: "Comanda #19" },
  { nome: "Mesa 3", situacao: "livre" },
  { nome: "Mesa 4", situacao: "conta", total: "R$ 52,00", comanda: "Comanda #21" },
  { nome: "Mesa 5", situacao: "livre" },
  { nome: "Mesa 6", situacao: "livre" },
];

const ITENS = [
  ["1× Hambúrguer", "R$ 28,00"],
  ["2× Refrigerante", "R$ 12,00"],
  ["1× Pudim", "R$ 12,00"],
] as const;

export function LoginArt({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 520 380" className={`overflow-visible ${className}`}>
      <defs>
        <radialGradient id="login-art-brilho" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#26c5c7" stopOpacity="0.16" />
          <stop offset="1" stopColor="#26c5c7" stopOpacity="0" />
        </radialGradient>
        <filter id="login-art-sombra" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>
      <ellipse cx="260" cy="190" rx="260" ry="190" fill="url(#login-art-brilho)" />

      {/* mapa do salão */}
      <rect x="10" y="30" width="350" height="270" rx="14" fill="#1a1c1f" stroke="#2e3136" />
      <text x="30" y="62" fontSize="15" fontWeight="700" fill="#ececee">
        Salão
      </text>
      {(["livre", "ocupada", "conta"] as const).map((s, i) => (
        <g key={s}>
          <circle cx={[168, 220, 286][i]} cy="58" r="4" fill={SITUACAO[s].cor} />
          <text x={[176, 228, 294][i]} y="62" fontSize="10" fill="#9ca3af">
            {s === "conta" ? "Conta" : SITUACAO[s].texto}
          </text>
        </g>
      ))}
      {MESAS.map((mesa, i) => {
        const x = 30 + (i % 3) * 106;
        const y = 84 + Math.floor(i / 3) * 102;
        const s = SITUACAO[mesa.situacao];
        const aberta = mesa.total !== undefined;
        return (
          <g key={mesa.nome}>
            <rect x={x} y={y} width="96" height="90" rx="8" fill={aberta ? "#1a1c1f" : "#212327"} stroke={aberta ? "#454a51" : "#2e3136"} />
            <text x={x + 12} y={y + 24} fontSize="12" fontWeight="700" fill="#ececee">
              {mesa.nome}
            </text>
            <rect x={x + 12} y={y + 32} width={s.largura} height="16" rx="4" fill={s.fundo} />
            <text x={x + 12 + s.largura / 2} y={y + 43.5} fontSize="9.5" fontWeight="700" fill={s.cor} textAnchor="middle">
              {s.texto}
            </text>
            {aberta ? (
              <>
                <text x={x + 12} y={y + 69} fontSize="14" fontWeight="700" fill="#ececee">
                  {mesa.total}
                </text>
                <text x={x + 12} y={y + 82} fontSize="9.5" fill="#9ca3af">
                  {mesa.comanda}
                </text>
              </>
            ) : (
              <text x={x + 12} y={y + 72} fontSize="10" fill="#9ca3af">
                4 lugares
              </text>
            )}
          </g>
        );
      })}

      {/* caixa */}
      <rect x="10" y="318" width="210" height="46" rx="10" fill="#1a1c1f" stroke="#2e3136" />
      <circle cx="31" cy="341" r="5" fill="#7fd68a" />
      <text x="46" y="337" fontSize="11" fontWeight="700" fill="#ececee">
        Caixa #3 aberto
      </text>
      <text x="46" y="352" fontSize="10" fill="#9ca3af">
        R$ 1.240,00 na gaveta
      </text>

      {/* faturamento */}
      <rect x="370" y="14" width="140" height="96" rx="12" fill="#1a1c1f" stroke="#2e3136" />
      <text x="384" y="38" fontSize="10" fill="#9ca3af">
        Faturamento hoje
      </text>
      <text x="384" y="64" fontSize="17" fontWeight="700" fill="#ececee">
        R$ 4.860,00
      </text>
      <polyline points="384,97 404,90 424,94 444,82 464,86 484,76 496,79" fill="none" stroke="#26c5c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* comanda */}
      <g filter="url(#login-art-sombra)">
        <rect x="316" y="130" width="194" height="240" rx="14" fill="#212327" stroke="#454a51" />
      </g>
      <text x="332" y="160" fontSize="14" fontWeight="700" fill="#ececee">
        Comanda #21
      </text>
      <text x="332" y="177" fontSize="11" fill="#9ca3af">
        Mesa 4
      </text>
      <rect x="332" y="188" width="72" height="18" rx="4" fill={SITUACAO.conta.fundo} />
      <text x="368" y="200.5" fontSize="10" fontWeight="700" fill={SITUACAO.conta.cor} textAnchor="middle">
        Conta pedida
      </text>
      {ITENS.map(([nome, valor], i) => (
        <g key={nome}>
          <text x="332" y={229 + i * 22} fontSize="11" fill="#ececee">
            {nome}
          </text>
          <text x="494" y={229 + i * 22} fontSize="11" fill="#ececee" textAnchor="end">
            {valor}
          </text>
        </g>
      ))}
      <line x1="332" y1="292" x2="494" y2="292" stroke="#454a51" strokeDasharray="4 4" />
      <text x="332" y="316" fontSize="11" fill="#9ca3af">
        Total
      </text>
      <text x="494" y="318" fontSize="18" fontWeight="700" fill="#ececee" textAnchor="end">
        R$ 52,00
      </text>
      <rect x="332" y="332" width="162" height="28" rx="6" fill="#26c5c7" />
      <text x="413" y="350" fontSize="11.5" fontWeight="700" fill="#00282a" textAnchor="middle">
        Fechar conta
      </text>
    </svg>
  );
}
