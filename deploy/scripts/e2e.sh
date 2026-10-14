#!/usr/bin/env bash
# Teste ponta a ponta no navegador (Playwright) contra uma empresa real provisionada localmente:
# Nginx + web + api + banco, sem TLS, com dados de demonstração. Derruba tudo ao terminar.
#
# Pré-requisitos: imagens sistema-pdv-api:dev e sistema-pdv-web:dev (make build-api build-web),
# pnpm e os navegadores do Playwright (cd frontend && pnpm exec playwright install chromium).
# Variáveis opcionais: E2E_PORTA (padrão 18090), E2E_ARGS (argumentos extras do playwright test).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib.sh
source "$REPO/deploy/scripts/lib.sh"

SLUG=e2e NGINX=pdv_nginx_e2e PORTA="${E2E_PORTA:-18090}"
exigir_comandos docker curl openssl envsubst pnpm
for img in sistema-pdv-api:dev sistema-pdv-web:dev; do
  docker image inspect "$img" >/dev/null 2>&1 || die "imagem $img ausente (make build-api build-web)"
done
if docker ps -a --format '{{.Names}}' | grep -Eq "^${SLUG}_|^${NGINX}\$"; then
  die "já existem containers ${SLUG}_*/${NGINX}: este teste não mexe em ambiente existente"
fi

T="$(mktemp -d "${TMPDIR:-/tmp}/pdv-e2e.XXXXXX")"
[[ -d "$T" && "$T" == */pdv-e2e.* ]] || die "diretório temporário inesperado"
export RAIZ="$T" PDV_ROOT="$T"

limpar() {
  local rc=$?
  trap - EXIT
  log "limpando ambiente do e2e..."
  [[ -f "$T/empresas/$SLUG/docker-compose.yml" ]] && { compose_empresa "$SLUG" down -v --remove-orphans >/dev/null 2>&1 || true; }
  [[ -f "$T/nginx/docker-compose.yml" ]] && { compose_nginx down >/dev/null 2>&1 || true; }
  rm -rf "$T"
  exit "$rc"
}
trap limpar EXIT

bash "$REPO/deploy/scripts/preparar-servidor.sh" --raiz "$T" --sem-systemd --bind 127.0.0.1 \
  --porta-http "$PORTA" --porta-https $((PORTA + 1)) --nginx-container "$NGINX" --dominio localhost \
  --acme-email nao-usado@example.com >/dev/null 2>&1 || die "preparar-servidor.sh falhou"

# A suíte faz dezenas de logins e renovações de sessão em poucos segundos, todos do mesmo IP. Com os
# limites de produção (20 e 30 por minuto) o fim da suíte (celular) leva 429 na renovação e cai no login,
# sem nenhum defeito na tela. O limite em si é provado em testar-isolamento.sh; aqui só este Nginx
# descartável é afrouxado. Reescreve o arquivo no mesmo inode (o bind-mount de arquivo único não
# enxerga um `sed -i`, que troca o inode).
conf_nginx="$T/nginx/nginx.conf"
sed -E 's#(zone=(login|sessao):10m rate=)[0-9]+r/m#\16000r/m#' "$conf_nginx" >"$conf_nginx.novo"
cat "$conf_nginx.novo" >"$conf_nginx" && rm -f "$conf_nginx.novo"
grep -q 'rate=6000r/m' "$conf_nginx" || die "não consegui afrouxar o limite de taxa do Nginx do E2E"
docker exec "$NGINX" nginx -t >/dev/null 2>&1 || die "nginx.conf do E2E inválido"
docker exec "$NGINX" nginx -s reload >/dev/null 2>&1 || die "reload do Nginx do E2E falhou"

SAIDA="$("$T/bin/provisionar-empresa.sh" --raiz "$T" --slug "$SLUG" --nome "Restaurante E2E" \
  --admin-email "admin@$SLUG.example.com" --admin-nome "Admin E2E" --sem-tls --sem-pull --sem-systemd 2>"$T/prov.log")" \
  || { cat "$T/prov.log" >&2; die "provisionamento falhou"; }
SENHA="$(sed -n 's/^SENHA TEMPORÁRIA.*: //p' <<<"$SAIDA")"
[[ -n "$SENHA" ]] || die "não consegui ler a senha temporária do administrador"

docker exec "${SLUG}_api" python -m app.cli seed-demo >&2

export E2E_BASE_URL="http://$SLUG.localhost:$PORTA"
export E2E_ADMIN_EMAIL="admin@$SLUG.example.com"
export E2E_ADMIN_SENHA="$SENHA"
log "rodando Playwright contra $E2E_BASE_URL"
cd "$REPO/frontend"
# shellcheck disable=SC2086  # E2E_ARGS são argumentos soltos de propósito
pnpm exec playwright test ${E2E_ARGS:-}
