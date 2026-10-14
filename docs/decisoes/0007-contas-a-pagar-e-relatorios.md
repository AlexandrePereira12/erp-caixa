# 0007 — Contas a pagar, compras e relatório de produtos

**Status:** vigente (extensão da Fase 4). **Código:** `modules/payables`, `modules/inventory` (fornecedor na
entrada), `modules/reports` (compras e produtos), migration `0005`.

## Contas a pagar

Duas tabelas, no mesmo desenho das contas a receber: `titulo_pagar` (mutável, com autoria) e
`titulo_pagar_baixa` (**append-only**: trigger + sem UPDATE/DELETE para o role da API). Reaproveitar o
desenho é a decisão: trava do título, idempotência por chave e estorno por lançamento inverso já foram
provados em produção de teste, e quem mantém o sistema lê um só padrão.

### O pagamento não movimenta o caixa

A baixa de uma conta a pagar é **registro financeiro/gerencial**. A `forma_pagamento_id` é informativa
(serve para o gerente saber "paguei por PIX"), não gera movimento de caixa e não exige caixa aberto.

- O caixa do sistema é a **gaveta de um operador em um turno**, conferida por forma de pagamento no
  fechamento. Boleto e PIX da conta da empresa não passam pela gaveta; lançá-los no caixa faria o
  esperado de cada forma divergir do contado e obrigaria quem paga contas (financeiro, fora do horário de
  loja) a abrir caixa só para registrar.
- Pagar fornecedor com o dinheiro da gaveta continua sendo a **sangria do caixa** (que já exige descrição
  e confere o saldo em dinheiro). As duas coisas não se somam: quem sangra para pagar e também baixa a
  conta registra o pagamento na conta e a saída na gaveta, cada um no seu lugar.
- Forma `fiado` é recusada (fiado é uma venda a prazo, não um meio de pagamento de despesa).
- **Default a confirmar** (ver `decisoes-pendentes.md`). Alternativa: baixa em dinheiro gerar saída no
  caixa aberto do operador.

### "Vencido" é calculado, não gravado

O `status` guardado é só `aberto | pago | cancelado`. A **situação** (`a_vencer`, `vencido`, `pago`,
`cancelado`) e `dias_para_vencer` saem do vencimento e do dia de hoje **no fuso da empresa**
(`core/tempo.hoje_da_empresa`), em toda consulta e em todo filtro SQL.

- Gravar "vencido" exigiria um job diário e ficaria errado entre a virada do dia e a execução; trocar o
  fuso da empresa ou estornar um pagamento teria de reescrever o estado. Calculado, nunca fica velho.
- Vence **hoje** ainda é `a_vencer` (vencido é a partir do dia seguinte); `dias_para_vencer = 0`.
  Negativo = dias de atraso. Só existe em título aberto (`null` em pago e cancelado).
- Teste com `Pacific/Pago_Pago` (UTC-11) e `Pacific/Kiritimati` (UTC+14), 25 h afastados: o mesmo
  vencimento é `a_vencer` num e `vencido` no outro, a qualquer hora em que o teste rode.

### Regras de edição, cancelamento e estorno

- **Valor** só muda enquanto a conta **não tem nenhuma baixa**, nem estornada: pagamentos e estornos foram
  lançados sobre aquele valor, e mudá-lo depois deixaria o histórico (e a auditoria) contando outra
  história. Com qualquer baixa → 409 `titulo_com_baixas`; o caminho para corrigir é cancelar a conta
  (permitido quando não há pagamento vigente) e lançar outra. Os demais campos continuam editáveis
  (inclusive em título pago); título cancelado é congelado.
- **Fornecedor e categoria** só são revalidados quando mudam: uma conta cujo fornecedor foi desativado
  depois continua editável nos outros campos. Fornecedor exige pessoa ativa com o papel `fornecedor`;
  categoria exige tipo `despesa` e ativa (422 com mensagem dizendo qual regra falhou).
