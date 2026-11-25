#!/usr/bin/env bash
# Empresas fictícias para apresentar o sistema a possíveis clientes (autopeças, loja de roupas, fábrica de roupas para
# padel, construtora e, só com o sistema de Fretes, indústria de roupas esportivas), cada uma com a marca e as cores
# dela e os dados de cada sistema (contatos, atendimentos, WhatsApp, postagens, fretes).
#   sudo bash deploy/demo.sh
# Ficam marcadas como demonstração: não entram na receita, não são cobradas, não publicam e não conectam WhatsApp.
# A senha dos usuários é gerada agora e aparece no fim. Rodar de novo não altera as que já existem.

set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$RAIZ"
exigir_root

info "Criando as empresas de demonstração"
dc exec -T -e DEMO=sim api npx tsx scripts/demo-segmentos.ts
dc exec -T -e DEMO=sim api npx tsx scripts/demo-construcao.ts
dc exec -T -e DEMO=sim api npx tsx scripts/demo-fretes.ts

DOMINIO="$(env_get PLATFORM_DOMAIN)"
if [ "$(env_get HTTPS_MODO)" = nginx ]; then
  info "Certificados dos endereços novos"
  bash deploy/certificados.sh || aviso "O certificado sai na próxima rodada (até 5 minutos)."
fi
echo
ok "Endereços (entre com o e-mail de cada uma e a senha mostrada acima):"
echo "   https://autopecas.$DOMINIO     roberta@autopecas.demo"
echo "   https://vitrinemoda.$DOMINIO   carolina@vitrinemoda.demo"
echo "   https://smashpadel.$DOMINIO    diego@smashpadel.demo"
echo "   https://prime.$DOMINIO         ricardo@prime.demo"
echo "   https://pulso.$DOMINIO         marcia@pulso.demo"
