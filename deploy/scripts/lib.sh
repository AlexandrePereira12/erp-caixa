#!/usr/bin/env bash
# Funções comuns dos scripts de deploy. Uso: source "$(dirname "$0")/lib.sh"
# Layout da instalação (RAIZ, padrão /opt/sistema-pdv):
#   config.env  bin/  share/  nginx/  certbot/  empresas/<slug>/  backups/<slug>/

set -euo pipefail

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }

exigir_comandos() {
  local c
  for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "comando ausente: $c"; done
}

# RAIZ vem de --raiz (já em $RAIZ), de $PDV_ROOT ou do padrão. config.env define defaults
# (DOMINIO_BASE, ACME_EMAIL, IMAGE_*, TIMEZONE_PADRAO, BACKUP_*); variáveis já definidas no
# ambiente ou em flags têm precedência.
iniciar_raiz() {
  RAIZ="${RAIZ:-${PDV_ROOT:-/opt/sistema-pdv}}"
  [[ -d "$RAIZ" ]] || die "raiz $RAIZ não existe (rode preparar-servidor.sh antes)"
  RAIZ="$(cd "$RAIZ" && pwd)"
  if [[ -f "$RAIZ/config.env" ]]; then
    local linha chave valor
    while IFS= read -r linha || [[ -n "$linha" ]]; do
      [[ "$linha" =~ ^[A-Z_][A-Z0-9_]*= ]] || continue
      chave="${linha%%=*}"
      valor="${linha#*=}"
      # só preenche o que ainda não foi definido (ambiente/flag prevalece)
      [[ -n "${!chave:-}" ]] || printf -v "$chave" '%s' "$valor"
    done <"$RAIZ/config.env"
  fi
}

validar_slug() {
  [[ "${1:-}" =~ ^[a-z][a-z0-9]{1,23}$ ]] \
    || die "slug inválido '${1:-}': use minúsculas e dígitos, começando por letra (2 a 24 caracteres)"
}

# ler_env ARQUIVO CHAVE — lê um valor sem executar o arquivo.
ler_env() {
  local v
  v="$(grep -E "^$2=" "$1" | head -n1 | cut -d= -f2-)" || true
  printf '%s' "$v"
}

# definir_env ARQUIVO CHAVE VALOR — só aceita valores simples (sem metacaracteres do sed).
definir_env() {
  [[ "$3" =~ ^[A-Za-z0-9._:/@-]+$ ]] || die "valor inválido para $2: '$3'"
  if grep -qE "^$2=" "$1"; then
    sed -i "s|^$2=.*|$2=$3|" "$1"
  else
    printf '%s=%s\n' "$2" "$3" >>"$1"
  fi
}

dir_empresa() { printf '%s/empresas/%s' "$RAIZ" "$1"; }

# compose_empresa SLUG args... — docker compose da empresa (lê o .env do diretório).
compose_empresa() {
  local slug="$1" d
  shift
  d="$(dir_empresa "$slug")"
  docker compose --project-directory "$d" -f "$d/docker-compose.yml" "$@"
}

# compose_nginx args... — docker compose do Nginx (compose base + override com as redes das empresas).
compose_nginx() {
  docker compose --project-directory "$RAIZ/nginx" \
    -f "$RAIZ/nginx/docker-compose.yml" -f "$RAIZ/nginx/networks.generated.yml" "$@"
}

nginx_container() {
  local v=""
  [[ -f "$RAIZ/nginx/.env" ]] && v="$(ler_env "$RAIZ/nginx/.env" NGINX_CONTAINER)"
  printf '%s' "${v:-pdv_nginx}"
}

nginx_rodando() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$(nginx_container)" 2>/dev/null || true)" == "true" ]]
}

nginx_recarregar() {
  docker exec "$(nginx_container)" nginx -t >&2 || return 1
  docker exec "$(nginx_container)" nginx -s reload
}