- **Cancelar** exige motivo; só sem pagamento vigente; título pago não cancela (estorne antes).
- **Estorno de baixa** cria a baixa inversa (valor negativo, `estorno_de_id` único: um estorno por
  baixa), devolve o título a `aberto` e exige motivo. A baixa inversa **herda a data da baixa original**:
  o "pago no mês" é a soma líquida das baixas pela data do pagamento, e um pagamento lançado em setembro
  e desfeito em outubro tem de sair de setembro, onde nunca chegou a valer.
- Estornar exige `contas_pagar.cancelar` (desfazer um pagamento é mais sensível que lançá-lo).

### Concorrência e idempotência

Toda operação que altera o título trava a linha (`SELECT … FOR UPDATE`) e **relê o estado sob a trava**.
Não há outra trava no caminho (nem caixa, nem estoque), então não existe ordem de travas a respeitar
nem deadlock a tratar. Sem retry nem timeout como correção.

- Duas baixas simultâneas nunca pagam mais que o saldo; quem perde a corrida recebe **409** com código
  estável: `titulo_nao_aberto` (o título já foi quitado/cancelado) ou `valor_acima_do_saldo` (o saldo
  mudou). Em contas a receber o excesso é 422; aqui é 409 porque o perdedor da corrida vê um estado que
  mudou, não um dado inválido (mesmo raciocínio de `estoque_insuficiente`).
- `chave` de idempotência por título (índice único parcial `uq_titulo_pagar_baixa_chave`): reenviar a
  mesma baixa devolve a conta como está, **inclusive quando a baixa original já quitou o título**. A
  consulta da chave é feita sob a trava, nunca por estado carregado antes dela.
- O banco é a barreira final: `CHECK (valor_pago >= 0 AND valor_pago <= valor_original)` e
  `UNIQUE (estorno_de_id)`.
- Testes com gate por estado observável (o teste segura a trava, espera as sessões entrarem em fila em
  `pg_stat_activity` e só então solta) e com 8 threads reais sem gate.

### Auditoria, categorias e permissões

- Auditoria na **mesma transação** da operação (teste: falha ao auditar desfaz o pagamento). Reaproveita
  as ações existentes (`CREATE`, `UPDATE`, `PAGAMENTO`, `ESTORNO`, `CANCELAMENTO`), módulo
  `contas_pagar`, recurso `titulo_pagar`. O número da nota/boleto vai como `numero_documento` na
  auditoria: a chave `documento` é mascarada pela redação de CPF/CNPJ e esconderia justamente o que se
  quer ver.
- **Categorias** reaproveitam `categoria_financeira` e a permissão `financeiro.categorias`. A migration
  semeia sete categorias de despesa (Mercadorias e insumos, Aluguel, Energia e água, Pessoal, Impostos e
  taxas, Manutenção, Outras despesas) **sem duplicar** uma que a empresa já tenha criado (o índice único
  por nome e tipo faria a migration falhar). Categoria em uso por conta a pagar não é excluída (desative).
- Permissões novas: `contas_pagar.listar | criar | editar | baixar | cancelar`, concedidas a
  Administrador e Gerente; Frente de loja e Atendente não recebem. Quem só tem `contas_pagar.*` precisa
  também de `financeiro.listar` (categorias) e `pessoas.listar` (fornecedores) para montar o formulário.

## Entrada de estoque com fornecedor e relatório de compras

- `movimento_estoque.fornecedor_id` é **opcional**: entrada rápida, carga inicial e compra sem nota
  continuam válidas. Adicionar a coluna é DDL do owner, não esbarra no trigger append-only (que barra só
  UPDATE/DELETE de linha); entradas antigas ficam sem fornecedor. Sem `relationship` no modelo de
  propósito: `Pessoa` carrega coleções em cascata e encareceria todo movimento lido; o nome vem por JOIN
  explícito (listagem sem N+1, coberta por teste).
- A validação do fornecedor (pessoa existente, ativa e com papel `fornecedor`) é uma só
  (`people.service.exigir_fornecedor`), usada na entrada e nas contas a pagar.
- **Compra = movimento de entrada.** Valor = quantidade × custo unitário **congelado no movimento**,
  arredondado a centavos **em cada entrada**: assim o total e as linhas de qualquer agrupamento fecham ao
  centavo (três entradas de 1 × 0,3333 valem 0,99, não 1,00). Os totais saem de uma consulta própria e
  não mudam com o `agrupar`.
