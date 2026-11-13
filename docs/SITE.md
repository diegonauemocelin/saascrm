# Site de apresentação (sgmulticonecta.com.br)

Página estática em `apps/site` (HTML, CSS e JS sem build), entregue pelo container `web` quando o endereço é
`sgmulticonecta.com.br` (o `www` redireciona). Está em `apps/web/nginx.conf`, no primeiro bloco `server`.

| O quê | Onde |
|---|---|
| Texto, seções e perguntas frequentes | `apps/site/index.html` |
| Visual | `apps/site/site.css` (manual da marca: Violeta `#5B3FD6`, Azul `#1B9FE8`, Âmbar `#FFC220`, Tinta `#0F1222`, Lilás `#9485FF`, Névoa `#F4F3FB`; fonte Plus Jakarta Sans; botões em cápsula) |
| Troca de segmento e de tela, planos e contato | `apps/site/site.js` |
| Vídeos e capas | `apps/site/video/<segmento>-<tela>.mp4` e `.jpg` |
| Logo e ícone | `apps/site/img` (cópia de `apps/web/public/marca`) |

## Dados que vêm do sistema

`GET /api/public/site` devolve:
- o contato comercial, editado em **Plataforma → Site** (WhatsApp, e-mail e Instagram);
- os planos públicos e ativos **sem o preço** ("sob consulta"), com o botão "Consultar valores" abrindo o WhatsApp
  com a mensagem pronta;
- os endereços de login e cadastro da plataforma.

## Pôr no ar

1. No DNS (Cloudflare), registros **A** `@` e `www` → IP da VPS, somente DNS (nuvem cinza).
2. No `/opt/saascrm/.env`: `SITE_DOMAIN=sgmulticonecta.com.br`.
3. `sudo bash deploy/deploy.sh`. Em até 5 minutos o `deploy/certificados.sh` emite os certificados dos dois
   endereços (`sudo bash deploy/certificados.sh --status` mostra).

## Refazer os vídeos

Os vídeos mostram três empresas fictícias (autopeças, loja de roupas e fábrica de roupas para padel), cada uma com a
própria marca e cores.

1. Banco de desenvolvimento com a plataforma configurada (`PLATFORM_DOMAIN=saas.test`) e um plano "Profissional".
2. `cd apps/api && npx tsx scripts/demo-segmentos.ts` (cria as três empresas; senha `Demo-Segmentos-2026!`).
3. API e Vite rodando (`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.saas.test npx vite`) e o navegador resolvendo
   `*.saas.test` para 127.0.0.1 (o script usa `--host-resolver-rules`).
4. `node scripts/site/gravar-videos.cjs /tmp/gravacoes` (navegador em pt-BR, fuso de Brasília).
5. Converter e gerar as capas:

   ```bash
   for d in /tmp/gravacoes/videos2/*; do n=${d##*/}
     ffmpeg -y -ss 2.2 -i $d/*.webm -an -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart apps/site/video/$n.mp4
     ffmpeg -y -ss 4 -i apps/site/video/$n.mp4 -frames:v 1 -q:v 5 apps/site/video/$n.jpg
   done
   ```

## Marca

Segue o **Manual da Marca SG Multiconecta v1.0** (novembro de 2026): símbolo com três figuras iguais (haste + ponto)
giradas a 120°, nome em Plus Jakarta Sans, assinatura "CRM e atendimento em um só sistema".

- Pacote completo em `docs/marca/`: logotipo horizontal, vertical e reduzido, símbolo, ícone do app e avatar, nas
  versões cores (fundo claro), negativo (fundo escuro, violeta vira Lilás), preto e branco (sobre Violeta), em SVG
  (texto em curvas) e PNG (`docs/marca/png`).
- Gerador: `python3 scripts/marca/gerar_marca.py docs/marca` (precisa de `pip install uharfbuzz fonttools numpy
  scikit-image`). A geometria do símbolo e as medidas do nome foram tiradas do manual e conferidas por sobreposição
  com as páginas dele. Não redesenhe nem redigite o logotipo: gere pelo script ou use os arquivos do pacote.
- Onde está aplicada: site (`apps/site/img/sg-logo-reduzida.svg` no topo, `sg-logo-negativo.svg` no rodapé,
  `sg-simbolo.svg` no centro das integrações, `favicon.svg/png`, `apple-touch-icon.png`), login da plataforma
  (`apps/web/public/marca/sg-logo*.svg`), favicon e ícones do app (`apps/web/public/favicon.svg`, `app-icon.png`,
  `app-icon-maskable.png`, `app-badge.png`) e a marca padrão da plataforma (`apps/api/src/plataforma/perfis-padrao.ts`).
