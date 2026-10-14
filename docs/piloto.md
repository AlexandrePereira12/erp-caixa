# Piloto (Fase 3)

## Critério de sucesso (spec §19)

Uma empresa opera **duas semanas** com: abertura e fechamento de caixa confiáveis; venda vinculada
corretamente a comanda, pagamento e estoque; auditoria de alterações, cancelamentos e descontos; backup
diário com restauração testada; nenhuma divergência de caixa ou estoque sem explicação no histórico.

## Antes de entrar no ar

- [ ] Pendências 2, 6, 9, 10, 13 e 14 de `docs/decisoes/decisoes-pendentes.md` confirmadas, mais a tabela
      "Decisões de design a confirmar" (visibilidade das vendas, fiado sem limite, estorno em dinheiro).
- [ ] Domínio, DNS e `config.env` revisados; Nginx e empresa provisionados na VPS (runbook, seções 1–2).
- [ ] Endurecimento aplicado e `endurecer-servidor.sh` sem exposição indevida.
- [ ] Cópia de backup **fora da VPS**, em remote `crypt`, funcionando (`BACKUP_RCLONE_REMOTE`) e um
      `restaurar --testar` feito com um backup real da empresa.
- [ ] Usuários criados com os papéis certos (administrador, gerente, frente de loja, atendente) e limites
      de desconto conferidos em Papéis.
- [ ] Formas de pagamento, mesas, categorias, produtos, fichas técnicas e estoque inicial cadastrados
      (ou `seed-demo` só em ambiente de ensaio) e um **inventário** inicial fechado.
- [ ] Treino: abrir/fechar caixa, abrir comanda, cancelar item, desconto, dividir conta, fiado, estorno.

## Acompanhamento diário

1. Fechamento de caixa com diferença: ler a justificativa e a trilha na Auditoria.
2. Relatório de caixa do dia (`/relatorios/caixa`): diferença total deve ser zero ou explicada.
3. Relatório de estoque e de perdas; inventário parcial dos itens críticos.
4. Auditoria: cancelamentos, descontos, estornos e `ACESSO_NEGADO` do dia.
5. Conferir o backup do dia e o teste de restauração semanal.

## O que observar para encerrar o piloto

Divergência de caixa sem explicação, estoque que não fecha com o inventário, queixa de lentidão no
fechamento de conta, usuário travado no rate limit do login ou bloqueado por 8 tentativas erradas (15 min), tela que obriga a chamar o gerente com
frequência (ajustar limites/permissões).