# Regenera o override do compose do Nginx com a rede _edge de cada empresa. O Nginx entra nelas
# ao vivo (docker network connect, sem derrubar ninguém); este arquivo faz o mesmo valer quando o
# container for recriado.
gerar_redes_nginx() {
  local f="$RAIZ/nginx/networks.generated.yml" e slug
  local -a slugs=()
  for e in "$RAIZ"/empresas/*/.env; do
    [[ -f "$e" ]] || continue
    slug="$(ler_env "$e" EMPRESA_SLUG)"
    [[ -n "$slug" ]] && slugs+=("$slug")
  done
  {
    echo "# GERADO pelos scripts de deploy a cada provisionamento. Não edite."
    if ((${#slugs[@]} == 0)); then
      echo "services: {}"
    else
      echo "services:"
      echo "  nginx:"
      echo "    networks:"
      for slug in "${slugs[@]}"; do echo "      - ${slug}_edge"; done
      echo "networks:"
      for slug in "${slugs[@]}"; do
        echo "  ${slug}_edge:"
        echo "    external: true"
        echo "    name: ${slug}_edge"
      done
    fi
  } >"$f.tmp"
  mv "$f.tmp" "$f"
}

# Primeira sub-rede /24 livre em 172.30.0.0/16 (descontadas as das empresas e as do Docker).
alocar_subnet() {
  local usadas n cand e redes
  redes="$(docker network ls -q | tr '\n' ' ')"
  # shellcheck disable=SC2086  # lista de ids separados por espaço, de propósito
  usadas=" $(docker network inspect $redes \
    --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null | tr '\n' ' ') "
  for e in "$RAIZ"/empresas/*/.env; do
    [[ -f "$e" ]] && usadas+=" $(ler_env "$e" SUBNET_EDGE) "
  done
  for n in $(seq 1 250); do
    cand="172.30.$n.0/24"
    [[ "$usadas" == *" $cand "* ]] || { printf '%s' "$cand"; return 0; }
  done
  die "sem sub-rede livre em 172.30.0.0/16"
}

gerar_segredo() { openssl rand -hex "${1:-24}"; }

# Espera (até ~20 s) o Nginx atender o host: `nginx -s reload` volta antes dos novos workers
# estarem ativos, e um host ainda desconhecido é derrubado pelo servidor padrão (444).
# Qualquer resposta HTTP (200, 301, 404, 502) prova que o server block do host já vale.
aguardar_host_no_nginx() { # aguardar_host_no_nginx HOST
  local out _
  for _ in $(seq 1 40); do
    out="$(docker exec "$(nginx_container)" wget -q -S -O /dev/null \
      --header "Host: $1" http://127.0.0.1/ 2>&1 || true)"
    [[ "$out" == *"HTTP/"* ]] && return 0
    sleep 0.5
  done
  return 1
}

# Tabelas de histórico (imutáveis para a API). Espelha IMUTAVEIS em backend/tests/test_endurecimento.py,
# que falha se uma tabela nova ficar sem classificação.
# shellcheck disable=SC2034  # usado por restaurar-empresa.sh, que carrega este arquivo
TABELAS_APPEND_ONLY=(
  auditoria_log movimento_estoque movimento_caixa caixa_evento comanda_evento
  titulo_receber_baixa titulo_pagar_baixa venda venda_item venda_pagamento venda_estorno
  caixa_conferencia
)

# Validadores de entrada do operador: nada com metacaractere de shell, sed ou nginx passa.
validar_dominio() {
  [[ "${1:-}" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$ || "${1:-}" == localhost ]] \
    || die "domínio inválido '${1:-}': use um nome DNS em minúsculas (ex.: meusistema.com.br)"
}
validar_email() {
  [[ "${1:-}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "e-mail inválido '${1:-}'"
}
validar_timezone() {
  [[ "${1:-}" =~ ^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$ || "${1:-}" == UTC ]] || die "fuso inválido '${1:-}' (ex.: America/Fortaleza)"
}
validar_tag() {
  [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die "tag de imagem inválida '${1:-}'"
}
