# Decisões pendentes da spec (§18) e defaults adotados

Cada item tem o default **já implementado**. Confirmar antes da fase indicada; mudar um default é
ajuste de configuração ou de uma regra isolada, indicada na coluna "onde".

| # | Tema | Default adotado | Onde | Confirmar antes de |
|---|---|---|---|---|
| 1 | Domínio / DNS | `<DOMINIO_BASE>` em `config.env`; nada fixo no código | `deploy/config.env.example` | deploy real |
| 2 | Oracle Free | tratado como dev/piloto; cliente real só com cópia fora da VPS ligada | `BACKUP_RCLONE_REMOTE` | piloto |
| 3 | Unidades por empresa | uma (multiunidade é fase futura) | — | — |
| 4 | Ficha técnica | sim, um nível | `catalog.service.definir_composicao` | — |
| 5 | Custo | médio ponderado, recalculado em cada entrada | `inventory.service.aplicar_movimento` | Fase 1 |
| 6 | Cancelar item (atendente) | só o próprio item, janela de 5 min; depois, gerente | `configuracoes.cancelamento_janela_min` | Fase 2 |
| 7 | Cadastro rápido no balcão | sim (nome + telefone), permissão própria | `pessoas.cadastro_rapido` | Fase 1 |
| 8 | Caixa | por operador, um aberto por vez | índice `uq_caixa_operador_aberto` | — |
| 9 | Fiado | só quem tem `vendas.fiado` (gerente/admin por padrão); `limite_fiado = 0` = sem limite | `sales.service` | Fase 2 |
| 10 | Limite de desconto | por papel: 100 / 20 / 5 / 0 (%), cumulativo na comanda | `papel.limite_desconto_pct` | Fase 2 |
| 11 | Pagamentos | só registro manual (sem PIX/maquininha/TEF) | — | — |
| 12 | Impressão | só `window.print()` | frontend | — |
| 13 | Taxa de serviço / couvert / entrega | só taxa de serviço (% por empresa, comanda de mesa, sobre o consumo com desconto); couvert e taxa de entrega fora | `configuracoes.taxa_servico_pct` | Fase 2 |
| 14 | Retenção | 14 backups diários locais + 56 dias na cópia fora da VPS | `BACKUP_RETENCAO_DIAS`, `BACKUP_REMOTO_RETENCAO_DIAS` | piloto |

## Decisões de design a confirmar (surgiram na revisão, não estão no §18)

| Tema | Default adotado | Alternativa | Onde |
|---|---|---|---|
| Quem enxerga as vendas | `vendas.listar` vê **todas** as vendas da empresa (não só as do próprio operador) | Frente de loja ver só as suas, com permissão extra para ver todas | `modules/sales/router.py` |
| Fiado sem limite | `limite_fiado = 0` significa sem limite | Zero significar "sem fiado" e exigir limite explícito | `sales.service` |
| Estorno em dinheiro | Só devolve o que há na gaveta de quem estorna (`saldo_dinheiro_insuficiente`) | Permitir saldo negativo com justificativa do gerente | `sales.service.estornar` |
| Relatório × estorno | Venda estornada deixa de contar no dia original (estado atual) | Congelar o relatório do dia e mostrar o estorno na data em que ocorreu | `reports` (ver 0005) |

## Divergências conscientes em relação à spec

- `.env` por empresa com **três** credenciais de banco (admin, owner, app) em vez de uma.
- Tabelas acrescentadas: `papel_permissao` (a spec não ligava papel a permissão), `configuracao_empresa`,
  `venda_estorno`, `caixa_evento`, `caixa_conferencia` por rodada, `inventario_item`, `comanda_evento`.
  Todas necessárias para cumprir regras da própria spec (permissões, fuso por empresa, estorno sem
  alterar a venda, reabertura de caixa auditável, inventário por produto).
- `/caixas/{id}/reabrir` existe porque a regra 10 (§8) exige reabertura com permissão e auditoria e o §12
  não a listava.
- `categoria_financeira` existe e é usada pelo título de fiado ("Vendas fiado"); as categorias de despesa
  só terão uso na Fase 4 (contas a pagar).
- Contas a pagar completo, recorrência, anexos, fluxo de caixa, fiscal, integrações, KDS, PWA offline e
  painel de superadmin seguem **fora** desta entrega (Fases 4–5 da spec).
