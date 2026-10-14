#!/usr/bin/env bash
# Prova, localmente e sem tocar em nada fora de um diretório temporário, o isolamento entre
# empresas e as rotinas de operação (provisionar, atualizar, backup, restaurar).
#
# Pré-requisito: imagens sistema-pdv-api:dev e sistema-pdv-web:dev (make build-api build-web).
# Sobe 2 empresas (teste e sabores1) com Nginx em 127.0.0.1:18080, sem TLS, e derruba tudo ao
# terminar. Recusa rodar se já houver containers com os nomes usados.
# Saída: uma linha OK/FAIL por verificação; código de saída != 0 se qualquer uma falhar.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib.sh
source "$REPO/deploy/scripts/lib.sh"

A=teste B=sabores1 NGINX=pdv_nginx_isolamento PORTA=18080
exigir_comandos docker curl openssl envsubst
for img in sistema-pdv-api:dev sistema-pdv-web:dev; do
  docker image inspect "$img" >/dev/null 2>&1 || die "imagem $img ausente (make build-api build-web)"
done
if docker ps -a --format '{{.Names}}' | grep -Eq "^(${A}|${B}|quebrado)_|^${NGINX}\$"; then
  die "já existem containers ${A}_*/${B}_*/${NGINX}: este teste não mexe em ambiente existente"
fi

T="$(mktemp -d "${TMPDIR:-/tmp}/pdv-iso.XXXXXX")"
[[ -d "$T" && "$T" == */pdv-iso.* ]] || die "diretório temporário inesperado"
export RAIZ="$T" PDV_ROOT="$T"
FALHAS=0 TOTAL=0

limpar() {
  trap - EXIT
  log "limpando ambiente de teste..."
  for s in "$A" "$B" quebrado; do
    [[ -f "$T/empresas/$s/docker-compose.yml" ]] && { compose_empresa "$s" down -v --remove-orphans >/dev/null 2>&1 || true; }
  done
  [[ -f "$T/nginx/docker-compose.yml" ]] && { compose_nginx down >/dev/null 2>&1 || true; }
  docker rmi sistema-pdv-api:dev2 sistema-pdv-web:dev2 >/dev/null 2>&1 || true
  rm -rf "$T"
  printf '\n%d verificações, %d falha(s)\n' "$TOTAL" "$FALHAS"
  ((FALHAS == 0)) || exit 1
}
trap limpar EXIT

ok()    { TOTAL=$((TOTAL + 1)); printf '  OK    %s\n' "$1"; }
falha() { TOTAL=$((TOTAL + 1)); FALHAS=$((FALHAS + 1)); printf '  FAIL  %s\n' "$1"; }
deve()  { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else falha "$d"; fi; }
nao_deve() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then falha "$d"; else ok "$d"; fi; }
igual() { if [[ "$2" == "$3" ]]; then ok "$1"; else falha "$1 (esperado '$3', veio '$2')"; fi; }

http() { # http HOST METODO CAMINHO [dados-json] -> código HTTP
  local host="$1" metodo="$2" caminho="$3" dados="${4:-}"
  if [[ -n "$dados" ]]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$metodo" -H "Host: $host.localhost" \
      -H 'Content-Type: application/json' -d "$dados" "http://127.0.0.1:$PORTA$caminho"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$metodo" -H "Host: $host.localhost" "http://127.0.0.1:$PORTA$caminho"
  fi
}
sql() { # sql SLUG USUARIO_ENV SENHA_ENV 'consulta' (superusuário local por padrão)
  local slug="$1" consulta="$2" env="$T/empresas/$1/.env"
  docker exec "${slug}_db" psql -h 127.0.0.1 -U "$(ler_env "$env" POSTGRES_USER)" -d "$(ler_env "$env" POSTGRES_DB)" -tA -c "$consulta"
}
sql_como() { # sql_como SLUG owner|app 'consulta'
  local slug="$1" papel="$2" consulta="$3" env="$T/empresas/$1/.env" u p
  if [[ "$papel" == owner ]]; then u="$(ler_env "$env" DB_OWNER_USER)"; p="$(ler_env "$env" DB_OWNER_PASSWORD)"
  else u="$(ler_env "$env" DB_APP_USER)"; p="$(ler_env "$env" DB_APP_PASSWORD)"; fi
  docker exec -e PGPASSWORD="$p" "${slug}_db" psql -h 127.0.0.1 -U "$u" -d "$(ler_env "$env" POSTGRES_DB)" -tA -c "$consulta"
}
ip_na_rede() { docker inspect -f "{{(index .NetworkSettings.Networks \"$2\").IPAddress}}" "$1"; }
digest() { sql "$1" "SELECT (SELECT count(*) FROM usuario) || '/' || (SELECT count(*) FROM auditoria_log) || '/' || md5(coalesce((SELECT string_agg(email || nome, ',' ORDER BY id) FROM usuario), ''))"; }
login_codigo() { http "$1" POST /api/v1/auth/login "{\"email\":\"$2\",\"senha\":\"$3\"}"; }
# tenta TCP de dentro de um container (python da imagem da api)
tcp_de() { docker exec "$1" python -c "import socket,sys; socket.create_connection((sys.argv[1], int(sys.argv[2])), timeout=2)" "$2" "$3"; }
resolve_de() { docker exec "$1" python -c "import socket,sys; socket.gethostbyname(sys.argv[1])" "$2"; }

