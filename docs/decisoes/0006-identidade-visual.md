# 0006 — Identidade visual e impressão

**Status:** vigente. **Código:** `frontend/src/index.css`, `components/*`, `components/pdv/{PrintArea,receipt}.tsx`.

## Decisão

Visual "papel e tinta": fundo de papel quente, tinta escura, **verde-pinho** como cor de marca e **brasa**
(laranja) só em marcas pontuais (logo, marcador do menu, aba ativa, foco). Menu lateral escuro nos dois
temas. Cantos secos (raio 3–7 px) e sombras de "borda de papel" em vez de balões. Rótulos técnicos
(`.eyebrow`) e valores numéricos (`.tabular-nums`) em mono, como num tíquete. Marca própria: um tíquete
de comanda serrilhado (`BrandMark`).

## Por quê

- O visual anterior (indigo sobre cartões brancos, fonte do sistema) não tinha identidade e lembrava
  qualquer painel genérico. A tipografia é a alavanca principal: Instrument Sans (texto) e IBM Plex Mono
  (números e rótulos).
- Mesa ocupada **inverte** (tinta no claro, papel no escuro) para o salão ser lido de longe; livre é papel em
  branco; conta pedida leva faixa âmbar; reservada é tracejada e bloqueada é hachurada. O estado nunca
  depende só da cor (ícone + texto continuam).

## Restrições que não são óbvias

- **Fontes self-hosted** (`@fontsource-variable/instrument-sans`, `@fontsource/ibm-plex-mono`, licença OFL):
  a CSP do Nginx é `default-src 'self'`, então fonte de CDN seria bloqueada. No build entram só os
  subconjuntos latinos (o mono em 3 pesos; o Instrument Sans variável, com o latino estendido baixado
  apenas se algum caractere dele aparecer).
- **Nada de `text-transform: uppercase` em texto que o E2E lê por `innerText`** (rótulos de caixa, selos,
  linhas de estoque): `innerText` devolve o texto transformado e quebraria as asserções. Caixa alta fica
  só em cabeçalhos de tabela, `.eyebrow` e rótulos que nenhum teste lê.
- **Tokens semânticos** (`bg-surface`, `text-muted`...) continuam sendo o único jeito de colorir; o tema
  escuro é só trocar as variáveis. `.inverse` redefine as variáveis num bloco (cartão de mesa ocupada, aviso
  toast) para os filhos herdarem sem classes extras. Pares de cor conferidos: texto ≥ 4,5:1, borda de
  controle e foco ≥ 3:1, nos dois temas.
- **Impressão** sai preto no branco por regra (`PRINT_CSS` zera cores e fundos): a hierarquia do recibo vem
  de peso, tamanho, filetes (tracejado, pontilhado, duplo) e do mono, não de cinza. Estrutura em
  `receipt.tsx`, estilo em `PRINT_CSS` sob `.rc`.
- A borda serrilhada do login usa `mask` com `conic-gradient` (`.ticket-edge`); sem suporte, o cartão
  só fica com a borda reta.
