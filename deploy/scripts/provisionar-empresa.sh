#!/usr/bin/env bash
# Provisiona uma empresa nova: .env com segredos exclusivos, 3 containers (web, api, db),
# migrations, administrador inicial, Nginx (+ certificado HTTP-01) e timer de backup.
# Se qualquer etapa falhar, desfaz o que ESTA execução criou (a empresa não pode já existir).
#
# Uso: provisionar-empresa.sh --slug teste --nome "Empresa Teste" \
#        --admin-email admin@teste.com.br --admin-nome "Fulano" [opções]
#   --tag X          tag das imagens (padrão: IMAGE_TAG do config.env)
#   --dominio D      sobrescreve DOMINIO_BASE (host = <slug>.<dominio>)
#   --timezone TZ    padrão: TIMEZONE_PADRAO do config.env (America/Fortaleza)
#   --raiz DIR       raiz da instalação (padrão $PDV_ROOT ou /opt/sistema-pdv)
#   --sem-tls        HTTP puro, cookie sem Secure, sem certbot (somente teste local)
#   --sem-systemd    não instala o timer de backup
#   --sem-pull       não baixa imagens (usa as já presentes no Docker)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RAIZ="${RAIZ:-}" SLUG="" NOME="" ADMIN_EMAIL="" ADMIN_NOME="" TAG="" DOMINIO="" TZ_EMPRESA=""
TLS=1 SYSTEMD=1 PULL=1
while (($#)); do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --nome) NOME="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-nome) ADMIN_NOME="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --dominio) DOMINIO="$2"; shift 2 ;;
    --timezone) TZ_EMPRESA="$2"; shift 2 ;;
    --raiz) RAIZ="$2"; shift 2 ;;
    --sem-tls) TLS=0; shift ;;
    --sem-systemd) SYSTEMD=0; shift ;;
    --sem-pull) PULL=0; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

exigir_comandos docker openssl envsubst curl
iniciar_raiz
validar_slug "$SLUG"
[[ -n "$NOME" && -n "$ADMIN_EMAIL" && -n "$ADMIN_NOME" ]] \
  || die "informe --nome, --admin-email e --admin-nome (veja --help)"
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "e-mail do admin inválido"
# Esses valores vão para o .env e para o compose: caracteres que mudariam a leitura são recusados.
for v in "$NOME" "$ADMIN_NOME"; do
  [[ "$v" != *[\$\#\"\'\`\\]* && "$v" != *$'\n'* ]] || die "nome com caractere não permitido (\$ # \" ' \` \\ ou quebra de linha)"
done

DOMINIO="${DOMINIO:-${DOMINIO_BASE:-}}"
[[ -n "$DOMINIO" ]] || die "defina DOMINIO_BASE no config.env ou use --dominio"
TAG="${TAG:-${IMAGE_TAG:-dev}}"
TZ_EMPRESA="${TZ_EMPRESA:-${TIMEZONE_PADRAO:-America/Fortaleza}}"
# Tudo isso vai para .env, compose e templates do Nginx: validado antes de qualquer uso.
validar_dominio "$DOMINIO"
validar_tag "$TAG"
validar_timezone "$TZ_EMPRESA"
((TLS)) && validar_email "${ACME_EMAIL:-}"
HOST="$SLUG.$DOMINIO"
DIR="$(dir_empresa "$SLUG")"
CONF="$RAIZ/nginx/sites-enabled/$SLUG.conf"
INC="$RAIZ/nginx/sites-enabled/$SLUG.inc"
TPL="$RAIZ/share/nginx-templates"
[[ -e "$DIR" ]] && die "a empresa '$SLUG' já existe em $DIR (nada foi alterado)"
[[ -f "$RAIZ/share/templates/docker-compose.tenant.yml" ]] || die "templates ausentes: rode preparar-servidor.sh"
((TLS)) && [[ -z "${ACME_EMAIL:-}" ]] && die "defina ACME_EMAIL no config.env (ou use --sem-tls só para teste local)"
nginx_rodando || die "Nginx '$(nginx_container)' não está rodando (rode preparar-servidor.sh)"

CRIOU_DIR=0 CONECTOU_REDE=0
desfazer() {
  local rc=$?
  trap - EXIT
  ((rc == 0)) && return 0
  log "FALHOU (código $rc). Desfazendo o que esta execução criou para '$SLUG'..."
  # o Nginx sai da rede antes: rede com endpoint ativo não pode ser removida
  if ((CONECTOU_REDE)); then docker network disconnect -f "${SLUG}_edge" "$(nginx_container)" >&2 || true; fi
  if ((CRIOU_DIR)) && [[ -f "$DIR/docker-compose.yml" ]]; then
    compose_empresa "$SLUG" down -v --remove-orphans >&2 || true
  fi
  rm -f "$CONF" "$INC"
  if ((CRIOU_DIR)) && [[ "$DIR" == "$RAIZ"/empresas/?* ]]; then rm -rf "$DIR"; fi
  gerar_redes_nginx || true
  nginx_rodando && { nginx_recarregar || true; }
  exit "$rc"
}
trap desfazer EXIT

# --- 1. diretório, .env e compose ------------------------------------------------------------
SUBNET="$(alocar_subnet)"
if ((TLS)); then URL="https://$HOST"; SECURE=true; else URL="http://$HOST"; SECURE=false; fi
install -d -m 750 "$DIR"
CRIOU_DIR=1
(
  umask 077
  POSTGRES_PASSWORD="$(gerar_segredo)"
  OWNER_PW="$(gerar_segredo)"
  APP_PW="$(gerar_segredo)"
  cat >"$DIR/.env" <<ENV
EMPRESA_NOME=$NOME
EMPRESA_SLUG=$SLUG
APP_URL=$URL

IMAGE_API=${IMAGE_API:-sistema-pdv-api}
IMAGE_WEB=${IMAGE_WEB:-sistema-pdv-web}
IMAGE_DB=${IMAGE_DB:-postgres:16-alpine}
IMAGE_TAG=$TAG
SUBNET_EDGE=$SUBNET
DB_INIT_SCRIPT=$RAIZ/share/db/10-roles.sh

# bootstrap do Postgres: só backup/restauração (socket local do container); a API nunca o usa
POSTGRES_DB=${SLUG}_db
POSTGRES_USER=${SLUG}_admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
# dono do schema: só o container de migration
DB_OWNER_USER=${SLUG}_owner
DB_OWNER_PASSWORD=$OWNER_PW
DATABASE_OWNER_URL=postgresql+psycopg://${SLUG}_owner:$OWNER_PW@db:5432/${SLUG}_db
# role da API: DML sem DDL, sem UPDATE/DELETE nas tabelas append-only
DB_APP_USER=${SLUG}_app
DB_APP_PASSWORD=$APP_PW
DATABASE_URL=postgresql+psycopg://${SLUG}_app:$APP_PW@db:5432/${SLUG}_db

JWT_SECRET=$(gerar_segredo 32)
TIMEZONE=$TZ_EMPRESA
COOKIE_SECURE=$SECURE
TRUSTED_PROXY_CIDRS=$SUBNET
ENV
)
install -m 644 "$RAIZ/share/templates/docker-compose.tenant.yml" "$DIR/docker-compose.yml"

# --- 2. containers ---------------------------------------------------------------------------
if ((PULL)); then compose_empresa "$SLUG" pull api web db >&2; fi
log "subindo banco..."
compose_empresa "$SLUG" up -d db >&2
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_db")" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_db")" == "healthy" ]] || die "banco não ficou saudável"

log "migrations..."
compose_empresa "$SLUG" run --rm migrate >&2
log "subindo api e web..."
compose_empresa "$SLUG" up -d api web >&2
for _ in $(seq 1 45); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_api")" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_api")" == "healthy" ]] || die "api não ficou saudável"
for _ in $(seq 1 45); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_web")" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_web")" == "healthy" ]] || die "web não ficou saudável"

