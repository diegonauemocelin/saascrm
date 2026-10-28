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
| Ramo | Tudo genérico: nada do ramo de peças de máquinas da Usaparts (decisão de 25/10/2026) |
| Preço dos planos | Sob consulta no site e no cadastro (Plataforma → Venda, "Mostrar os preços" desligado); o valor fica no painel e na fatura do Asaas |
| Formas de contratar | Monte o seu (sistemas avulsos, mensalidade = soma), Kits e Completo (planos; o completo tem todos os sistemas); teste grátis de 3 dias nos três; marketplaces é um sistema só |
| Implantação e consultoria | Implantação e acompanhamento grátis em todos; consultoria em Marketing, CRM, Marketplaces e E-commerce à parte, negociada com o cliente (sem pacote) |
| E-mail do sistema (SMTP) | Gmail `sgmulticonecta@gmail.com` com senha de app; os registros MX `.` e SPF `-all` do domínio ficam |
| Contato comercial | WhatsApp (49) 99993-1041 e `sgmulticonecta@gmail.com` (Plataforma → Site) |
| Atualizações do CRM da Usaparts | **Toda** versão nova do CRM da Usaparts (novidades, correções, tudo) também entra aqui, adaptada ao SaaS (empresa pelo endereço, plano, textos genéricos). Decisão de 26/10/2026; até a 0.99.0 já foi trazida (1.0.8 a 1.0.10) |
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
   referências a peças de máquinas. Depois: correções de segurança das dependências (`b401df3`) e CI com o domínio
   de teste da plataforma (`7a293cf`). Site no ar em sgmulticonecta.com.br (DNS `@` e `www`, `SITE_DOMAIN`).
9. **1.0.4**: o Diego pediu "no SG Multiconecta deixa tudo genérico": saiu o ramo de peças para máquinas pesadas
   (rótulos, listas padrão, modelos de landing page, assistente do Mercado Livre, prompts de IA, chatbot, trilha).
   Nomes internos (enums, colunas, chaves) não mudaram. Planos sob consulta também na página de cadastro.
10. **1.0.5 a 1.0.7**: site com marketplaces/Ads/"em breve"; venda por sistema avulso, kits ou completo (sob
   consulta, teste de 3 dias, implantação e acompanhamento grátis, consultoria à parte); empresas de demonstração.
11. **1.0.8**: mapa de vendas no Dashboard executivo (`/marketing/mapa`, `src/marketing/mapa.ts`, desenho
   `@svg-maps/brazil` CC BY 4.0) e Vendas em tempo real (`/vendas-ao-vivo`, `/marketing/ao-vivo`,
   `src/marketing/ao-vivo.ts`). O Diego pediu os dois também no CRM da Usaparts.
12. **1.0.9** (26/10/2026, vindo do CRM da Usaparts 0.98.1 e 0.98.2): WhatsApp com Desconectar/Novo QR Code que trocam a
   instância na Evolution (a sessão antiga não religa o número; instâncias órfãs apagadas pela conferência), envio que
   espera a reconexão em vez de reiniciar, histórico (messages.set) recuperado ao conectar por QR Code, até 10 arquivos
   por envio no chat, menu de robô com um botão só clicável, e a Action "Criar tag da versão".
13. **1.0.10** (26/10/2026, vindo do CRM da Usaparts 0.99.0): app no celular (PWA em `/app`, `apps/web/src/pages/app`)
   com o chat no layout do WhatsApp, painéis pela permissão e conta; notificações Web Push (`apps/api/src/app-movel`,
   chaves VAPID por empresa na configuração `web_push`); manifesto e ícone pela empresa do endereço; horário de acesso
   por perfil (`roles.loginHours`, Administrador sem limite); Configurações › Marca › Ícone do app no celular.
