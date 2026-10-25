# Histórico do projeto SG Multiconecta CRM (SaaS)

Registro para quem continuar o projeto (pessoa ou outro Claude): de onde veio, o que foi decidido, como está no ar e
o que falta. O histórico de código está nos commits da `main`; aqui ficam as decisões e o contexto.

## Origem

- O sistema começou como o **CRM da Usaparts** (importadora de peças para máquinas pesadas), repositório
  `diegonauemocelin/crm`, que continua existindo, recebendo atualizações e instalado na VPS da Usaparts.
- Em 25/10/2026 o Diego pediu um **SaaS com a marca SG Multiconecta**, vendido a outras empresas, em que a empresa
  dona controla tudo, o cliente acessa por um domínio da plataforma ou da própria empresa, **instalado em outra VPS**
  e sem nada da Usaparts. O CRM da Usaparts segue normalmente, separado.
- Este repositório (`diegonauemocelin/saascrm`) começou com a cópia do CRM na versão 0.97.0 (commit `6445c3c`, com as
  migrations unificadas em `20261025000000_base`). **Novidades feitas depois no CRM da Usaparts não entram aqui
  sozinhas**: se o Diego quiser alguma, é preciso trazer à mão (comparando com o repositório `crm`).

## Decisões do Diego

| Assunto | Decisão |
|---|---|
| Cobrança | Asaas, valor fixo por plano, mensal (Pix, boleto ou cartão na fatura) |
| Cadastro | A empresa se cadastra sozinha; com teste grátis (3 ou 7 dias, definido no plano) usa na hora; sem teste, libera ao confirmar o pagamento; não pagou, bloqueia (5 dias de tolerância) |
| Planos | Cada módulo do CRM é um "sistema"; o plano libera sistemas, usuários e números de WhatsApp; dá para liberar sistemas extras por empresa |
| Integração e-commerce e ERP | Ficam no menu como **sob consulta** (cadeado + página de pedido de contato) |
| Domínio | Plataforma em `crm.sgmulticonecta.com.br` (painel e cadastro no próprio domínio); empresas em `<empresa>.crm.sgmulticonecta.com.br`; domínio próprio da empresa por CNAME |
| Site | `sgmulticonecta.com.br` com apresentação, vídeos por segmento (autopeças, loja de roupas, fábrica de roupas para padel) e **planos sob consulta** |
| Marca | SG Multiconecta (logo enviada pelo Diego, redesenhada em SVG): roxo `#5b3fd0`, azul `#2a9be3`, amarelo `#ffc21a`, frase "Atendimento omnichannel com IA" |
| Contador "aguardando retorno" no chat | Vale a regra do CRM 0.91.0: para quando o atendente responde (decisão de 25/10/2026) |

## Cronologia (25/10/2026)

1. **Fase 1** (`4088f1d`): empresas por endereço, planos com sistemas, assinatura, painel da plataforma, limites de
   usuários e de WhatsApp.
2. **Fase 2** (`ae8c471`): cadastro pelo cliente, cobrança no Asaas (cliente, assinatura, webhook com token), tela
   Assinatura, sistemas sob consulta.
3. **Fase 3** (`0bac0cd`): instalação em VPS dedicada (Caddy com certificado sob demanda), retirada da marca e dos
   scripts da Usaparts, versão 1.0.0.
4. Domínio passou a ser `crm.sgmulticonecta.com.br` (`9485b2d`).
5. A VPS escolhida já tinha **outro sistema** com o Nginx do servidor nas portas 80/443 (não pode ser mexido): o
   instalador passou a detectar isso e usar um arquivo próprio no Nginx + certbot (`704fb9f`, `2184028`).
6. **1.0.1** (`a7781bc`): o seed da primeira instalação falhava (faltava `perfis-padrao.ts` na imagem da API).
7. **1.0.2** (`df816b1`, `cef3fa3`): tela de entrada da plataforma (já sou cliente → endereço da empresa; não lembro
   o endereço → link por e-mail; criar conta → cadastro com plano; acesso da administração) e a marca SG Multiconecta.