# --- 3. administrador inicial (senha só no terminal de quem provisiona) -----------------------
ADMIN_SENHA="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)Aa1#"
printf '%s\n' "$ADMIN_SENHA" \
  | compose_empresa "$SLUG" exec -T api python -m app.cli create-admin --email "$ADMIN_EMAIL" --nome "$ADMIN_NOME" >&2

# --- 4. Nginx ---------------------------------------------------------------------------------
# shellcheck disable=SC2016  # as variáveis são do envsubst, não do bash
render() { SLUG="$SLUG" HOST="$HOST" envsubst '${SLUG} ${HOST}' <"$1" >"$2"; }
gerar_redes_nginx
if ! docker network inspect "${SLUG}_edge" --format '{{range .Containers}}{{.Name}} {{end}}' \
    | grep -qw "$(nginx_container)"; then
  docker network connect "${SLUG}_edge" "$(nginx_container)" >&2
  CONECTOU_REDE=1
fi
render "$TPL/tenant-locations.inc.tpl" "$INC"
if ((TLS)); then
  render "$TPL/tenant-http-bootstrap.conf.tpl" "$CONF"
  nginx_recarregar
  aguardar_host_no_nginx "$HOST" || die "Nginx não passou a atender $HOST"
  log "emitindo certificado para $HOST (HTTP-01)..."
  docker run --rm \
    -v "$RAIZ/certbot/etc:/etc/letsencrypt" -v "$RAIZ/certbot/www:/var/www/certbot" \
    "${IMAGE_CERTBOT:-certbot/certbot:v2.11.0}" certonly --webroot -w /var/www/certbot -d "$HOST" \
    --email "$ACME_EMAIL" --agree-tos --no-eff-email --non-interactive >&2
  render "$TPL/tenant-https.conf.tpl" "$CONF"
else
  render "$TPL/tenant-local.conf.tpl" "$CONF"
fi
nginx_recarregar
aguardar_host_no_nginx "$HOST" || die "Nginx não passou a atender $HOST"

# --- 5. backup agendado -----------------------------------------------------------------------
if ((SYSTEMD)) && [[ $EUID -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now "sistema-pdv-backup@${SLUG}.timer" >&2
else
  log "timer de backup NÃO instalado (sem root/systemd ou --sem-systemd): agende backup-empresa.sh --slug $SLUG"
fi

trap - EXIT
log "empresa '$SLUG' provisionada em $URL"
printf '\nADMIN: %s\nSENHA TEMPORÁRIA (aparece só agora; troca obrigatória no 1º acesso): %s\n' \
  "$ADMIN_EMAIL" "$ADMIN_SENHA"