- Entrada **sem custo informado** (`custo_unitario` nulo) vale 0 e é contada em `entradas_sem_custo`, no
  total e em cada linha. Custo 0 informado de propósito (bonificação) não é "sem custo".
- Sem fornecedor aparece como "Sem fornecedor" no agrupamento por fornecedor; sem categoria, como "Sem
  categoria". Mesma janela e fuso dos outros relatórios (`validar_janela`, máximo de 366 dias).
- Limites assumidos: não existe pedido de compra, nem estorno de entrada (um lançamento errado se corrige
  por ajuste/saída, que **não** abate o relatório de compras), nem ligação automática entre a entrada e a
  conta a pagar: cada um registra o seu fornecedor e o seu documento.

## Relatório de produtos

- Mesma base do relatório de vendas: vendas **não estornadas**, por data da venda no fuso da empresa
  (reaproveita `_vendas_validas`, `validar_janela` e `limites_utc`).
- **Receita** = Σ `venda_item.total`, antes dos descontos/acréscimos da comanda e da taxa de serviço
  (esses pertencem à venda, não ao item; ratear exigiria um critério inventado). Por isso a soma das
  receitas não é igual ao faturamento do relatório de vendas.
- **Custo.** `venda_item` não guarda custo, então usa-se o custo **congelado no movimento de estoque da
  venda** (`origem_tipo = 'venda'`, um movimento por produto de estoque e venda). Produto sem ficha
  técnica: quantidade × custo do movimento do próprio produto. Produto com ficha: Σ quantidade × quantidade
  do insumo na ficha × custo do movimento do insumo naquela venda. Consequências:
  - custo novo de uma compra posterior **não** muda o custo de vendas passadas (teste);
  - a ficha técnica usada é a **vigente hoje**; mudar a ficha depois da venda desloca o custo (o custo
    unitário continua sendo o da hora). Aceito: guardar custo em `venda_item` exigiria alterar uma tabela
    append-only e backfill;
  - produto sem ficha e sem controle de estoque (ex.: item de serviço) não tem movimento: custo 0,
    `sem_custo = true`, e a margem vem cheia. Totais contam 0 e trazem `produtos_sem_custo`, a mesma regra
    "conta 0 e sinaliza" do relatório de compras.
- **Curva ABC por receita**, não por margem nem por quantidade: a receita existe sempre e é comparável
  entre produtos; quantidade mistura unidades (kg × un) e margem depende de um custo que pode estar
  zerado. Regra: ordena por receita decrescente (desempate: quantidade, depois id); **A** enquanto o
  acumulado **antes** do produto for menor que 80% da receita, **B** até 95%, **C** o resto. Quem cruza o
  limite fica na classe que estava preenchendo, então o produto mais vendido é sempre A, mesmo que sozinho
  passe de 80% (teste), e sem receita ninguém é A.
- A curva, a participação e os totais valem para o **conjunto filtrado inteiro**, antes de `ordenar` e
  `limite`: reordenar ou cortar as linhas não muda a classe de ninguém. Filtrar por categoria ou tipo
  refaz a curva sobre o que sobrou.
- `sem_venda` lista, à parte das linhas, produtos **vendáveis e ativos** sem nenhuma venda válida no
  período (respeitando os filtros), com o saldo (`null` quando o produto não controla estoque). Insumos e
  embalagens não são vendáveis, então não entram. Não é limitado por `limite`.
- Percentuais com 2 casas, como string no JSON (como todo valor decimal da API).

## Seed de demonstração

A carga inicial de estoque passou a ser compra do fornecedor de demonstração (as pessoas são criadas
antes das entradas, na mesma ordem de antes, então os ids não mudam) e há quatro contas de exemplo
criadas pelos serviços reais: vencida, a vencer, parcialmente paga e paga, com vencimentos relativos a
hoje. Quantidades, saldos e custos do seed não mudaram, e como o pagamento de conta não toca o caixa, o
caixa da demonstração também não.
