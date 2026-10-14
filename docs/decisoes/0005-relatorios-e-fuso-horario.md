# 0005 — Dashboard, relatórios e fuso horário

**Status:** vigente (Fase 3). **Código:** `modules/reports`.

## Fuso

Todo timestamp é `timestamptz` (UTC no banco). O fuso da empresa (`configuracao_empresa.timezone`, padrão
`America/Fortaleza`, editável) define **a que dia, semana e mês uma venda pertence**: as janelas são
calculadas em Python no fuso da empresa e convertidas para UTC na consulta; o agrupamento por dia usa
`timezone(<fuso>, created_at)`. Exemplo coberto em teste: uma venda às 02:30 UTC é do dia anterior em
Fortaleza. Trocar o fuso muda a atribuição do dia, e o teste prova isso.

## Definições

- **Faturamento** = soma de `venda.total` das vendas **não estornadas** no período (fiado conta como
  venda; o dinheiro do fiado só entra no caixa quando for recebido).
- **Período por data da venda**, mas o **estado é o de hoje**: uma venda de ontem estornada hoje deixa de
  contar no faturamento de ontem. É deliberado (o relatório mostra o que a empresa realmente faturou), e o
  estorno continua visível na auditoria com a data em que ocorreu.
- **Ticket médio** = faturamento / nº de vendas, calculado no backend.
- Semana = segunda a domingo. Mês = mês civil. Período máximo de relatório: 366 dias.
- **Caixa esperado** não depende do período: é tudo o que entrou naquele caixa.
- **Perdas**: movimentos `perda`, valorizados pelo custo médio congelado no próprio movimento.
- Valor em estoque = saldo × custo médio atual, arredondado a 2 casas por produto.

- Os relatórios de **compras** e de **produtos** (margem e curva ABC) usam a mesma janela e o mesmo fuso;
  suas definições estão em `0007-contas-a-pagar-e-relatorios.md`.

## Exportação

Excel/PDF ficam para a fase futura, como previsto na spec.
