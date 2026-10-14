# 0001 — Arquitetura multiempresa: uma instalação por empresa

**Status:** vigente (Fase 0). **Código:** `deploy/`, `backend/src/app/core/config.py`.

## Decisão

Cada empresa é uma instalação independente na mesma VPS: três containers (`<slug>_web`, `<slug>_api`,
`<slug>_db`), banco PostgreSQL próprio e `.env` próprio. Um único Nginx público (portas 80/443)
identifica o subdomínio e encaminha para os containers da empresa. O código vive em um só repositório;
`/opt/sistema-pdv/empresas/<slug>/` guarda só configuração, compose e dados.

## Por quê

- **Isolamento forte.** A API de uma empresa nunca recebe credencial nem rede do banco de outra. Não há
  `tenant_id` para esquecer num `WHERE`.
- **Backup, restauração e atualização por cliente**, sem afetar os demais.
- **Migrar uma empresa para outra VPS** é copiar um dump e reprovisionar com o mesmo slug.
- Escala-alvo (≤ 40 usuários por empresa) não exige multi-tenant compartilhado.

## Como ficou (e onde a spec foi completada)

| Tema | Decisão | Motivo |
|---|---|---|
| Roles do banco | `<slug>_admin` (bootstrap), `<slug>_owner` (só migrations), `<slug>_app` (só a API) | O teste "auditoria não sofre UPDATE/DELETE pela aplicação" só é provável com a API sem poder de DDL nem de alterar tabelas append-only. A spec previa uma única credencial. Criados por `deploy/db/10-roles.sh` na primeira subida do volume. |
| Redes | `<slug>_net` e `<slug>_edge`, **ambas** `internal: true` (db, migrate, api em `_net`; web, api e o Nginx em `_edge`) | O banco não tem rota para fora nem para o Nginx. Uma rede `_edge` por empresa impede que a api de A alcance a api de B, e a api não tem saída para a internet (um comprometimento não exfiltra dados). Verificado em `testar-isolamento.sh`. |
| Publicação de 80/443 | O Nginx tem uma rede própria `<container>_publico` (não interna) só para publicar as portas | Rede `internal` não publica porta: sem essa rede o Nginx perdia 80/443 ao ser recriado. O teste recria o Nginx e confere que segue atendendo. |
| Limites de recurso | `mem_limit`, `cpus` e `pids_limit` por container no template do compose | Uma empresa com pico ou vazamento não derruba as vizinhas na mesma VPS. |
| Sub-rede da `_edge` | /24 fixa em `172.30.0.0/16`, alocada no provisionamento | Vira o CIDR do proxy confiável da API (`TRUSTED_PROXY_CIDRS`). |
| Nginx e empresas paradas | `resolver 127.0.0.11` + `proxy_pass` com variável | Com nome fixo, uma empresa parada derruba o `nginx -t` e o reload de todas. Verificado em `testar-isolamento.sh`. |
| IP real | O Nginx **sobrescreve** `X-Forwarded-For` com `$remote_addr`; a API só confia no cabeçalho se o par TCP está no CIDR da `_edge` | O cliente não consegue forjar o IP gravado na auditoria. Implementado em `core/middleware.py` (testável), não pela flag do uvicorn. |
| TLS | Certbot por webroot (HTTP-01), um certificado por subdomínio | Funciona sem API do provedor de DNS. Wildcard exigiria DNS-01 e escolha de provedor. |
| Migrations | Container `migrate` roda antes da API em todo `up` | A API nunca sobe contra schema desatualizado. |
| Slug | `^[a-z][a-z0-9]{1,23}$` | Vale ao mesmo tempo para hostname, nome de container e identificador do Postgres sem aspas. |
| Rate limit | Login 20 req/min por IP (burst 20); renovação de sessão 30 req/min (burst 20) | A equipe de um restaurante sai pelo mesmo IP e abre o turno junto; 10/min trancaria gente legítima. O backend audita cada falha e bloqueia a conta por tentativas (ver 0002), então o limite do Nginx é só a primeira barreira. |

## Consequências

- Mudar o template do compose exige que o `.env` das empresas tenha as variáveis novas;
  `atualizar-empresa.sh` recusa a atualização se o template novo usar variável ausente.
- `networks.generated.yml` (redes das empresas anexadas ao Nginx) é gerado pelos scripts; o Nginx entra
  na rede nova ao vivo (`docker network connect`) para não derrubar nenhuma empresa.
- Não há banco central de tenants no MVP (superadmin e provisionamento automático ficam para fase futura).
