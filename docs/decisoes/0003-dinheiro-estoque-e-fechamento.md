# 0003 — Dinheiro, estoque e o fechamento transacional da comanda

**Status:** vigente (Fases 1–2). **Código:** `core/money.py`, `modules/inventory`, `modules/sales`,
`modules/cash`, `modules/finance`.

## Dinheiro e quantidade

- `NUMERIC` no banco e `Decimal` no código; nunca `float`. Arredondamento `ROUND_HALF_UP`, aplicado em
  cada componente (item, desconto, taxa). Custo médio guarda 4 casas para não acumular erro.
- No JSON, sempre **string** ("7.50"). Um número JSON com ponto flutuante é recusado na entrada.
- **Tetos por coluna** (`Dinheiro`, `Quantidade`, `Custo` em `core/money.py`; dinheiro até 10^12): valor
  acima do que a coluna `NUMERIC` comporta vira 422, nunca 500 por estouro numérico no banco.
- Data/hora **sem fuso** na entrada é interpretada no fuso da empresa (`core/tempo.py`), não no do
  servidor nem em UTC; o período de relatório e o filtro de auditoria seguem a mesma regra.
- **O frontend não é fonte de verdade.** Subtotal, descontos, taxa, total, troco, saldos e custo vêm do
  backend (`orders/calculo.py`, funções puras testadas). A única aritmética do cliente é a prévia de
  "quanto falta cobrir" ao montar pagamentos (`frontend/src/lib/decimal.ts`, exata em BigInt); o backend
  valida e recalcula.
- Taxa de serviço: percentual por empresa, congelado na abertura da comanda (só comanda de **mesa**) e
  aplicado sobre o consumo **já com desconto**. Decisão provisória até a pendência 13 (ver
  `decisoes-pendentes.md`).

## Estoque

- Todo movimento passa por `inventory.service.aplicar_movimento`: trava a linha do saldo
  (`FOR UPDATE`), confere o negativo, atualiza o saldo, grava o movimento com o `saldo_apos` e, em
  entradas, recalcula o custo médio **relendo o custo sob a trava** (sem isso, entradas simultâneas
  perdem atualização: foi um bug real pego pelo teste de concorrência).
- Saldo = soma dos movimentos, sempre (há teste de invariante). Estoque negativo é bloqueado; o override
  exige a permissão `estoque.permitir_negativo` e justificativa.
- Custo médio é o **custo da hora**: perdas, saídas e vendas congelam o custo médio vigente em
  `movimento_estoque.custo_unitario`, para relatórios de perda e de custo não mudarem retroativamente.
- Ficha técnica de **um nível**: o produto preparado consome seus insumos; sem ficha, consome o próprio
  saldo (se controla estoque). A baixa é agregada por produto: um movimento por produto e venda.

## Fechamento da comanda (o caso de uso crítico)

Uma única transação cria a venda, os itens, os pagamentos, o movimento de caixa de cada pagamento, os
movimentos de estoque, o título de fiado, fecha a comanda, libera a mesa e grava a auditoria. Falhou em
qualquer ponto: nada é gravado (teste de rollback completo por falta de estoque).

- **Idempotência determinística**, sem retry nem timeout: `SELECT … FOR UPDATE` na comanda + gate por
  status (a 2ª chamada espera a trava, vê a comanda fechada e recebe 409) + `UNIQUE (comanda_id)` em
  `venda` + índices únicos por origem em `movimento_caixa` e `movimento_estoque`. Teste: 8 requisições
  simultâneas → 1 venda, 1 baixa.
- **Ordem de travas igual em todo o sistema** (evita deadlock): comanda → caixa (FOR SHARE) → cliente (se
  fiado) → saldos de estoque em ordem crescente de `produto_id`. Estorno: **comanda da venda** → caixa
  (FOR UPDATE) → títulos → estoque. A venda é append-only (UPDATE/DELETE negados também por privilégio),
  então não dá para travar a linha da venda: a trava é a da comanda de origem, a mesma do fechamento.
- **Timeouts de banco como rede de segurança**, não como mecanismo de correção: `lock_timeout` 5 s,
  `statement_timeout` 30 s, `idle_in_transaction_session_timeout` 60 s. Quando disparam, o handler de
  `DBAPIError` responde `409 recurso_ocupado` (deadlock/lock), `503` (statement timeout) ou `422` (erro de
  dado) em vez de `500`. A correção continua sendo a trava determinística acima.
- O caixa é travado em modo compartilhado nas vendas e em modo exclusivo no fechamento, na sangria e na
  reabertura: uma venda nunca "fica de fora" de um caixa que está fechando.
- Fiado não entra no caixa: gera um título por pagamento. O cliente é travado enquanto o limite é
  conferido (duas vendas simultâneas não furam o limite juntas; a corrida fiado × fechamento do caixa tem
  teste com gate por `pg_stat_activity`). `limite_fiado = 0` significa **sem limite** (decisão a
  confirmar, pendência 9).
- A baixa de título (`finance`) aceita uma `chave` de idempotência por tentativa: o frontend gera um UUID
  por diálogo, então duplo clique ou reenvio por falha de rede não baixa o título duas vezes (índice
  único em `titulo_receber_baixa.chave_idempotencia`).

## Estorno

Cria lançamentos inversos; o histórico original não muda. Caixa: o inverso entra no **caixa aberto de
quem estorna** (o original pode já estar fechado). Estoque: reentrada de cada movimento da venda.
Título: sem baixas é cancelado; com baixas, cada recebimento é devolvido por um movimento inverso e só
então o título é cancelado. Sem caixa aberto não há como devolver dinheiro, então o estorno é recusado
(vendas só em fiado, sem recebimentos, estornam sem caixa).

**O estorno só devolve em dinheiro o que existe na gaveta de quem estorna**: se o valor em dinheiro a
devolver passa do saldo em dinheiro desse caixa, responde `saldo_dinheiro_insuficiente` (mesma conferência
da sangria). Sem isso, o caixa de quem estorna ficaria com saldo de dinheiro negativo, o que não existe
fisicamente. Estorno de PIX/cartão não depende da gaveta.

## Caixa

Um caixa aberto por operador (índice único parcial). Fechamento por forma de pagamento: toda forma com
valor esperado diferente de zero precisa de contagem; diferença exige justificativa. Reabrir é
permissão própria e incrementa a `rodada`, mantendo uma conferência por fechamento.
