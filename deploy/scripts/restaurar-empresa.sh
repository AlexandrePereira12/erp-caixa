#!/usr/bin/env bash
# Restaura o banco de UMA empresa a partir de um backup do backup-empresa.sh.
#
#   --testar            NÃO destrutivo: restaura em um Postgres descartável e confere o resultado
#   --confirmo <slug>   restauração real (derruba api/web durante o processo, faz backup de
#                       segurança antes); exige repetir o slug da empresa
#   --sem-checksum      aceita um backup sem o arquivo .sha256 ao lado (por padrão é recusado)
#
# Uso: restaurar-empresa.sh --slug S --arquivo ARQ.dump (--testar | --confirmo S) [--raiz DIR]
#
# Segurança: o dump é tratado como não confiável. A restauração real roda com o role DONO do schema
# (sem superusuário), então um dump adulterado não passa do que as migrations já podem fazer.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

RAIZ="${RAIZ:-}" SLUG="" ARQ="" TESTAR=0 CONFIRMO="" SEM_CHECKSUM=0
while (($#)); do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --arquivo) ARQ="$2"; shift 2 ;;
    --testar) TESTAR=1; shift ;;
    --confirmo) CONFIRMO="$2"; shift 2 ;;
    --sem-checksum) SEM_CHECKSUM=1; shift ;;
    --raiz) RAIZ="$2"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
exigir_comandos docker sha256sum
iniciar_raiz
validar_slug "$SLUG"
[[ -f "$ARQ" ]] || die "arquivo de backup não encontrado: $ARQ"
if ((TESTAR)) && [[ -n "$CONFIRMO" ]]; then die "use --testar OU --confirmo, não os dois"; fi
if ! ((TESTAR)) && [[ "$CONFIRMO" != "$SLUG" ]]; then
  die "restauração real: confirme com --confirmo $SLUG (ou use --testar para ensaiar sem alterar nada)"
fi

ENV="$(dir_empresa "$SLUG")/.env"
[[ -f "$ENV" ]] || die "empresa '$SLUG' não encontrada em $RAIZ"
DB="$(ler_env "$ENV" POSTGRES_DB)"
ADMIN="$(ler_env "$ENV" POSTGRES_USER)"
OWNER="$(ler_env "$ENV" DB_OWNER_USER)"
APP="$(ler_env "$ENV" DB_APP_USER)"
APP_PW="$(ler_env "$ENV" DB_APP_PASSWORD)"
IMAGEM_DB="$(ler_env "$ENV" IMAGE_DB)"

# Quem escreve no destino do backup poderia plantar dump e hash juntos; ainda assim, sem o hash
# nem a verificação mínima de integridade existe.
if [[ -f "$ARQ.sha256" ]]; then
  (cd "$(dirname "$ARQ")" && sha256sum -c "$(basename "$ARQ").sha256" >&2) || die "checksum do backup não confere"
elif ((SEM_CHECKSUM)); then
  log "aviso: restaurando SEM verificar checksum (--sem-checksum)"
else
  die "sem $(basename "$ARQ").sha256 ao lado do backup: recuse backup sem checksum (ou use --sem-checksum sabendo o risco)"
fi

# Consultas de sanidade comuns aos dois modos.
consulta_sql() { # consulta_sql CONTAINER USUARIO BANCO SQL
  docker exec "$1" psql -h 127.0.0.1 -U "$2" -d "$3" -tA -c "$4"
}

