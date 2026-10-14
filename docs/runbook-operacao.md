# Runbook de operação (VPS)

Tudo abaixo parte de `/opt/sistema-pdv` (ou `$PDV_ROOT`). Produção só muda com confirmação de quem vai
aplicar: preparar, revisar o plano e então executar. Ver `docs/decisoes/` para o porquê de cada regra.

## 1. Preparar o servidor (uma vez)

1. No repositório: `deploy/scripts/preparar-servidor.sh --dominio <DOMINIO_BASE> --acme-email <e-mail>`
   cria a árvore, instala scripts e templates, sobe o Nginx e instala os timers (root).
2. Revise `/opt/sistema-pdv/config.env` (domínio, e-mail do Let's Encrypt, tags de imagem, retenção e
   `BACKUP_RCLONE_REMOTE`).
3. Endurecimento (somente leitura primeiro): `endurecer-servidor.sh --ssh-de <CIDR-do-admin>`; leia o
   plano e só então `--aplicar`. Confira que nenhuma porta fora 22/80/443 aparece como exposta.
4. DNS: um registro A por empresa (`<slug>.<DOMINIO_BASE>`) para o IP da VPS.

## 2. Criar uma empresa

```
/opt/sistema-pdv/bin/provisionar-empresa.sh --slug sabores1 --nome "Sabores 1" \
  --admin-email dono@sabores1.com.br --admin-nome "Dono"
```

O script gera segredos exclusivos, sobe db/api/web, roda migrations, cria o administrador, emite o
certificado e instala o backup diário. A senha temporária do administrador aparece **uma única vez** no
terminal (troca obrigatória no primeiro acesso). Se algo falhar, ele desfaz o que criou.

## 3. Atualizar uma empresa

`atualizar-empresa.sh --slug sabores1 --tag 1.1.0` — faz backup, aplica migrations, recria api/web e
confere a saúde; se a api não ficar saudável, volta à tag anterior. Migrations já aplicadas **não** são
desfeitas: para voltar o schema, restaure o backup que o script informa. Atualize uma empresa por vez,
começando pela de menor risco.

## 4. Backup e restauração

- Diário por empresa (timer `sistema-pdv-backup@<slug>`): `pg_dump -Fc` relido de ponta a ponta, com
  `.sha256`, retenção local e cópia por `rclone` quando configurada.
- **O remote do rclone precisa ser do tipo `crypt`**: o dump contém CPF, histórico de vendas e hashes de
  senha. O script recusa um remote sem cifra; `BACKUP_PERMITIR_REMOTO_SEM_CRIPTOGRAFIA=1` existe só para
  quem aceita o risco conscientemente (não recomendado). Guarde a senha do `crypt` fora da VPS: sem ela o
  backup remoto não abre.
- **Teste de restauração (não destrutivo)**, rodar periodicamente:
  `restaurar-empresa.sh --slug sabores1 --arquivo <dump> --testar`
- Restauração real: `restaurar-empresa.sh --slug sabores1 --arquivo <dump> --confirmo sabores1`.
  Exige o `.sha256` ao lado do dump (`--sem-checksum` só para dump legado, com aviso). Faz backup de
  segurança antes, para api/web, restaura **como `<slug>_owner`** (o dump não carrega dono nem ACL:
  `--no-owner --no-privileges`), **reaplica os privilégios do role da API** — o `pg_restore` sozinho
  deixaria esse role com UPDATE/DELETE nas tabelas de histórico —, roda `migrate` e a verificação de
  sanidade completa, **confere, consultando o privilégio de fato, que `<slug>_app` não tem UPDATE/DELETE/TRUNCATE em nenhuma tabela append-only** e só
  então sobe api/web. Qualquer falha nessas etapas mantém a empresa parada e informa o backup de segurança.

## 5. Certificados

Renovação diária por timer (`renovar-certificados.sh`), com reload do Nginx. Falha de renovação aparece
como unidade `failed` no systemd.

## 6. Verificações

- `make isolamento`: sobe duas empresas locais e prova isolamento de rede/banco/credencial (inclusive
  `_edge` sem saída para a internet e limite de memória), roteamento, append-only, Nginx com empresa parada
  e **recriado** (segue publicando 80/443), backup/restauração/atualização e rollback do provisionamento.
  Última execução: 92 verificações, 0 falhas.
- `make test`: testes do backend contra PostgreSQL real (244). `make e2e`: Playwright no navegador, com a
  stack local completa, em desktop e celular (11). O CI roda os dois, mais lint e typecheck.
- Só amd64 foi exercitado localmente; o `release-images.yml` publica multi-arch (arm64 + amd64) e o primeiro
  deploy em VPS ARM deve começar por `provisionar-empresa.sh` numa empresa de teste.
