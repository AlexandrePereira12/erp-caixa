#!/usr/bin/env bash
# Backup lógico do banco de UMA empresa (pg_dump -Fc): verifica a leitura do arquivo, grava o
# checksum, aplica retenção local e, se configurado, copia para fora da VPS (rclone).
# Imprime na saída padrão apenas o caminho do arquivo gerado.
#
# Uso: backup-empresa.sh --slug S [--raiz DIR] [--destino DIR]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RAIZ="${RAIZ:-}" SLUG="" DESTINO=""
while (($#)); do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --raiz) RAIZ="$2"; shift 2 ;;
    --destino) DESTINO="$2"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
exigir_comandos docker sha256sum
iniciar_raiz
validar_slug "$SLUG"

ENV="$(dir_empresa "$SLUG")/.env"
[[ -f "$ENV" ]] || die "empresa '$SLUG' não encontrada em $RAIZ"
DB="$(ler_env "$ENV" POSTGRES_DB)"
USUARIO="$(ler_env "$ENV" POSTGRES_USER)"
DEST="${DESTINO:-$RAIZ/backups/$SLUG}"
RETENCAO="${BACKUP_RETENCAO_DIAS:-14}"
[[ "$RETENCAO" =~ ^[0-9]+$ ]] || die "BACKUP_RETENCAO_DIAS inválido: $RETENCAO"

umask 027
install -d -m 750 "$DEST"
ARQ="$DEST/${SLUG}_$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$ARQ.parcial"' EXIT

log "pg_dump de $DB ($SLUG)..."
docker exec "${SLUG}_db" pg_dump -U "$USUARIO" -d "$DB" -Fc >"$ARQ.parcial"
# o arquivo precisa ser lido de volta de ponta a ponta antes de valer como backup
docker exec -i "${SLUG}_db" pg_restore --list <"$ARQ.parcial" >/dev/null
mv "$ARQ.parcial" "$ARQ"
(cd "$DEST" && sha256sum "$(basename "$ARQ")" >"$(basename "$ARQ").sha256")
log "backup ok: $ARQ ($(du -h "$ARQ" | cut -f1))"

# Retenção local: só arquivos deste padrão e desta empresa.
find "$DEST" -maxdepth 1 -type f -name "${SLUG}_*.dump" -mtime "+$RETENCAO" -print -delete >&2 || true
find "$DEST" -maxdepth 1 -type f -name "${SLUG}_*.dump.sha256" -mtime "+$RETENCAO" -delete || true

FALHOU_REMOTO=0
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  exigir_comandos rclone
  REMOTO="${BACKUP_RCLONE_REMOTE%/}/$SLUG"
  # O dump tem dados pessoais e hashes de senha: só sai da VPS por um remote rclone do tipo `crypt`
  # (cifra no cliente), a menos que o operador assuma o risco de forma explícita.
  TIPO_REMOTO="$(rclone config show "${BACKUP_RCLONE_REMOTE%%:*}" 2>/dev/null | sed -n 's/^type *= *//p' | head -n1)"
  if [[ "$TIPO_REMOTO" != "crypt" && "${BACKUP_PERMITIR_REMOTO_SEM_CRIPTOGRAFIA:-0}" != 1 ]]; then
    FALHOU_REMOTO=1
    log "ERRO: o remote '${BACKUP_RCLONE_REMOTE%%:*}' não é do tipo crypt (é '${TIPO_REMOTO:-desconhecido}'): backup NÃO enviado."
    log "      Crie um remote crypt (rclone config) ou defina BACKUP_PERMITIR_REMOTO_SEM_CRIPTOGRAFIA=1 sabendo o risco."
  elif log "copiando para $REMOTO..." && rclone copy "$ARQ" "$REMOTO/" && rclone copy "$ARQ.sha256" "$REMOTO/"; then
    rclone delete "$REMOTO" --include "${SLUG}_*" --min-age "${BACKUP_REMOTO_RETENCAO_DIAS:-56}d" >&2 \
      || log "aviso: limpeza remota falhou"
  else
    FALHOU_REMOTO=1
    log "ERRO: cópia para fora da VPS falhou (o backup local está íntegro)"
  fi
else
  log "aviso: BACKUP_RCLONE_REMOTE vazio — sem cópia fora da VPS"
fi

printf '%s\n' "$ARQ"
exit "$FALHOU_REMOTO"
