#!/usr/bin/env bash
# Ambiente de desenvolvimento local.
#   dev.sh db     sobe o Postgres de dev e prepara o banco (idempotente): migrations e, se o banco
#                 for novo, administrador e dados de demonstração
#   dev.sh api    backend em modo reload
#   dev.sh web    frontend (Vite) apontando para o backend
#   dev.sh tudo   api + web no mesmo terminal (Ctrl+C encerra os dois)
# Variáveis: PORTA_API (padrão 8010; a 8000 costuma estar ocupada).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORTA_API="${PORTA_API:-8010}"
COMPOSE=(docker compose -f "$RAIZ/deploy/dev/compose.test.yml")
DB=pdv_dev
ADMIN_EMAIL=admin@dev.example.com
ADMIN_SENHA='SenhaDev#2026xyz'

# Credenciais do Postgres descartável de teste (não são segredos).
export DATABASE_OWNER_URL="postgresql+psycopg://pdv_owner:pdv_owner_test@127.0.0.1:55432/$DB"
export DATABASE_URL="postgresql+psycopg://pdv_app:pdv_app_test@127.0.0.1:55432/$DB"
export DB_APP_USER=pdv_app
export JWT_SECRET=dev-segredo-local-com-mais-de-32-caracteres
export COOKIE_SECURE=false

BACK="$RAIZ/backend"
PY="$BACK/.venv/bin"
[[ -x "$PY/python" ]] || { echo "backend sem venv: rode 'make setup'" >&2; exit 1; }

banco() {
  "${COMPOSE[@]}" up -d --wait
  local novo=0
  # o molde pdv_test é dos testes: o dev usa um banco clonado dele
  if [[ -z "$("${COMPOSE[@]}" exec -T db psql -U pdv_admin -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname='$DB'")" ]]; then
    "${COMPOSE[@]}" exec -T db psql -U pdv_admin -d postgres \
      -c "CREATE DATABASE $DB TEMPLATE pdv_test OWNER pdv_owner" >/dev/null
    novo=1
  fi
  cd "$BACK"
  "$PY/alembic" upgrade head
  "$PY/python" -m app.cli bootstrap
  if ((novo)); then
    printf '%s\n' "$ADMIN_SENHA" | "$PY/python" -m app.cli create-admin --email "$ADMIN_EMAIL" --nome "Admin Dev"
    "$PY/python" -m app.cli seed-demo
    echo "login: $ADMIN_EMAIL / $ADMIN_SENHA"
  fi
}

api() {
  cd "$BACK"
  exec "$PY/uvicorn" app.main:create_app --factory --reload --port "$PORTA_API"
}

web() {
  cd "$RAIZ/frontend"
  VITE_API_PROXY_TARGET="http://127.0.0.1:$PORTA_API" exec pnpm dev
}

case "${1:-}" in
  db) banco ;;
  api) api ;;
  web) web ;;
  tudo)
    "$0" api &
    api_pid=$!
    trap 'kill "$api_pid" 2>/dev/null || true' EXIT
    "$0" web
    ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