14. **1.0.11 a 1.0.16**: as versões 0.99.1 a 0.101.0 do CRM da Usaparts (app no celular, chat, Assistente ML e Instagram); veja o `releases.json`.
15. **1.0.17** (27/10/2026, vindo do CRM da Usaparts 0.101.1): o backup guarda no máximo 7 cópias (`BACKUP_KEEP`), além
   do limite de dias; na Usaparts os backups das atualizações chegaram a 44 GB e travaram o deploy.
16. **1.0.18** (27/10/2026, vindo do CRM da Usaparts 0.102.0): código e vendedor do cliente no chat e na base de leads
   (`leads.customerCode`, `clientSellerId`, `walletOnly`: cliente da carteira não abre pré-venda), mensagem depois do
   repasse (`apps/api/src/whatsapp/repasse.service.ts`), motivo de perda sem pós-venda, prazos no horário comercial com
   almoço, filtros novos na base de leads e resumo do vendedor semanal, quinzenal ou mensal.
17. **1.0.19** (28/10/2026, vindo do CRM da Usaparts 0.103.0): número de perguntas do Mercado Livre pendentes ao lado de
   "Perguntas pendentes" no menu (`/assistente/perguntas/pendentes/contagem`).
18. **1.0.20** (28/10/2026, vindo do CRM da Usaparts 0.103.1): resposta ao Mercado Livre só fica "enviada" quando a
   pergunta aparece respondida lá (consulta depois do envio); pergunta fechada no CRM e aberta no ML volta para as pendentes.
19. **1.0.21** (28/10/2026, vindo do CRM da Usaparts 0.104.0): pergunta respondida fora do CRM (integração de e-commerce ou
   direto no ML) marcada "Fora do CRM" com o texto (`assist_questions.externalAnswer`) e sempre aprendida na base, já ativa.
20. **1.0.22** (28/10/2026, vindo do CRM da Usaparts 0.104.1): venda adicional do Assistente ML reconhece modelo curto logo
   depois da marca (ex.: JCB 3C).
21. **1.0.23** (28/10/2026, vindo do CRM da Usaparts 1.0.0): pós-venda não abre mais sozinho (envio em massa pela
   lista de Pré-Vendas), fechar pré e pós-venda em massa (finaliza o chat; `service_records.closedAt`), mapa do Brasil
   no "Por estado", situação do cliente no resumo do dia do vendedor, enviar o contato do cliente ao vendedor e, em
   Instagram/Postagens: análise dos posts contra o normal do perfil, prévia do feed e conferência da legenda, roteiro
   de Reels com nota do gancho e plano da semana. Textos da IA de Postagens genéricos (sem o ramo da Usaparts).

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

1. **Publicar a 1.0.9 e a 1.0.10**: tag pela Action "Criar tag da versão", Action verde, `sudo bash deploy/deploy.sh` na VPS.
2. **Configurar a plataforma**: SMTP com o Gmail (senha de app) em Configurações; planos de verdade; Asaas (sandbox
   para testar, depois `ASAAS_ENV=producao`) com o webhook `https://crm.sgmulticonecta.com.br/api/webhooks/asaas` e o
   token do `.env`; contato em Plataforma → Site (se ainda não gravado).
3. Revisão independente da generalização (workflow de 25/10/2026) ainda em andamento quando a 1.0.4 foi fechada: o
   que ela apontar entra numa 1.0.5.
4. Empresas de demonstração (Rota Autopeças, Vitrine Moda, Smash Padel Wear): na VPS, `sudo bash deploy/demo.sh`
   (a partir da 1.0.7; marcadas com isDemo, fora da receita, da cobrança, das publicações e do WhatsApp).
5. O CRM da Usaparts (outro repositório) usa as mesmas bibliotecas: o CI dele deve acusar os mesmos alertas de
   segurança corrigidos aqui em `b401df3`.

## Credenciais e dados sensíveis

Nenhuma senha, token ou chave está neste repositório. Ficam no `/opt/saascrm/.env` da VPS (gerado pelo instalador).
O `APP_ENCRYPTION_KEY` e a chave privada de backup (`age`) devem estar guardados pelo Diego fora da VPS.
