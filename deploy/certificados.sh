#!/usr/bin/env bash
# HTTPS pelo Nginx do servidor, para a VPS que já tem outro sistema nas portas 80 e 443 (HTTPS_MODO=nginx no .env).
# Roda sozinho a cada 5 minutos (cron instalado pelo deploy/instalar.sh):
#   sudo bash deploy/certificados.sh             -> pega na API os endereços da plataforma, emite os certificados que
#                                                    faltam (certbot) e atualiza o arquivo do Nginx da plataforma
#   sudo bash deploy/certificados.sh --status    -> só mostra os endereços e se cada um já tem certificado
#
# Só mexe no arquivo próprio da plataforma (saascrm). Antes de recarregar, confere com "nginx -t"; se der erro, volta o
# arquivo anterior e não recarrega: os outros sites do servidor não são afetados.

set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$RAIZ"
exigir_root

exec 9>"$ESTADO/certificados.lock"
flock -n 9 || exit 0

PORTA="$(porta_http)"
EMAIL="$(env_get ACME_EMAIL)"
WEBROOT=/var/www/saascrm-acme
FALHAS="$ESTADO/certificados-falhas"
LIVE=/etc/letsencrypt/live
# Tentativa que falhou só se repete depois de 6 h (o Let's Encrypt limita as falhas por endereço).
ESPERA_FALHA=$((6 * 3600))
# Emissões por rodada: um lote grande de empresas novas vai entrando aos poucos.
MAX_POR_RODADA=10
mkdir -p "$WEBROOT" "$FALHAS"

if [ -d /etc/nginx/sites-enabled ] && grep -rqs "sites-enabled" /etc/nginx/nginx.conf; then
  CONF=/etc/nginx/sites-available/saascrm
  LINK=/etc/nginx/sites-enabled/saascrm
else
  CONF=/etc/nginx/conf.d/saascrm.conf
  LINK=""
fi

# O Nginx do servidor já atende em IPv6? Então a plataforma também (sem IPv6 no servidor, só IPv4).
IPV6=""
ss -tlnH '( sport = :443 )' 2>/dev/null | grep -q '\[::\]' && IPV6=1

# Endereços que a plataforma usa (domínio, painel, empresas e domínios próprios conferidos), por dentro do container.
HOSTS="$(dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/public/certificados').then(async (r) => { if (!r.ok) process.exit(1); process.stdout.write(await r.text()) }).catch(() => process.exit(1))" 2>/dev/null | grep -E '^[a-z0-9.-]+$' || true)"
[ -n "$HOSTS" ] || fatal "A API não respondeu a lista de endereços (o sistema está no ar? sudo docker compose ps). Nada foi alterado."

tem_certificado() { [ -s "$LIVE/$1/fullchain.pem" ] && [ -s "$LIVE/$1/privkey.pem" ]; }

if [ "${1:-}" = "--status" ]; then
  while read -r h; do
    if tem_certificado "$h"; then ok "$h"; else aviso "$h (sem certificado ainda)"; fi
  done <<< "$HOSTS"
  exit 0
fi

gerar() {
  local h
  echo "# Gerado por deploy/certificados.sh em $(date -Iseconds). Não edite: é refeito a cada 5 minutos."
  echo
  echo "server {"
  echo "    listen 80;"
  [ -z "$IPV6" ] || echo "    listen [::]:80;"
  echo "    server_name $(echo "$HOSTS" | tr '\n' ' ');"
  echo "    server_tokens off;"
  echo "    location /.well-known/acme-challenge/ { root $WEBROOT; }"
  echo "    location / { return 301 https://\$host\$request_uri; }"
  echo "}"
  while read -r h; do
    tem_certificado "$h" || continue
    cat <<EOF

server {
    listen 443 ssl;$([ -z "$IPV6" ] || printf '\n    listen [::]:443 ssl;')
    server_name $h;
    server_tokens off;
    ssl_certificate $LIVE/$h/fullchain.pem;
    ssl_certificate_key $LIVE/$h/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 70m;
    access_log /var/log/nginx/saascrm.access.log;
    error_log /var/log/nginx/saascrm.error.log;
    location / {
        proxy_pass http://127.0.0.1:$PORTA;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
  done <<< "$HOSTS"
}

recarregar() { systemctl reload nginx 2>/dev/null || nginx -s reload; }

# Grava o arquivo novo só se mudou; com erro no "nginx -t", volta o anterior.
aplicar() {
  local novo anterior=""
  novo="$(mktemp)"
  gerar > "$novo"
  if [ -f "$CONF" ] && diff -q <(grep -v '^# Gerado' "$CONF") <(grep -v '^# Gerado' "$novo") >/dev/null; then
    rm -f "$novo"
    return 0
  fi
  if [ -f "$CONF" ]; then anterior="$(mktemp)"; cp "$CONF" "$anterior"; fi
  install -m 644 "$novo" "$CONF"
  rm -f "$novo"
  [ -z "$LINK" ] || ln -sf "$CONF" "$LINK"
  if nginx -t >/dev/null 2>&1; then
    recarregar
    [ -z "$anterior" ] || rm -f "$anterior"
    ok "Nginx atualizado ($(grep -c 'listen 443' "$CONF") endereço(s) com HTTPS)"
  else
    if [ -n "$anterior" ]; then mv "$anterior" "$CONF"; else rm -f "$CONF"; [ -z "$LINK" ] || rm -f "$LINK"; fi
    nginx -t 2>&1 | tail -5 >&2 || true
    fatal "A configuração nova do Nginx deu erro; o arquivo anterior foi mantido e nada foi recarregado."
  fi
}

# 1) Porta 80 para todos os endereços (a validação do Let's Encrypt passa por ela).
aplicar

# 2) Certificados que faltam.
command -v certbot >/dev/null || fatal "certbot não instalado (sudo apt-get install -y certbot)."
if [ -n "$EMAIL" ]; then CONTA=(-m "$EMAIL"); else CONTA=(--register-unsafely-without-email); fi
emitidos=0
while read -r h; do
  tem_certificado "$h" && continue
  [ "$emitidos" -lt "$MAX_POR_RODADA" ] || break
  if [ -f "$FALHAS/$h" ] && [ $(( $(date +%s) - $(stat -c %Y "$FALHAS/$h") )) -lt "$ESPERA_FALHA" ]; then continue; fi
  info "Emitindo o certificado de $h"
  if certbot certonly --webroot -w "$WEBROOT" -d "$h" --non-interactive --agree-tos "${CONTA[@]}" \
      --keep-until-expiring --deploy-hook "systemctl reload nginx 2>/dev/null || nginx -s reload" >/dev/null 2>&1; then
    rm -f "$FALHAS/$h"
    ok "$h"
    registrar "certificado" "$h"
  else
    touch "$FALHAS/$h"
    aviso "$h: o Let's Encrypt não validou (o DNS aponta para este servidor?). Nova tentativa em 6 h."
  fi
  emitidos=$((emitidos + 1))
done <<< "$HOSTS"

# 3) HTTPS para os endereços que ganharam certificado.
aplicar