8. **1.0.3** (`2a322c6`): site de apresentação, aba Site no painel (contato comercial), exemplos dos campos sem
   referências a peças de máquinas.

## Como está no ar

- **VPS**: `srv772376`, IP `91.108.125.234`, código em `/opt/saascrm`. Tem outro sistema rodando (não mexer).
  - `HTTPS_MODO=nginx`: o Nginx do servidor atende 80/443 (IPv4 e IPv6); a plataforma tem só o arquivo
    `/etc/nginx/sites-available/saascrm` (refeito pelo `deploy/certificados.sh`) e o cron
    `/etc/cron.d/saascrm-certificados` (a cada 5 minutos). O certbot já existia no servidor.
  - Porta interna da plataforma: `127.0.0.1:8180`.
- **DNS** (Cloudflare, somente DNS / nuvem cinza): `crm` e `*.crm` → 91.108.125.234 (criados). Para o site faltam
  `@` e `www`.
- **Versão instalada**: 1.0.2 (marca SG Multiconecta e tela de entrada no ar, conferido em 25/10/2026). A 1.0.3 está
  na `main` aguardando a tag.
- **Tags no GitHub**: `v1.0.0`, `v1.0.1` (commit `a7781bc`) e `v1.0.2` (commit `cef3fa3`). Uma `v1.0.1` criada antes,
  por engano, no commit errado, foi apagada e recriada no commit certo.
- **GitHub Container Registry**: pacotes `saascrm-api`, `saascrm-web` e `saascrm-backup` públicos.

## Pendências

1. **Publicar a 1.0.3**: tag `v1.0.3` no commit da versão (o Diego cria), Action verde, `sudo bash deploy/deploy.sh`.
2. **Site no ar**: DNS `@` e `www` → 91.108.125.234; `SITE_DOMAIN=sgmulticonecta.com.br` no `/opt/saascrm/.env`;
   deploy; preencher **Plataforma → Site** (WhatsApp, e-mail e Instagram). O Diego ainda não passou esses contatos.
3. **Configurar a plataforma**: SMTP em Configurações (sem ele, convites, recuperação de senha e "não lembro o
   endereço" não enviam e-mail); planos de verdade; Asaas (sandbox para testar, depois `ASAAS_ENV=producao`) com o
   webhook `https://crm.sgmulticonecta.com.br/api/webhooks/asaas` e o token do `.env`.
4. **Decidir com o Diego**: o site mostra os planos sob consulta, mas a página de cadastro mostra o preço. Esconder o
   preço no cadastro? Ou só liberar o cadastro após a consulta?
5. **Conteúdo do ramo de peças que veio do CRM da Usaparts** (decidir antes de mexer, muda o produto):
   - modelos de landing page (`apps/api/src/landing/modelos.ts`) falam de peças para máquinas pesadas;
   - listas padrão de marcas e tipos de peça (`apps/api/src/atendimento/cadastros.service.ts`, `planilha.ts`) e os
     filtros "Marca" e "Tipo de peça" do Pré-Vendas;
   - assistente de perguntas do Mercado Livre com "aplicações peça x máquina";
   - tema de cores "Grafite + amarelo (linha amarela)" (`apps/web/src/lib/cores.ts`);
   - documento da integração TCAR (ERP usado pela Usaparts) em `docs/TCAR.md`.
6. As empresas de demonstração (Rota Autopeças, Vitrine Moda, Smash Padel Wear) existem só no banco de
   desenvolvimento usado para gravar os vídeos; não estão na VPS.

## Credenciais e dados sensíveis

Nenhuma senha, token ou chave está neste repositório. Ficam no `/opt/saascrm/.env` da VPS (gerado pelo instalador).
O `APP_ENCRYPTION_KEY` e a chave privada de backup (`age`) devem estar guardados pelo Diego fora da VPS.