# sanidade CONTAINER USUARIO BANCO MODO — MODO=completo exige TODAS as tabelas de histórico com seus
# triggers (depois do migrate); MODO=minimo só o essencial (backup de schema mais antigo).
sanidade() {
  local c="$1" u="$2" b="$3" modo="$4" tabelas versao usuarios auditoria t n faltando=()
  tabelas="$(consulta_sql "$c" "$u" "$b" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
  versao="$(consulta_sql "$c" "$u" "$b" "SELECT version_num FROM alembic_version")"
  usuarios="$(consulta_sql "$c" "$u" "$b" "SELECT count(*) FROM usuario")"
  auditoria="$(consulta_sql "$c" "$u" "$b" "SELECT count(*) FROM auditoria_log")"
  log "sanidade: tabelas=$tabelas migration=$versao usuarios=$usuarios auditoria=$auditoria"
  [[ "$tabelas" -ge 8 && -n "$versao" ]] || die "restauração incompleta (tabelas/migration)"
  for t in "${TABELAS_APPEND_ONLY[@]}"; do
    n="$(consulta_sql "$c" "$u" "$b" "SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN -1 ELSE (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.$t'::regclass AND tgname IN ('${t}_append_only', '${t}_append_only_truncate')) END")"
    [[ "$n" == 2 ]] || faltando+=("$t")
  done
  if ((${#faltando[@]})); then
    if [[ "$modo" == completo ]]; then
      die "triggers append-only ausentes em: ${faltando[*]}"
    fi
    log "aviso: sem triggers append-only (backup de schema anterior? o migrate cria): ${faltando[*]}"
    [[ " ${faltando[*]} " != *" auditoria_log "* ]] || die "auditoria_log sem triggers append-only"
  fi
}

# Política de privilégios do role da API: DML em tudo, exceto UPDATE/DELETE/TRUNCATE nas tabelas
# append-only (identificadas pelo trigger *_append_only criado nas migrations).
reaplicar_privilegios() { # reaplicar_privilegios CONTAINER ADMIN BANCO ROLE_APP
  docker exec -i "$1" psql -h 127.0.0.1 -U "$2" -d "$3" -v ON_ERROR_STOP=1 -v app="$4" -q >&2 <<'SQL'
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app') \gexec
SELECT DISTINCT format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM %I', tgrelid::regclass, :'app')
  FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_append\_only%' \gexec
SQL
}

if ((TESTAR)); then
  NOME="pdv_restauracao_teste_$$"
  trap 'docker rm -f "$NOME" >/dev/null 2>&1 || true' EXIT
  log "subindo Postgres descartável..."
  docker run -d --name "$NOME" -e POSTGRES_PASSWORD=descartavel --tmpfs /var/lib/postgresql/data \
    "$IMAGEM_DB" >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$NOME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$NOME" pg_isready -h 127.0.0.1 -U postgres >/dev/null || die "Postgres descartável não subiu"
  docker exec "$NOME" createdb -U postgres restauracao
  log "restaurando $ARQ..."
  docker exec -i "$NOME" pg_restore -U postgres -d restauracao --no-owner --no-privileges --exit-on-error <"$ARQ"
  sanidade "$NOME" postgres restauracao minimo
  log "TESTE DE RESTAURAÇÃO OK (nada em produção foi alterado)"
  exit 0
fi

# --- restauração real -------------------------------------------------------------------------
log "backup de segurança do estado atual antes de restaurar..."
SEGURANCA="$("$SCRIPT_DIR/backup-empresa.sh" --slug "$SLUG" --raiz "$RAIZ" --destino "$RAIZ/backups/$SLUG/pre-restauracao")" \
  || die "backup de segurança falhou: nada foi alterado"
log "segurança em $SEGURANCA"

log "parando api e web de $SLUG..."
compose_empresa "$SLUG" stop api web >&2
log "restaurando (pg_restore --clean, como o role dono do schema)..."
# --no-privileges: as permissões do dump partem do que o banco novo já concedia por padrão e NÃO
# removem o excesso; por isso são reaplicadas logo abaixo, de forma determinística.
if ! docker exec -i "${SLUG}_db" pg_restore -U "$OWNER" -d "$DB" --clean --if-exists \
      --no-owner --no-privileges --exit-on-error <"$ARQ"; then
  log "ERRO na restauração. Estado anterior preservado em $SEGURANCA"
  log "api/web continuam PARADAS: restaure $SEGURANCA com este mesmo script se necessário"
  exit 1
fi
reaplicar_privilegios "${SLUG}_db" "$ADMIN" "$DB" "$APP"

# Backup de um schema mais antigo: o migrate leva ao schema atual (e cria triggers que faltam).
log "migrations (caso o backup seja de um schema anterior)..."
compose_empresa "$SLUG" run --rm migrate >&2
reaplicar_privilegios "${SLUG}_db" "$ADMIN" "$DB" "$APP"
sanidade "${SLUG}_db" "$ADMIN" "$DB" completo

# O role da API não pode ter UPDATE/DELETE em nenhuma tabela de histórico depois da restauração.
export PGPASSWORD="$APP_PW"
for t in "${TABELAS_APPEND_ONLY[@]}"; do
  if docker exec -e PGPASSWORD "${SLUG}_db" psql -h 127.0.0.1 -U "$APP" -d "$DB" -qAt \
       -c "UPDATE \"$t\" SET id = id WHERE false" >/dev/null 2>&1; then
    die "role $APP consegue UPDATE em $t após a restauração (privilégios divergentes)"
  fi
done
unset PGPASSWORD

log "subindo api e web..."
compose_empresa "$SLUG" up -d api web >&2
for _ in $(seq 1 45); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_api")" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "${SLUG}_api")" == "healthy" ]] || die "api não ficou saudável após restaurar"
log "RESTAURAÇÃO CONCLUÍDA para '$SLUG'"