echo "== preparação"
bash "$REPO/deploy/scripts/preparar-servidor.sh" --raiz "$T" --sem-systemd --bind 127.0.0.1 \
  --porta-http "$PORTA" --porta-https 18443 --nginx-container "$NGINX" --dominio localhost \
  --acme-email nao-usado@example.com >/dev/null 2>&1 || die "preparar-servidor.sh falhou"
deve "nginx de teste no ar" nginx_rodando

prov() { "$T/bin/provisionar-empresa.sh" --raiz "$T" --sem-tls --sem-pull --sem-systemd "$@"; }
SAIDA_A="$(prov --slug "$A" --nome "Empresa A" --admin-email "admin@$A.example.com" --admin-nome "Admin A" 2>"$T/prov-a.log")" \
  || { cat "$T/prov-a.log" >&2; die "provisionamento de $A falhou"; }
SAIDA_B="$(prov --slug "$B" --nome "Empresa B" --admin-email "admin@$B.example.com" --admin-nome "Admin B" 2>"$T/prov-b.log")" \
  || { cat "$T/prov-b.log" >&2; die "provisionamento de $B falhou"; }
SENHA_A="$(sed -n 's/^SENHA TEMPORÁRIA.*: //p' <<<"$SAIDA_A")"
SENHA_B="$(sed -n 's/^SENHA TEMPORÁRIA.*: //p' <<<"$SAIDA_B")"
[[ -n "$SENHA_A" && -n "$SENHA_B" ]] || { cat "$T"/prov-*.log; die "provisionamento falhou"; }
for s in "$A" "$B"; do
  for c in db api web; do
    igual "${s}_${c} saudável" "$(docker inspect -f '{{.State.Health.Status}}' "${s}_${c}")" healthy
  done
done
deve "permissões do .env restritas (0600)" test "$(stat -c %a "$T/empresas/$A/.env")" = 600
nao_deve "segredos distintos entre empresas (JWT)" test "$(ler_env "$T/empresas/$A/.env" JWT_SECRET)" = "$(ler_env "$T/empresas/$B/.env" JWT_SECRET)"
nao_deve "segredos distintos entre empresas (senha do banco)" test "$(ler_env "$T/empresas/$A/.env" DB_APP_PASSWORD)" = "$(ler_env "$T/empresas/$B/.env" DB_APP_PASSWORD)"

echo "== roteamento por subdomínio"
igual "$A: /api/v1/health" "$(http "$A" GET /api/v1/health)" 200
igual "$B: /api/v1/health" "$(http "$B" GET /api/v1/health)" 200
igual "$A: frontend em /" "$(http "$A" GET /)" 200
igual "host desconhecido não cai em empresa" "$(http naoexiste GET / || true)" 000
igual "documentação da API não é exposta" "$(http "$A" GET /api/v1/docs)" 404
igual "login da empresa A no host A" "$(login_codigo "$A" "admin@$A.example.com" "$SENHA_A")" 200
igual "login do admin A no host B é recusado (bancos distintos)" "$(login_codigo "$B" "admin@$A.example.com" "$SENHA_A")" 401
igual "login do admin B no host B" "$(login_codigo "$B" "admin@$B.example.com" "$SENHA_B")" 200
TOKEN_A="$(curl -s -X POST -H "Host: $A.localhost" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@$A.example.com\",\"senha\":\"$SENHA_A\"}" "http://127.0.0.1:$PORTA/api/v1/auth/login" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
igual "token da empresa A é aceito em A" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $A.localhost" -H "Authorization: Bearer $TOKEN_A" "http://127.0.0.1:$PORTA/api/v1/auth/me")" 200
igual "token da empresa A é recusado em B (JWT distinto)" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $B.localhost" -H "Authorization: Bearer $TOKEN_A" "http://127.0.0.1:$PORTA/api/v1/auth/me")" 401

