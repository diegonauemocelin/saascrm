#!/usr/bin/env bash
# Primeira instalação da plataforma SaaS CRM numa VPS dedicada. Rode como root, dentro de /opt/saascrm (clone do
# repositório):
#
#   sudo BACKUP_AGE_RECIPIENT="age1..." bash deploy/instalar.sh sgmulticonecta.com.br voce@sgmulticonecta.com.br "Seu Nome"
#
# Antes, no DNS do domínio da plataforma, crie (apontando para o IP desta VPS):
#   - registro A de  sgmulticonecta.com.br
#   - registro A de  *.sgmulticonecta.com.br   (curinga: o painel e o endereço de cada empresa)
#
# O que ele faz:
#  1. Confere pré-requisitos (Docker, Compose, portas 80 e 443 livres, DNS).
#  2. Cria o .env com segredos aleatórios (se ainda não existir).
#  3. Sobe os containers (Caddy com HTTPS automático, frontend, API, banco e backup).
#  4. Cria a empresa dona da plataforma (sgmulticonecta), os perfis padrão e o primeiro administrador.

set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$RAIZ"
exigir_root

DOMINIO="${1:?Informe o domínio da plataforma. Ex.: sgmulticonecta.com.br}"
ADMIN_EMAIL="${2:?Informe o e-mail do primeiro administrador}"
ADMIN_NOME="${3:-Administrador}"
PAINEL="admin.$DOMINIO"

info "1/4 Conferindo pré-requisitos"
command -v docker >/dev/null || fatal "Docker não instalado. Veja docs/DEPLOY.md (seção Docker) e rode de novo."
docker compose version >/dev/null 2>&1 || fatal "Docker Compose v2 não encontrado (pacote docker-compose-plugin)."
command -v git >/dev/null || fatal "Git não encontrado."
ok "Docker, Compose e Git presentes"

for porta in 80 443; do
  if ss -tln | awk '{print $4}' | grep -qE "[:.]$porta$" && ! dc ps -q caddy 2>/dev/null | grep -q .; then
    fatal "A porta $porta já está em uso (outro servidor web?). Esta instalação é para uma VPS dedicada à plataforma."
  fi
done
ok "Portas 80 e 443 livres"

IP_VPS="$(curl -4 -fsS --max-time 5 https://api.ipify.org || true)"
for nome in "$DOMINIO" "$PAINEL" "teste-dns.$DOMINIO"; do
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
