#!/usr/bin/env bash
# Atualiza UMA empresa para uma nova tag de imagens: backup, migrations, recriação de api/web,
# verificação de saúde e volta à tag anterior se a api não ficar saudável.
# Migrations já aplicadas NÃO são desfeitas: para voltar o schema, restaure o backup informado.
#
# Uso: atualizar-empresa.sh --slug S --tag T [--raiz DIR] [--sem-pull]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

RAIZ="${RAIZ:-}" SLUG="" TAG="" PULL=1
while (($#)); do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --raiz) RAIZ="$2"; shift 2 ;;
    --sem-pull) PULL=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
exigir_comandos docker
iniciar_raiz
validar_slug "$SLUG"
[[ -n "$TAG" ]] || die "informe --tag"
DIR="$(dir_empresa "$SLUG")"
ENV="$DIR/.env"
[[ -f "$ENV" ]] || die "empresa '$SLUG' não encontrada em $RAIZ"

ANTERIOR="$(ler_env "$ENV" IMAGE_TAG)"
[[ "$ANTERIOR" != "$TAG" ]] || die "'$SLUG' já está na tag $TAG"

aguardar_api() {
  local _
  for _ in $(seq 1 45); do
    [[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_api" 2>/dev/null || true)" == "healthy" ]] && return 0
    sleep 2
  done
  return 1
}

BACKUP="$("$SCRIPT_DIR/backup-empresa.sh" --slug "$SLUG" --raiz "$RAIZ")" \
  || die "backup prévio falhou: nada foi alterado"
log "backup prévio: $BACKUP"

# Compose da empresa acompanha o template instalado; variável nova sem valor no .env aborta aqui.
if ! cmp -s "$RAIZ/share/templates/docker-compose.tenant.yml" "$DIR/docker-compose.yml"; then
  cp "$DIR/docker-compose.yml" "$DIR/docker-compose.yml.anterior"
  install -m 644 "$RAIZ/share/templates/docker-compose.tenant.yml" "$DIR/docker-compose.yml"
  if compose_empresa "$SLUG" config -q 2>&1 | grep -qi "is not set"; then
    mv "$DIR/docker-compose.yml.anterior" "$DIR/docker-compose.yml"
    die "o template novo usa variáveis ausentes no .env de '$SLUG': ajuste o .env e repita"
  fi
  rm -f "$DIR/docker-compose.yml.anterior"
  log "docker-compose.yml atualizado a partir do template"
fi

reverter() {
  definir_env "$ENV" IMAGE_TAG "$ANTERIOR"
  compose_empresa "$SLUG" up -d api web >&2 || true
}

definir_env "$ENV" IMAGE_TAG "$TAG"
if ((PULL)); then compose_empresa "$SLUG" pull api web >&2 || { reverter; die "pull falhou; tag anterior mantida"; }; fi

log "migrations..."
if ! compose_empresa "$SLUG" run --rm migrate >&2; then
  definir_env "$ENV" IMAGE_TAG "$ANTERIOR"
  die "migration falhou. Tag anterior mantida; backup em $BACKUP"
fi

log "recriando api e web na tag $TAG..."
compose_empresa "$SLUG" up -d api web >&2
if ! aguardar_api; then
  log "api NÃO ficou saudável: voltando para $ANTERIOR"
  reverter
  aguardar_api || log "ATENÇÃO: api também não ficou saudável na tag anterior"
  die "atualização falhou. Migrations aplicadas permanecem; para voltar o schema, restaure $BACKUP (restaurar-empresa.sh)"
fi
log "'$SLUG' atualizada: $ANTERIOR -> $TAG (backup em $BACKUP)"