echo "== aplicação em B (migrations 0001-0003, seed, dashboard e permissões do papel Administrador)"
api_b() { # api_b METODO CAMINHO TOKEN [json] -> corpo da resposta
  local metodo="$1" caminho="$2" token="$3" dados="${4:-}"
  curl -s -X "$metodo" -H "Host: $B.localhost" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    ${dados:+-d "$dados"} "http://127.0.0.1:$PORTA$caminho"
}
TOKEN_B="$(curl -s -X POST -H "Host: $B.localhost" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@$B.example.com\",\"senha\":\"$SENHA_B\"}" "http://127.0.0.1:$PORTA/api/v1/auth/login" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
igual "B: com a senha temporária só a troca de senha é permitida" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $B.localhost" -H "Authorization: Bearer $TOKEN_B" "http://127.0.0.1:$PORTA/api/v1/dashboard")" 403
TOKEN_B="$(api_b POST /api/v1/auth/change-password "$TOKEN_B" "{\"senha_atual\":\"$SENHA_B\",\"nova_senha\":\"NovaSenhaDeSabores#2026\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
[[ -n "$TOKEN_B" ]] && ok "B: troca de senha obrigatória feita" || falha "B: troca de senha obrigatória"
igual "B: dashboard responde para o administrador" "$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $B.localhost" -H "Authorization: Bearer $TOKEN_B" "http://127.0.0.1:$PORTA/api/v1/dashboard")" 200
SEED="$(docker exec "${B}_api" python -m app.cli seed-demo 2>&1 || true)"
[[ "$SEED" == *"criados"* ]] && ok "B: seed de demonstração aplicado" || falha "B: seed de demonstração ($SEED)"
SEED2="$(docker exec "${B}_api" python -m app.cli seed-demo 2>&1 || true)"
[[ "$SEED2" == *"nada feito"* ]] && ok "B: seed é idempotente" || falha "B: seed idempotente ($SEED2)"
[[ "$(api_b GET '/api/v1/produtos?limite=1' "$TOKEN_B")" == *'"total":14'* ]] && ok "B: 14 produtos de demonstração" || falha "B: produtos do seed"
igual "A: seed de B não apareceu em A (mesas)" "$(sql "$A" "SELECT count(*) FROM mesa")" 0
igual "B: mesas criadas pelo seed" "$(sql "$B" "SELECT count(*) FROM mesa")" 10
igual "B: permissões do Administrador = todas do catálogo" "$(sql "$B" "SELECT (SELECT count(*) FROM papel_permissao pp JOIN papel p ON p.id = pp.papel_id WHERE p.nome = 'Administrador') = (SELECT count(*) FROM permissao)")" t

echo "== isolamento de rede e de banco"
for s in "$A" "$B"; do
  igual "$s: nenhuma porta do banco publicada" "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "${s}_db")" '{}'
  igual "$s: banco só na rede interna" "$(docker inspect -f '{{range $k, $_ := .NetworkSettings.Networks}}{{$k}} {{end}}' "${s}_db")" "${s}_net "
  igual "$s: rede do banco é internal" "$(docker network inspect -f '{{.Internal}}' "${s}_net")" true
  igual "$s: web só na rede de borda" "$(docker inspect -f '{{range $k, $_ := .NetworkSettings.Networks}}{{$k}} {{end}}' "${s}_web")" "${s}_edge "
