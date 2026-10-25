#!/usr/bin/env bash
# Primeira instalação da plataforma SaaS CRM numa VPS dedicada. Rode como root, dentro de /opt/saascrm (clone do
# repositório):
#
#   sudo BACKUP_AGE_RECIPIENT="age1..." bash deploy/instalar.sh crm.sgmulticonecta.com.br voce@sgmulticonecta.com.br "Seu Nome"
#
# Antes, no DNS do domínio da plataforma, crie (apontando para o IP desta VPS):
#   - registro A de  crm.sgmulticonecta.com.br     (painel da plataforma e página de cadastro)
#   - registro A de  *.crm.sgmulticonecta.com.br   (curinga: o endereço de cada empresa)
# O painel fica no próprio domínio; para outro endereço, informe PAINEL=admin.crm.sgmulticonecta.com.br.
#
# Funciona numa VPS só da plataforma (Caddy nas portas 80/443) ou numa VPS que já tem outro sistema com o Nginx do
# servidor nas portas 80/443 (a plataforma entra com um arquivo próprio no Nginx; os outros sites não são alterados).
#
# O que ele faz:
#  1. Confere pré-requisitos (Docker, Compose, quem usa as portas 80 e 443, DNS).
#  2. Cria o .env com segredos aleatórios (se ainda não existir).
#  3. Sobe os containers (frontend, API, banco, backup e, na VPS só da plataforma, o Caddy).
#  4. Cria a empresa dona da plataforma (sgmulticonecta), os perfis padrão e o primeiro administrador.

set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$RAIZ"
exigir_root

DOMINIO="${1:?Informe o domínio da plataforma. Ex.: crm.sgmulticonecta.com.br}"
ADMIN_EMAIL="${2:?Informe o e-mail do primeiro administrador}"
ADMIN_NOME="${3:-Administrador}"
PAINEL="${PAINEL:-$DOMINIO}"

info "1/4 Conferindo pré-requisitos"
command -v docker >/dev/null || fatal "Docker não instalado. Veja docs/DEPLOY.md (seção Docker) e rode de novo."
docker compose version >/dev/null 2>&1 || fatal "Docker Compose v2 não encontrado (pacote docker-compose-plugin)."
command -v git >/dev/null || fatal "Git não encontrado."
ok "Docker, Compose e Git presentes"

# Quem atende as portas 80 e 443 decide como fica o HTTPS (nada é alterado nesta conferência):
#  - livres (VPS só da plataforma)      -> Caddy da plataforma nas portas 80/443, certificado automático;
#  - Nginx do próprio servidor          -> um arquivo só da plataforma no Nginx + certbot (deploy/certificados.sh);
#  - container de outro sistema         -> para aqui, sem mexer em nada (precisa de análise).
MODO="$(env_get HTTPS_MODO)"
if [ -z "$MODO" ]; then
  OCUPADAS="$(ss -tlnpH '( sport = :80 or sport = :443 )' 2>/dev/null || true)"
  if [ -z "$OCUPADAS" ]; then
    MODO=caddy
  elif echo "$OCUPADAS" | grep -q 'docker-proxy'; then
    erro "As portas 80/443 são de um container de outro sistema:"
    docker ps --format '   {{.Names}} | {{.Image}} | {{.Ports}}' | grep -E ':(80|443)->' >&2 || true
    fatal "Nada foi alterado. Mande esta mensagem para análise: a plataforma precisa entrar pelo servidor web desse container."
  elif echo "$OCUPADAS" | grep -q '"nginx"'; then
    MODO=nginx
  else
    erro "As portas 80/443 estão com outro programa:"
    echo "$OCUPADAS" >&2
    fatal "Nada foi alterado. Mande esta mensagem para análise."
  fi
fi
case "$MODO" in
  caddy) ok "Portas 80 e 443 livres: o HTTPS fica com o Caddy da plataforma" ;;
  nginx)
    ok "Nginx do servidor nas portas 80/443: a plataforma entra com um arquivo próprio, sem mexer nos outros sites"
    nginx -t >/dev/null 2>&1 || fatal "O Nginx do servidor já está com erro de configuração (nginx -t). Nada foi alterado."
    if ! command -v certbot >/dev/null; then
      info "Instalando o certbot (só o programa; não altera o Nginx)"
      apt-get install -y certbot >/dev/null
    fi
    ok "certbot presente"
    ;;
  *) fatal "HTTPS_MODO inválido no .env: $MODO (use caddy ou nginx)." ;;
esac

# Porta interna (127.0.0.1) do frontend: se outro sistema já usa a padrão, escolhe a próxima livre.
PORTA_APP="$(env_get CRM_HTTP_PORT)"
if [ -z "$PORTA_APP" ]; then
  PORTA_APP=8180
  while ss -tlnH "( sport = :$PORTA_APP )" | grep -q .; do PORTA_APP=$((PORTA_APP + 1)); done
