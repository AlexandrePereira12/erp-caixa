#!/usr/bin/env bash
# Prepara (ou atualiza) a instalação do sistema-pdv em um servidor: árvore de diretórios, scripts,
# templates, Nginx público, timers systemd. Idempotente: reexecutar atualiza scripts e
# configuração, nunca sobrescreve config.env, nginx/.env nem dados das empresas.
#
# Uso: preparar-servidor.sh [--raiz DIR] [--dominio D] [--acme-email E] [--sem-systemd]
#                           [--sem-nginx] [--bind IP] [--porta-http N] [--porta-https N]
#                           [--nginx-container NOME]
set -euo pipefail
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # diretório deploy/ do repositório
# shellcheck source=lib.sh
source "$ORIGEM/scripts/lib.sh"

RAIZ="${RAIZ:-}" DOMINIO="" ACME="" SYSTEMD=1 NGINX_UP=1
BIND="" PORTA_HTTP="" PORTA_HTTPS="" NGINX_NOME=""
while (($#)); do
  case "$1" in
    --raiz) RAIZ="$2"; shift 2 ;;
    --dominio) DOMINIO="$2"; shift 2 ;;
    --acme-email) ACME="$2"; shift 2 ;;
    --sem-systemd) SYSTEMD=0; shift ;;
    --sem-nginx) NGINX_UP=0; shift ;;
    --bind) BIND="$2"; shift 2 ;;
    --porta-http) PORTA_HTTP="$2"; shift 2 ;;
    --porta-https) PORTA_HTTPS="$2"; shift 2 ;;
    --nginx-container) NGINX_NOME="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
RAIZ="${RAIZ:-${PDV_ROOT:-/opt/sistema-pdv}}"
exigir_comandos docker install

log "instalando em $RAIZ"
install -d -m 755 "$RAIZ" "$RAIZ/bin" "$RAIZ/share/db" "$RAIZ/share/templates" \
  "$RAIZ/share/nginx-templates" "$RAIZ/nginx/snippets" "$RAIZ/nginx/sites-enabled" \
  "$RAIZ/certbot/etc" "$RAIZ/certbot/www" "$RAIZ/empresas"
install -d -m 750 "$RAIZ/backups"

# preparar-servidor.sh e testar-isolamento.sh dependem do repositório e rodam a partir dele.
for s in lib.sh provisionar-empresa.sh atualizar-empresa.sh backup-empresa.sh \
         restaurar-empresa.sh renovar-certificados.sh endurecer-servidor.sh; do
  install -m 755 "$ORIGEM/scripts/$s" "$RAIZ/bin/$s"
done
install -m 755 "$ORIGEM/db/10-roles.sh" "$RAIZ/share/db/10-roles.sh"
install -m 644 "$ORIGEM/templates/docker-compose.tenant.yml" "$RAIZ/share/templates/"
install -m 644 "$ORIGEM"/nginx/templates/*.tpl "$RAIZ/share/nginx-templates/"
install -m 644 "$ORIGEM/nginx/docker-compose.yml" "$ORIGEM/nginx/nginx.conf" "$RAIZ/nginx/"
install -m 644 "$ORIGEM"/nginx/snippets/*.conf "$RAIZ/nginx/snippets/"

# config.env: criado uma vez; flags só preenchem o arquivo novo.
if [[ ! -f "$RAIZ/config.env" ]]; then
  install -m 640 "$ORIGEM/config.env.example" "$RAIZ/config.env"
  # Entrada validada antes de qualquer sed: o flag `e` do sed GNU executaria comando.
  if [[ -n "$DOMINIO" ]]; then
    validar_dominio "$DOMINIO"
    sed -i "s|^DOMINIO_BASE=.*|DOMINIO_BASE=$DOMINIO|" "$RAIZ/config.env"
  fi
  if [[ -n "$ACME" ]]; then
    validar_email "$ACME"
    sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=$ACME|" "$RAIZ/config.env"
  fi
  log "criado $RAIZ/config.env (revise DOMINIO_BASE e ACME_EMAIL)"
fi

# nginx/.env: criado uma vez. COMPOSE_FILE soma o override com as redes das empresas.
if [[ ! -f "$RAIZ/nginx/.env" ]]; then
  {
    echo "COMPOSE_FILE=docker-compose.yml:networks.generated.yml"
    echo "NGINX_CONTAINER=${NGINX_NOME:-pdv_nginx}"
    echo "NGINX_BIND=${BIND:-0.0.0.0}"
    echo "NGINX_HTTP_PORT=${PORTA_HTTP:-80}"
    echo "NGINX_HTTPS_PORT=${PORTA_HTTPS:-443}"
  } >"$RAIZ/nginx/.env"
fi

iniciar_raiz
gerar_redes_nginx

if ((SYSTEMD)); then
  if [[ $EUID -ne 0 ]]; then
    log "aviso: sem root, timers systemd não instalados (use --sem-systemd para silenciar)"
  else
    for u in "$ORIGEM"/systemd/*; do
      sed "s|__RAIZ__|$RAIZ|g" "$u" >"/etc/systemd/system/$(basename "$u")"
    done
    systemctl daemon-reload
    systemctl enable --now sistema-pdv-certbot.timer
    log "timers instalados (o de backup é habilitado por empresa no provisionamento)"
  fi
fi

if ((NGINX_UP)); then
  compose_nginx up -d >&2
  nginx_recarregar || log "aviso: nginx -t falhou; veja as configurações em $RAIZ/nginx"
fi
log "pronto. Próximo passo: $RAIZ/bin/provisionar-empresa.sh --slug ... --nome ... --admin-email ... --admin-nome ..."