done
nao_deve "B não resolve o nome do banco de A" resolve_de "${B}_api" "${A}_db"
nao_deve "B não resolve a api de A" resolve_de "${B}_api" "${A}_api"
nao_deve "A não resolve o banco de B" resolve_de "${A}_api" "${B}_db"
nao_deve "B não conecta no IP do banco de A" tcp_de "${B}_api" "$(ip_na_rede "${A}_db" "${A}_net")" 5432
nao_deve "B não conecta no IP da api de A" tcp_de "${B}_api" "$(ip_na_rede "${A}_api" "${A}_edge")" 8000
nao_deve "A não conecta no IP do banco de B" tcp_de "${A}_api" "$(ip_na_rede "${B}_db" "${B}_net")" 5432
deve "A conecta no próprio banco (controle positivo)" tcp_de "${A}_api" "${A}_db" 5432
igual "api roda sem root" "$(docker exec "${A}_api" id -u)" 10001
igual "api com sistema de arquivos somente leitura" "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "${A}_api")" true
igual "rede de borda também é internal (api/web sem saída para a internet)" "$(docker network inspect -f '{{.Internal}}' "${A}_edge")" true
nao_deve "api não alcança a internet" docker exec "${A}_api" python -c "import urllib.request; urllib.request.urlopen('http://1.1.1.1', timeout=3)"
igual "api com limite de memória" "$(docker inspect -f '{{.HostConfig.Memory}}' "${A}_api")" 805306368

echo "== auditoria append-only e privilégios"
nao_deve "role app não faz UPDATE em auditoria_log" sql_como "$A" app "UPDATE auditoria_log SET descricao = descricao WHERE false"
nao_deve "role app não faz DELETE em auditoria_log" sql_como "$A" app "DELETE FROM auditoria_log WHERE false"
nao_deve "role app não faz TRUNCATE em auditoria_log" sql_como "$A" app "TRUNCATE auditoria_log"
nao_deve "role app não faz DDL" sql_como "$A" app "CREATE TABLE intruso (i int)"
deve "role app lê e insere nas tabelas de negócio" sql_como "$A" app "SELECT count(*) FROM usuario"
ERRO_OWNER="$(sql_como "$A" owner "TRUNCATE auditoria_log" 2>&1 || true)"
if [[ "$ERRO_OWNER" == *append-only* ]]; then ok "trigger bloqueia até o owner (TRUNCATE)"; else falha "trigger bloqueia até o owner (TRUNCATE): $ERRO_OWNER"; fi
nao_deve "role owner de A não acessa o banco de B" docker exec -e PGPASSWORD="$(ler_env "$T/empresas/$A/.env" DB_OWNER_PASSWORD)" "${B}_db" psql -h 127.0.0.1 -U "$(ler_env "$T/empresas/$A/.env" DB_OWNER_USER)" -d "$(ler_env "$T/empresas/$B/.env" POSTGRES_DB)" -c 'select 1'

echo "== Nginx: IP real e empresa parada"
curl -s -o /dev/null -X POST -H "Host: $B.localhost" -H "X-Forwarded-For: 6.6.6.6" -H 'Content-Type: application/json' \
  -d '{"email":"x@x.com","senha":"errada"}' "http://127.0.0.1:$PORTA/api/v1/auth/login"
IP_REGISTRADO="$(sql "$B" "SELECT ip FROM auditoria_log WHERE acao='LOGIN_FALHA' ORDER BY id DESC LIMIT 1")"
nao_deve "IP forjado em X-Forwarded-For não vai para a auditoria" test "$IP_REGISTRADO" = "6.6.6.6"
docker stop "${A}_api" "${A}_web" >/dev/null
deve "nginx -t passa com a empresa A parada" docker exec "$NGINX" nginx -t
deve "reload do nginx passa com a empresa A parada" nginx_recarregar
igual "empresa B segue de pé com A parada" "$(http "$B" GET /api/v1/health)" 200
igual "empresa A parada devolve 502" "$(http "$A" GET /api/v1/health)" 502
docker start "${A}_api" "${A}_web" >/dev/null
for _ in $(seq 1 30); do [[ "$(http "$A" GET /api/v1/health)" == 200 ]] && break; sleep 2; done
igual "empresa A volta ao subir" "$(http "$A" GET /api/v1/health)" 200
# Recriar o Nginx (reboot do servidor, mudança de configuração) não pode perder as portas nem as empresas:
# as redes _edge são internal e só a rede própria do Nginx publica 80/443.
compose_nginx up -d --force-recreate >/dev/null 2>&1
for _ in $(seq 1 30); do [[ "$(http "$B" GET /api/v1/health || true)" == 200 ]] && break; sleep 1; done
igual "nginx recriado: empresa A segue atendida" "$(http "$A" GET /api/v1/health)" 200
igual "nginx recriado: empresa B segue atendida" "$(http "$B" GET /api/v1/health)" 200

