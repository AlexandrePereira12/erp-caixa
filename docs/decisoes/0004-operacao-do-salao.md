# 0004 — Operação do salão: mesas, comandas, descontos e cancelamentos

**Status:** vigente (Fase 2), com defaults provisórios listados em `decisoes-pendentes.md`.
**Código:** `modules/{tables,orders}`.

## Mesas e comandas

- A mesa acompanha a comanda: `ocupada` ao abrir, `aguardando_pagamento` ao pedir a conta, `livre` ao
  fechar ou cancelar. `reservada` e `bloqueada` são manuais. Uma mesa só pode ter **uma** comanda em
  andamento — garantido por índice único parcial, então a abertura simultânea cai em 409 e nunca em duas
  comandas.
- Tipos: mesa, balcão, retirada e delivery simples (delivery exige endereço). Só comanda de mesa usa mesa
  e taxa de serviço.
- **Preço congelado** no lançamento: reajustar o produto não muda comanda aberta.
- Itens só **aumentam** por edição; reduzir é cancelar o item (com motivo) e lançar de novo. Assim toda
  redução de consumo passa pela regra de cancelamento e fica auditada.
- "Pedir conta" trava os itens (descontos ainda podem ser dados no fechamento); "reabrir" destrava.
  Comanda fechada ou cancelada não aceita nenhuma alteração.
- Transferência de mesa trava as duas mesas em ordem crescente de id (sem deadlock entre transferências
  cruzadas).

## Cancelamento de item (pendência 6)

Sempre exige motivo. Quem tem `comandas.cancelar_item` (gerente) cancela qualquer item; quem tem só
`comandas.cancelar_item_proprio` cancela **o que ele mesmo lançou, dentro da janela** configurável
(`cancelamento_janela_min`, padrão 5 min). Fora disso o backend responde `cancelamento_exige_gerente`.

## Desconto e acréscimo

Exigem justificativa. O desconto é **cumulativo** e comparado ao limite do papel (`limite_desconto_pct`:
administrador 100, gerente 20, frente 5, atendente 0). Além do limite: 403, e a tela orienta chamar um
gerente. Desconto nunca passa do consumo. Ajuste removido continua registrado (soft remove) e na auditoria
(`DESCONTO`).

## Divisão de conta

A prévia por pessoas é calculada no backend (`GET /comandas/{id}/divisao`): as partes somam exatamente o
total, com os centavos que sobram nas primeiras partes. Dividir por valor é só informar vários
pagamentos no fechamento.

## Impressão

Só impressão pelo navegador (`window.print()` com CSS de impressão): resumo da comanda e recibo de
conferência. Impressora térmica/ESC-POS e KDS ficam para a fase futura.
