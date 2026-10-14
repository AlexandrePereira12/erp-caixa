#!/usr/bin/env bash
# Renova certificados próximos do vencimento e recarrega o Nginx (chamado pelo timer systemd).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
iniciar_raiz
exigir_comandos docker

docker run --rm \
  -v "$RAIZ/certbot/etc:/etc/letsencrypt" \
  -v "$RAIZ/certbot/www:/var/www/certbot" \
  "${IMAGE_CERTBOT:-certbot/certbot:v2.11.0}" renew --webroot -w /var/www/certbot --non-interactive

nginx_rodando && nginx_recarregar
log "certificados verificados"