fi
ok "Porta interna da plataforma: 127.0.0.1:$PORTA_APP"

IP_VPS="$(curl -4 -fsS --max-time 5 https://api.ipify.org || true)"
for nome in $(printf "%s\n" "$DOMINIO" "$PAINEL" "teste-dns.$DOMINIO" | sort -u); do
  ip="$(getent ahostsv4 "$nome" | awk 'NR==1{print $1}')"
  if [ -z "$ip" ]; then
    fatal "$nome não resolve no DNS. Crie os registros A de $DOMINIO e de *.$DOMINIO apontando para ${IP_VPS:-o IP desta VPS}."
  elif [ -n "$IP_VPS" ] && [ "$ip" != "$IP_VPS" ]; then
    aviso "$nome aponta para $ip, mas o IP desta VPS parece ser $IP_VPS. Os certificados podem falhar."
  fi
done
ok "DNS de $DOMINIO e do curinga *.$DOMINIO conferidos"

info "2/4 Configuração (.env)"
if [ ! -f .env ]; then
  : "${BACKUP_AGE_RECIPIENT:?Informe BACKUP_AGE_RECIPIENT (chave pública age). Veja docs/DEPLOY.md, seção Backup.}"
  umask 077
  cat > .env <<EOF
# Gerado por deploy/instalar.sh em $(date -Iseconds). NUNCA versionar este arquivo.
PLATFORM_DOMAIN=$DOMINIO
PLATFORM_ADMIN_HOST=$PAINEL
TENANT_SLUG=sgmulticonecta
ACME_EMAIL=$ADMIN_EMAIL
HTTPS_MODO=$MODO
CRM_HTTP_PORT=$PORTA_APP
$([ "$MODO" = caddy ] && echo "COMPOSE_PROFILES=caddy" || true)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
BACKUP_AGE_RECIPIENT=$BACKUP_AGE_RECIPIENT
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_HOUR=3
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_NAME=$ADMIN_NOME
SEED_TENANT_NAME=sgmulticonecta
# Asaas (mensalidades): preencha depois de criar a conta (Integrações > Chaves de API) e reinicie (deploy/deploy.sh).
ASAAS_API_KEY=
ASAAS_ENV=sandbox
ASAAS_WEBHOOK_TOKEN=$(openssl rand -hex 24)
# Imagens prontas publicadas pelo GitHub Actions (a VPS não compila nada)
CRM_IMAGE_PREFIX=${CRM_IMAGE_PREFIX:-ghcr.io/diegonauemocelin/saascrm}
# Aviso de "nova versão disponível" no rodapé
GITHUB_REPO=${GITHUB_REPO:-diegonauemocelin/saascrm}
GITHUB_TOKEN=
EOF
  chmod 600 .env
  ok ".env criado com segredos aleatórios (permissão 600)"
  aviso "Guarde uma cópia do APP_ENCRYPTION_KEY em local seguro: sem ele, o 2FA e as senhas guardadas não podem ser lidos após uma restauração."
else
  ok ".env existente mantido"
fi

mkdir -p backups && chown 70:70 backups && chmod 700 backups

info "3/4 Subindo os containers"
bash deploy/deploy.sh

info "4/4 Empresa dona da plataforma, perfis padrão e o primeiro administrador"
dc run --rm --no-deps api prisma db seed

if [ "$(env_get HTTPS_MODO)" = nginx ]; then
  info "Certificados e o arquivo da plataforma no Nginx do servidor"
  bash deploy/certificados.sh || aviso "Os certificados não saíram agora; o cron tenta de novo a cada 5 minutos."
  echo "*/5 * * * * root bash $RAIZ/deploy/certificados.sh >> /var/log/saascrm-certificados.log 2>&1" > /etc/cron.d/saascrm-certificados
  chmod 644 /etc/cron.d/saascrm-certificados
  ok "Endereços novos (empresas e domínios próprios) ganham certificado em até 5 minutos"
fi

if curl -fsS --max-time 30 "https://$PAINEL/api/health" >/dev/null; then
  ok "https://$PAINEL respondendo (certificado emitido)"
else
  aviso "Não foi possível acessar https://$PAINEL daqui ainda (o primeiro certificado leva alguns segundos). Teste pelo navegador."
fi

echo
ok "Instalação concluída."
echo "   Painel da plataforma: https://$PAINEL  (e-mail $ADMIN_EMAIL e a senha provisória exibida acima)"
echo "   Página de cadastro:   https://$DOMINIO/cadastro"
echo "   No primeiro acesso o sistema pede a troca da senha e a configuração do 2FA."
echo "   Asaas: no painel do Asaas, cadastre o webhook https://$PAINEL/api/webhooks/asaas com o token ASAAS_WEBHOOK_TOKEN do .env."