echo "== backup e restauração sem afetar outras empresas"
BACKUP="$("$T/bin/backup-empresa.sh" --raiz "$T" --slug "$A" 2>/dev/null)"
deve "backup gerado com checksum" test -s "$BACKUP" -a -s "$BACKUP.sha256"
deve "teste de restauração (descartável) passa" "$T/bin/restaurar-empresa.sh" --raiz "$T" --slug "$A" --arquivo "$BACKUP" --testar
nao_deve "restauração real exige confirmação" "$T/bin/restaurar-empresa.sh" --raiz "$T" --slug "$A" --arquivo "$BACKUP"
nao_deve "restauração real recusa slug errado na confirmação" "$T/bin/restaurar-empresa.sh" --raiz "$T" --slug "$A" --arquivo "$BACKUP" --confirmo "$B"
ANTES_A="$(digest "$A")"
for _ in 1 2 3; do login_codigo "$A" "ruido@x.com" "errada" >/dev/null; done   # 3 linhas novas na auditoria de A
DEPOIS_RUIDO_A="$(digest "$A")"
nao_deve "A mudou depois do backup (controle)" test "$ANTES_A" = "$DEPOIS_RUIDO_A"
DIGEST_B="$(digest "$B")"
deve "restauração real de A" "$T/bin/restaurar-empresa.sh" --raiz "$T" --slug "$A" --arquivo "$BACKUP" --confirmo "$A"
igual "A voltou exatamente ao estado do backup" "$(digest "$A")" "$ANTES_A"
igual "B ficou intacta durante a restauração de A" "$(digest "$B")" "$DIGEST_B"
igual "A responde após restaurar" "$(http "$A" GET /api/v1/health)" 200
igual "admin de A ainda entra após restaurar" "$(login_codigo "$A" "admin@$A.example.com" "$SENHA_A")" 200
nao_deve "role app de A segue sem UPDATE na auditoria após restaurar" sql_como "$A" app "UPDATE auditoria_log SET descricao = descricao WHERE false"

echo "== atualização com e sem sucesso"
docker tag sistema-pdv-api:dev sistema-pdv-api:dev2
docker tag sistema-pdv-web:dev sistema-pdv-web:dev2
deve "atualizar A para dev2" "$T/bin/atualizar-empresa.sh" --raiz "$T" --slug "$A" --tag dev2 --sem-pull
igual "A está na tag dev2" "$(ler_env "$T/empresas/$A/.env" IMAGE_TAG)" dev2
nao_deve "atualizar para tag inexistente falha" "$T/bin/atualizar-empresa.sh" --raiz "$T" --slug "$A" --tag naoexiste --sem-pull
igual "A manteve a tag dev2 após a falha" "$(ler_env "$T/empresas/$A/.env" IMAGE_TAG)" dev2
igual "A segue saudável após a falha" "$(http "$A" GET /api/v1/health)" 200
igual "B não foi tocada pelas atualizações" "$(ler_env "$T/empresas/$B/.env" IMAGE_TAG)" dev

echo "== provisionamento: recusa e desfazer"
nao_deve "provisionar slug existente é recusado" prov --slug "$A" --nome X --admin-email a@b.com --admin-nome X
nao_deve "slug inválido é recusado" prov --slug "Inválido_1" --nome X --admin-email a@b.com --admin-nome X
nao_deve "provisionar com imagem inexistente falha" prov --slug quebrado --tag naoexiste --nome X --admin-email a@b.com --admin-nome X
nao_deve "falha não deixa diretório da empresa" test -e "$T/empresas/quebrado"
nao_deve "falha não deixa config no nginx" test -e "$T/nginx/sites-enabled/quebrado.conf"
igual "falha não deixa containers" "$(docker ps -a --format '{{.Names}}' | grep -c '^quebrado_' || true)" 0
igual "falha não deixa rede" "$(docker network ls --format '{{.Name}}' | grep -c '^quebrado_' || true)" 0
deve "nginx -t segue passando depois da falha" docker exec "$NGINX" nginx -t
igual "empresas existentes seguem de pé" "$(http "$A" GET /api/v1/health)$(http "$B" GET /api/v1/health)" 200200

echo "== rate limit do login (por último: o balde é por IP e esvazia com o tempo)"
CODIGOS=""
for _ in $(seq 1 60); do CODIGOS+="$(login_codigo "$B" "x@x.com" "errada") "; done
[[ "$CODIGOS" == *429* ]] && ok "rate limit do login responde 429" || falha "rate limit do login ($CODIGOS)"
[[ "$CODIGOS" == 401* ]] && ok "primeiras tentativas chegam à api (401)" || falha "primeiras tentativas não chegaram à api ($CODIGOS)"
