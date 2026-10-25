# Site de apresentação (sgmulticonecta.com.br)

Página estática em `apps/site` (HTML, CSS e JS sem build), entregue pelo container `web` quando o endereço é
`sgmulticonecta.com.br` (o `www` redireciona). Está em `apps/web/nginx.conf`, no primeiro bloco `server`.

| O quê | Onde |
|---|---|
| Texto, seções e perguntas frequentes | `apps/site/index.html` |
| Visual | `apps/site/site.css` (cores da marca: roxo `#5b3fd0`, azul `#2a9be3`, amarelo `#ffc21a`, fundo `#16133a`) |
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

`scripts/marca/gerar-marca.cjs` gera `sg-icone.svg`, `sg-logo.svg` e `sg-logo-branco.svg` (texto convertido em curvas,
fonte Montserrat), redesenhados a partir da logo enviada pelo cliente.
