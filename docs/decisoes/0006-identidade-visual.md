# 0006 — Identidade visual, tema e navegação

**Status:** vigente. **Código:** `frontend/src/index.css`, `components/*`, `lib/{theme,preferences}.ts`,
`app/{navigation,useNavOpen,AppLayout}`, `components/pdv/{PrintArea,receipt}.tsx`.

## Decisão

O sistema segue o sistema de design da RastroSystem, como desenhado no projeto "ERP Restaurante redesenhado"
(Claude Design): **teal** como cor de ação (`#00797c` no claro, `#26c5c7` no escuro), neutros frios, **Inter** em
todo o texto (inclusive valores grandes e recibo), lateral grafite (`#1b1d1f`) nos dois temas, cartões planos
separados por filete (sem sombra), cantos de 4 a 12 px e selos retangulares de 4 px. Cada situação tem um tom
próprio (verde livre/fechada/paga, azul aberta/ocupada, âmbar a vencer/conta pedida, vermelho vencida/erro,
cinza neutro).

Marca provisória: um "R" sobre quadrado teal, com o nome **ERP Restaurante** (antes "PDV Restaurante").
Entrada em duas colunas (painel grafite com a frase do sistema e o formulário num cartão; só a tela de login
traz no painel uma ilustração do próprio sistema, em SVG, `features/auth/LoginArt.tsx`), página inicial em
atalhos com a inicial de cada tela, salão em cartões de mesa com selo de situação e legenda.

Menu lateral em **módulos e submódulos** (Atendimento, Vendas, Financeiro, Estoque, Cadastros, Relatórios,
Administração), definidos em `app/navigation.ts`; o mesmo mapa alimenta o menu, a gaveta do celular e os atalhos
da página inicial. Rótulo de módulo em caixa-alta no menu; item ativo com filete teal. **Tema claro, escuro ou do
sistema**, com alternância manual no topo.

## Por quê

- A identidade anterior ("cozinha de casa": papel cremoso, verde-folha, terracota, Fraunces/Figtree) era própria
  deste produto. Em 2026-10-14 o responsável pelo produto pediu para seguir o desenho feito no Claude Design,
  que parte do sistema de design da RastroSystem (mesmas cores, tipografia e componentes dos demais sistemas),
  para o restaurante não destoar do resto da família.
- Cor com função: teal só para ação e foco; estado é sempre selo com texto (a cor reforça, nunca é a única pista).
- Com 16 telas o menu plano deixou de caber e de se explicar. Agrupar por assunto deixa o dia a dia (Atendimento,
  Vendas, Financeiro) aberto e o resto recolhido; o módulo da página atual sempre abre, e a escolha é lembrada.

## Onde o código se afasta do desenho (de propósito)

- **Três estados de tema.** O desenho só mostra Claro/Escuro; o app mantém "sistema" (padrão) porque o teste
  `nav-tema.spec.ts` e o `theme-init.js` dependem dele e porque é o comportamento esperado por quem usa o
  navegador no escuro.
- **Borda de campo de formulário mais escura** (`--c-control-line`: `#8a919b` no claro, `#6b727b` no escuro). A
  borda do desenho (`#c3c8d0`) tem ~1,7:1 contra o fundo; num campo ela é a única pista de onde clicar, então
  precisa de 3:1 (WCAG 1.4.11). Botões e cartões usam a borda do desenho.
- **Conteúdo com largura máxima de 90 rem**, centralizado: o desenho não define o comportamento em tela larga.
- **Recibo e folha de relatório em Inter**, preto no branco: sai igual ao desenho, sem a máquina de escrever.

## Restrições que não são óbvias

- **Fonte self-hosted** (`@fontsource-variable/inter`, licença OFL): a CSP do Nginx é `default-src 'self'`, então
  fonte de CDN (o `colors_and_type.css` do sistema de design importa do Google Fonts) seria bloqueada. Os
  `@font-face` estão escritos à mão em `index.css` só com os subconjuntos latino e latino estendido: o `wght.css`
  do pacote traria também grego, cirílico e vietnamita no build.
- **Tema por atributo.** `<html data-theme="light|dark">`; sem atributo, segue `prefers-color-scheme`. O script
  `public/theme-init.js` aplica o tema salvo antes da primeira pintura (a CSP só aceita script do próprio
  domínio, então não pode ser inline) e precisa ficar em sincronia com `lib/theme.ts`.
- **Armazenamento só em `lib/preferences.ts`.** Tema e módulos abertos do menu usam `localStorage`; o teste
  `client.test.ts` garante que nenhum outro arquivo lê ou grava ali e que esse não lida com token nem senha
  (a sessão continua só em memória).
- **Tokens semânticos** (`bg-surface`, `text-muted`...) continuam sendo o único jeito de colorir; o tema escuro é
  trocar as variáveis. Há um tom `info` (azul) para "aberta/ocupada" e um `neutral` para selos sem estado; o
  botão de perigo usa `on-danger` (texto branco nos dois temas: `on-brand` vira escuro no tema escuro). Pares
  de cor conferidos: texto ≥ 4,5:1, borda de campo e foco ≥ 3:1, nos dois temas.
- **Cabeçalho de tabela e rótulo de módulo do menu em caixa-alta** via CSS. Não usar `text-transform: uppercase`
  em texto que o E2E lê por `innerText` do `main` (rótulos de caixa, selos, linhas de estoque, rótulos dos
  cartões de indicador): `innerText` devolve o texto transformado e quebraria as asserções.
- **Botão de ícone com `px-0!`.** O tamanho do `Button` já traz `px-3`/`px-4`; sem o `!`, a largura fixa deixa
  o ícone com poucos pixels e ele encolhe.
- **O teste de tema confere a cor real do fundo** (`rgb(243, 244, 246)` no claro, `rgb(17, 18, 20)` no escuro);
  mudou junto com a paleta e precisa mudar de novo se a paleta mudar.
- **Rótulo repetido, nome acessível próprio.** "Vendas" existe em Vendas e em Relatórios; os links de relatório
  levam `aria-label` ("Relatório de vendas") para não haver dois links com o mesmo nome.
- **Impressão** sai preto no branco por regra (`PRINT_CSS` zera cores e fundos): a hierarquia do recibo vem de
  peso, tamanho, filetes (tracejado, pontilhado, duplo) e do título. Estrutura em `receipt.tsx`, estilo em
  `PRINT_CSS` sob `.rc`.
