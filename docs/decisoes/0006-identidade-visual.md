# 0006 — Identidade visual, tema e navegação

**Status:** vigente. **Código:** `frontend/src/index.css`, `components/*`, `lib/{theme,preferences}.ts`,
`app/{navigation,useNavOpen,AppLayout}`, `components/pdv/{PrintArea,receipt}.tsx`.

## Decisão

Visual "cozinha de casa": fundo de papel cremoso, tinta marrom-escura, **verde-folha** nas ações, amarelo-gema
como marca-texto e **terracota** para mesa em uso. Títulos e valores grandes em **Fraunces** (serifada macia,
com jeito de cardápio); texto em **Figtree**; o recibo impresso em **Courier Prime** (máquina de escrever). Cantos
macios (6–18 px), sombras quentes, botões "de apertar", ilustrações de traço solto nos estados vazios e na tela de
entrada, e um pictograma de mesa com uma cadeira por lugar no salão.

Menu lateral em **módulos e submódulos** (Atendimento, Vendas, Financeiro, Estoque, Cadastros, Relatórios,
Administração), definidos em `app/navigation.ts`; o mesmo mapa alimenta o menu, a gaveta do celular e os atalhos
da página inicial. **Tema claro, escuro ou do sistema**, com alternância manual no topo.

## Por quê

- A primeira versão ("papel e tinta": rótulos em mono, borda de tíquete, tracejados por toda parte) ainda lia como
  gerada por máquina: muito ornamento uniforme e nenhuma personalidade de restaurante. A segunda troca o
  ornamento por tipografia com caráter, cor com função e pequenos toques de mão (marca-texto, ilustrações).
- Com 16 telas o menu plano deixou de caber e de se explicar. Agrupar por assunto deixa o dia a dia (Atendimento,
  Vendas, Financeiro) aberto e o resto recolhido; o módulo da página atual sempre abre, e a escolha é lembrada.
- Mesa livre é papel limpo; ocupada, terracota; conta pedida, amarelo-gema; reservada, tracejada; bloqueada,
  hachurada. O estado nunca depende só da cor (ícone e texto continuam).

## Restrições que não são óbvias

- **Fontes self-hosted** (`@fontsource-variable/{fraunces,figtree}`, `@fontsource/courier-prime`, licença OFL): a
  CSP do Nginx é `default-src 'self'`, então fonte de CDN seria bloqueada. Só os subconjuntos latinos entram no
  build (o latino estendido de cada família é baixado apenas se algum caractere dele aparecer).
- **Tema por atributo.** `<html data-theme="light|dark">`; sem atributo, segue `prefers-color-scheme`. O script
  `public/theme-init.js` aplica o tema salvo antes da primeira pintura (a CSP só aceita script do próprio
  domínio, então não pode ser inline) e precisa ficar em sincronia com `lib/theme.ts`.
- **Armazenamento só em `lib/preferences.ts`.** Tema e módulos abertos do menu usam `localStorage`; o teste
  `client.test.ts` garante que nenhum outro arquivo lê ou grava ali e que esse não lida com token nem senha
  (a sessão continua só em memória).
- **Tokens semânticos** (`bg-surface`, `text-muted`...) continuam sendo o único jeito de colorir; o tema escuro é
  trocar as variáveis. Pares de cor conferidos: texto ≥ 4,5:1, borda de controle e foco ≥ 3:1, nos dois temas.
- **Nada de `text-transform: uppercase` em texto que o E2E lê por `innerText`** (rótulos de caixa, selos, linhas de
  estoque): `innerText` devolve o texto transformado e quebraria as asserções.
- **Rótulo repetido, nome acessível próprio.** "Vendas" existe em Vendas e em Relatórios; os links de relatório
  levam `aria-label` ("Relatório de vendas") para não haver dois links com o mesmo nome.
- **Impressão** sai preto no branco por regra (`PRINT_CSS` zera cores e fundos): a hierarquia do recibo vem de
  peso, tamanho, filetes (tracejado, pontilhado, duplo) e do título serifado. Estrutura em `receipt.tsx`, estilo
  em `PRINT_CSS` sob `.rc`.
