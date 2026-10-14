#!/usr/bin/env bash
# Endurecimento básico do servidor (firewall + SSH) e verificação de exposição.
#
#   (sem --aplicar)  SOMENTE LEITURA: mostra o que seria feito e verifica o que está exposto
#   --aplicar        executa (exige root). Mexe em firewall e SSH: leia o plano antes.
#
# Uso: endurecer-servidor.sh --ssh-de CIDR [--ssh-porta 22] [--ssh-endurecer] [--aplicar]
#   --ssh-de CIDR     rede de onde o SSH é aceito (ex.: 203.0.113.10/32 ou a VPN). Obrigatório.
#   --ssh-endurecer   também grava PasswordAuthentication no / PermitRootLogin prohibit-password
#                     (só aplica se o usuário atual já tem chave em authorized_keys)
#
# Regras: negar entrada por padrão; liberar 80 e 443 para todos e o SSH só para --ssh-de.
# Atenção: portas publicadas pelo Docker NÃO passam pelo ufw. Por isso a verificação lista toda
# porta publicada fora do loopback: só 80/443 do Nginx podem aparecer.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SSH_DE="" SSH_PORTA=22 APLICAR=0 SSH_ENDURECER=0
while (($#)); do
  case "$1" in
    --ssh-de) SSH_DE="$2"; shift 2 ;;
    --ssh-porta) SSH_PORTA="$2"; shift 2 ;;
    --ssh-endurecer) SSH_ENDURECER=1; shift ;;
    --aplicar) APLICAR=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
[[ "$SSH_DE" =~ ^[0-9a-fA-F:.]+(/[0-9]{1,3})?$ ]] || die "informe --ssh-de com um IP ou CIDR válido"
[[ "$SSH_PORTA" =~ ^[0-9]{1,5}$ ]] || die "--ssh-porta inválida"

# --- verificação (sempre, somente leitura) ----------------------------------------------------
PROBLEMAS=0
log "== portas publicadas pelo Docker fora do loopback"
if command -v docker >/dev/null 2>&1; then
  while IFS=$'\t' read -r nome portas; do
    [[ -n "$portas" ]] || continue
    IFS=',' read -ra lista <<<"$portas"
    for p in "${lista[@]}"; do
      p="${p// /}"
      # formatos: 0.0.0.0:80->80/tcp, [::]:443->443/tcp, 127.0.0.1:18080->80/tcp
      [[ "$p" == *"->"* ]] || continue
      [[ "$p" == 127.0.0.1:* || "$p" == "[::1]:"* ]] && continue
      host_port="${p%%->*}"
      host_port="${host_port##*:}"
      if [[ "$host_port" != 80 && "$host_port" != 443 ]]; then
        log "EXPOSTO: $nome publica $p"
        PROBLEMAS=$((PROBLEMAS + 1))
      fi
    done
  done < <(docker ps --format '{{.Names}}\t{{.Ports}}')
else
  log "docker ausente: nada a verificar"
fi
log "== firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw status verbose 2>/dev/null | sed 's/^/   /' >&2 || log "   (ufw sem permissão de leitura: rode como root)"
else
  log "   ufw não instalado"
fi
log "== SSH"
if [[ -r /etc/ssh/sshd_config ]] && command -v sshd >/dev/null 2>&1; then
  (sshd -T 2>/dev/null | grep -Ei '^(passwordauthentication|permitrootlogin|port) ' | sed 's/^/   /' >&2) || true
fi

PLANO=(
  "ufw default deny incoming"
  "ufw default allow outgoing"
  "ufw allow from $SSH_DE to any port $SSH_PORTA proto tcp"
  "ufw allow 80/tcp"
  "ufw allow 443/tcp"
  "ufw --force enable"
)
log "== plano"
printf '   %s\n' "${PLANO[@]}" >&2
((SSH_ENDURECER)) && log "   + /etc/ssh/sshd_config.d/90-sistema-pdv.conf (PasswordAuthentication no, PermitRootLogin prohibit-password)"

if ((!APLICAR)); then
  log "modo somente leitura: nada foi alterado (use --aplicar para executar o plano)"
  ((PROBLEMAS == 0)) || exit 2
  exit 0
fi

# --- aplicação ---------------------------------------------------------------------------------
[[ $EUID -eq 0 ]] || die "--aplicar exige root"
exigir_comandos ufw
# Evita se trancar para fora: a sessão SSH atual precisa estar dentro de --ssh-de.
if [[ -n "${SSH_CLIENT:-}" ]]; then
  cliente="${SSH_CLIENT%% *}"
  if [[ "$SSH_DE" != */* ]]; then
    [[ "$cliente" == "$SSH_DE" ]] || die "sua sessão SSH ($cliente) ficaria fora de --ssh-de ($SSH_DE)"
  else
    log "aviso: confirme que $cliente (sua sessão SSH) está dentro de $SSH_DE antes de seguir"
  fi
fi
for cmd in "${PLANO[@]}"; do
  log "executando: $cmd"
  # shellcheck disable=SC2086  # o plano é uma lista de comandos simples
  $cmd
done
if ((SSH_ENDURECER)); then
  usuario="${SUDO_USER:-root}"
  home="$(getent passwd "$usuario" | cut -d: -f6)"
  [[ -s "$home/.ssh/authorized_keys" ]] || die "$usuario não tem chave em authorized_keys: não vou desligar a senha"
  conf=/etc/ssh/sshd_config.d/90-sistema-pdv.conf
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' >"$conf"
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    log "SSH endurecido ($conf)"
  else
    rm -f "$conf"
    die "sshd -t falhou: configuração revertida"
  fi
fi
((PROBLEMAS == 0)) || { log "atenção: $PROBLEMAS porta(s) exposta(s) pelo Docker; o ufw não as bloqueia"; exit 2; }
log "endurecimento aplicado"
