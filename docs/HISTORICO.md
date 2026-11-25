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
| Marca | Manual da Marca SG Multiconecta v1.0 (13/11/2026, versão 1.0.110): símbolo de 3 figuras a 120°, Plus Jakarta Sans, Violeta `#5B3FD6`, Azul `#1B9FE8`, Âmbar `#FFC220`, Tinta `#0F1222`, Lilás `#9485FF`, Névoa `#F4F3FB`, assinatura "CRM e atendimento em um só sistema". Pacote em `docs/marca` (ver docs/SITE.md) |
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
22. **1.0.24** (28/10/2026, vindo do CRM da Usaparts 1.0.1): comparativo do mês no Dashboard executivo (mês anterior x
   atual, acumulado por dia, projeção pelo ritmo, por canal ou total; `/marketing/comparativo`), áudio do chat em 1x,
   1,5x e 2x e marcar conversa como não lida.
23. **1.0.25** (28/10/2026, vindo do CRM da Usaparts 1.0.2): mensagem do repasse ao vendedor sai na hora (padrão 0 min;
   a migração zera o tempo de quem já tinha configurado) e pergunta nova "O vendedor já entrou em contato?" 30 min depois
   do repasse (`contactCheck` nas configurações de atendimento, campos `contactCheckAt/Status`), desligada por padrão.
24. **1.0.26** (29/10/2026, vindo do CRM da Usaparts 1.0.3): chamar o cliente de novo depois que a pré-venda fecha
   (`reactivation` nas configurações de atendimento, `ReativacaoService`): até 3 mensagens sem venda e 3 de recompra, por
   um número fixo, contadas de `resultAt`; para quando o cliente responde ou abre pré-venda nova. Textos padrão genéricos.
25. **1.0.37** (04/11/2026, vindo do CRM da Usaparts 2.0.x): módulo de **fretes** (`apps/api/src/fretes`, models
   `Freight*`, migrações `20261104150000/150100/150200`), liberado pelo sistema `fretes` do plano (`sistemas.ts`):
   cotação, tabelas versionadas com importação da planilha da transportadora, taxas TDA/TDE/TDC/TVD por destinatário,
   pedidos e expedição, CT-e, conciliação, faturas, relatórios, alertas e painel, por filial (`units.cnpj/zip/address`,
   `users.extraUnitIds`). Ficou de fora o que era só da Usaparts: o botão que cadastrava as lojas dela e o ICMS padrão
   tirado de um CT-e dela (a empresa cadastra as UFs ou o CRM aprende pelos CT-es). Perfis prontos de fretes pelo botão
   em Fretes › Filiais (só o Administrador).
26. **1.0.42** (04/11/2026, vindo do CRM da Usaparts 2.0.13): captura de **CT-e na SEFAZ** (Distribuição DF-e,
   `fretes/sefaz.ts`, `sefaz.service.ts`, models `FreightSefazConfig`/`FreightSefazRun`, migração `20261105100000`):
   certificado A1 da matriz (unidade principal da empresa) e senha criptografados, consulta por último NSU com o CNPJ
   dela (vale para as filiais), busca automática a cada 4/8/12/24 h ou "Buscar agora", CT-es dos últimos 1 a 7 dias,
   pausa de 1 hora depois de 137/656. Por empresa (tenantId), sem rota pública. Não testado contra a SEFAZ real.
27. **1.0.87** (11/11/2026, vindo do CRM da Usaparts 3.0.2): Marketplaces › **Preços e promoções** e
   **Planejamento** do Mercado Livre (`marketplaces/precos`, `marketplaces/planejamento`, migrações
   `20261111100000`/`20261111140000`), módulos `marketplace_precos` e `marketplace_planejamento` no sistema
   `marketplaces` (`sistemas.ts`). Tudo por tenantId; a leitura de pedidos (a cada 6 h) e os envios agendados de preço
   só rodam para a empresa com o módulo no plano e o acesso liberado (`moduleActive`). Imposto aprendido das NF-e do
   Mercado Envios importadas em Fretes; IA pela chave Gemini da própria empresa.

28. **Branch `trier-ml`** (11/11/2026, sem versão ainda): integração com a **Trier** (ERP de farmácias, SGF) e
   **Publicar do ERP** no Mercado Livre (`apps/api/src/trier`, `apps/api/src/marketplaces/publicar`, migração
   `20261111150000_trier_ml`, tabelas `trier_products` e `ml_publications`), módulos `erp_trier` (sistema `erp`) e
   `marketplace_publicar` (sistema `marketplaces`). O CRM chama o servidor da farmácia (token criptografado, proteção
   SSRF); IP privado só pelo "Acesso pela VPN" liberado pela plataforma (IP:porta exatos, `docs/TRIER-VPN.md`).
   Decisão do Diego: a farmácia só anuncia higiene, perfumaria e correlatos; medicamento é sempre bloqueado e só
   aparece para publicar o que a empresa marcar (departamento/grupo/categoria da Trier). Falta homologar com um token
   real da Trier e uma conta do Mercado Livre.

29. **1.0.131** (15/11/2026, só no SaaS): integrações com os ERPs **Bling** (API v3, OAuth), **Tiny** (API v3, OAuth),
   **Omie**, **CIGAM** (Integrador, no servidor do cliente) e **Linx** (farmácias e indústria de moda: tela pronta, a
   leitura depende da documentação que a Linx entrega ao cliente). No padrão da Trier: só leitura, cópia completa a
   cada N horas, produtos em `erp_products` (`apps/api/src/erps`, adaptadores em `erps/provedores`), tela única
   `/erp/:erp`. Decisão do Diego: **cada integração com ERP é liberada pela plataforma para a empresa que usa aquele
   ERP** (Plataforma › Empresas › "Integrações com ERP liberadas", campo `tenants.erpIntegrations`, inclusive Tcar e
   Trier); as não liberadas não aparecem para a empresa (nem como sob consulta). Quem já tinha o sistema `erp` ficou
   com Tcar e Trier liberadas (migração `20261115120000_integracoes_erps`). Site: faixa "ERPs integrados". Falta
   homologar Bling, Tiny, Omie e CIGAM com contas reais.

30. **1.0.135** (16/11/2026, só no SaaS): integrações com loja virtual **Tray**, **Nuvemshop** e **Loja Integrada**
   (`apps/api/src/lojas`, adaptadores em `lojas/provedores`, tela `/loja/:loja`), no padrão da Magazord: clientes →
   leads (origem Ecommerce), pedidos pagos → venda no lead, carrinhos → Carrinhos abandonados (link de recuperação só na
   Nuvemshop), produtos → Catálogo. Ids externos com prefixo da plataforma (`tray:123`). Liberadas por empresa pela
   plataforma (`tenants.ecomIntegrations`, migração `20261116010000_integracoes_lojas`); liberar uma loja libera também
   Catálogo e Carrinhos. Tray e Nuvemshop usam o **aplicativo da SG** (chaves guardadas na empresa da plataforma,
   quadro "Aplicativo da SG" na tela da loja); retorno do OAuth no painel da plataforma, empresa pelo "state"
   criptografado. Falta: cadastrar o app da SG na Nuvemshop (portal de parceiros) e pedir à Tray (Parcerias); Loja
   Integrada pode exigir o IP da VPS liberado. Jet descartada; Olist e Linx Commerce ficam para depois.
31. **1.0.137** (16/11/2026, da v3.0.42 da Usaparts): **Busca de leads** (`apps/api/src/prospeccao`, tela
   Atendimento Comercial › Busca de leads, permissão `prospeccao` no sistema Atendimento). A IA (Claude com pesquisa na
   web, ou Gemini no plano gratuito, escolhido na Configuração da tela) procura empresas por cidade/CEP, raio, segmento e
   palavras; o CRM completa com OpenStreetMap, cadastro público do CNPJ (sem sócios) e confere e-mail (MX) e WhatsApp.
   Tira quem já é lead ou está em "não contatar". Chaves: Claude da Análise das perdas (IA), Gemini do Assistente ML/e-mail.
32. **1.0.138** (16/11/2026, da v3.0.43 da Usaparts): busca de leads chama no WhatsApp e envia em fila
   (`prospeccao/envio.service.ts`: intervalo aleatório 2–10 min, limite por dia, horário comercial, SAIR vira "não
   contatar"; tabelas `prospect_campaigns`/`prospect_sends`); respostas rápidas com até 3 arquivos (`files` JSON);
   marca "Encaminhada" no encaminhar; notificações do celular voltam (consulta inválida em `push.service.ts`).
33. **1.0.139** (16/11/2026, da v3.0.44 da Usaparts): aviso "Novidades do sistema" uma vez por usuário depois de cada
   versão (`users.seenVersion`, `GET /system/novidades`, `POST /system/novidades/visto`, `layout/whats-new.tsx`).
34. **1.0.140** (17/11/2026, da v3.0.45 da Usaparts): Shopee, Amazon e TikTok Shop prontos para conectar
   (`marketplaces/canais`, adaptadores pela API oficial; tabelas `channel_listings`/`channel_price_changes`; módulos
   `mkt_shopee`/`mkt_amazon`/`mkt_tiktok` no sistema Marketplaces; retorno da autorização no endereço da empresa).
   Menu com submenus (`NavItem.section`). Cada empresa cria o próprio aplicativo de desenvolvedor em cada plataforma.
35. **1.0.141** (17/11/2026, da v3.0.46 da Usaparts): busca de leads com mensagem única por empresa (Gemini gratuito,
   `POST /prospeccao/buscas/:id/mensagens-unicas`, texto guardado em `prospect_sends.text`); site com Shopee, Amazon e
   TikTok Shop (logos Simple Icons, como Meta e TikTok) e Busca de leads nos recursos.
36. **1.0.142** (17/11/2026, da v3.0.47 da Usaparts): eventos CONTACTS_UPSERT/UPDATE da Evolution dão nome às
   conversas sem nome e ficam na tabela `whatsapp_wa_contacts` (no CRM, não na Evolution: decisão de LGPD), que a
   importação "Contatos do WhatsApp" da Agenda também lê.
37. **1.0.143** (17/11/2026, da v3.0.48 da Usaparts): Face ID/digital (passkey, tabela `passkeys`) com rpID e origem
   pelo endereço acessado (`relyingParty` + `requireFromHost`; a chave só abre a empresa dela e só vale no endereço em
   que foi criada); resposta sugerida e transcrição automática de áudios com o Gemini da empresa; Monitoramento
   (`/administracao/monitoramento`, só `role.isSystem`): servidor, banco, backup e gráficos só na empresa da plataforma
   (`isPlatform`), as demais veem números de WhatsApp e atividades; compose monta os backups só leitura na API
   (`BACKUP_DIR_API`); filtro de promoção em Preços; concorrentes pelas referências do ERP e vínculo manual.
38. **1.0.144** (17/11/2026, da v3.0.50 da Usaparts): a verificação do `crm-push-sw.js` (Web Push) se identifica como
   navegador; firewalls de loja (Magazord) recusavam com 403 só a conferência.
39. **1.0.145** (17/11/2026, das v3.0.51 a 3.0.53 da Usaparts): app de Chat do computador (`/chat-app`, manifesto
   `/api/app/manifest-chat.webmanifest` pela empresa do endereço, PWA própria `id: /chat-app`); filial pelo DDD
   (`whatsapp_filiais_ddd`, sem regras iniciais no SaaS); Web Push aceita FCM `jmtNN.google.com` e refaz a inscrição
   cancelada por outro sistema (ex.: Webpushr); filtro de número do chat ao sair do Monitoramento.
40. **1.0.146** (17/11/2026, da v3.0.54 da Usaparts): app instalado aberto no computador (`isDesktopApp`) vai para
   `/chat-app`; `?completo=1` abre o CRM inteiro (só pula os redirecionamentos; assinatura bloqueada continua valendo).
41. **1.0.147** (17/11/2026, da v3.0.55 da Usaparts): pesquisa do app de Chat traz contatos (`/chat/contatos-para-compartilhar`)
   e conversa nova pega o nome da agenda (`whatsappContact` do número ou geral).
42. **1.0.148** (17/11/2026, só do SaaS): Plataforma › Painel (`GET /plataforma/painel`, `plataforma/painel.ts`: recebido por
   mês pelos `tenant_payments` RECEBIDA/CONFIRMADA, novas e canceladas por mês, atrasadas pelas VENCIDA; empresas demo e
   a dona ficam fora) e primeiros passos (`/primeiros-passos`, só `role.isSystem` de empresa cliente; dispensar fica na
   configuração `primeiros_passos`).
43. **1.0.149** (18/11/2026, da v3.0.56 da Usaparts): no app instalado no computador, `/chat?conversa=` vira `/chat-app?conversa=`;
   `associatedChildMessage` (álbum), `groupMentionedMessage`, `botInvokeMessage` e `lottieStickerMessage` são embalagens;
   `ptvMessage` é vídeo; vídeo com Baixar vídeo.
44. **1.0.150** (18/11/2026, da v3.0.57 da Usaparts): regras do destino na cotação em três buscas (CEP, UF, cidade) em vez
   de um OR que lia `freight_rules` inteira; índices `(versionId, cityKey)` e `(cityKey, uf)`; etapas da cotação com tempo
   no log e limite (`step`).
45. **1.0.151** (18/11/2026, da v3.0.58 da Usaparts): campanhas de frete `PERCENT_NF_ACIMA` (`tableAbove`: até o valor vale a
   tabela) e `REPASSE` (% da nota sem limite pela tabela, desconto zero); cotação mostra a diferença paga pela empresa.
46. **1.0.152** (18/11/2026, da v3.0.59 da Usaparts): validação de e-mail dos leads (`email/validar.ts`, `EmailValidationService`,
   campos `emailCheckedFor`/`emailInvalidAt`/`emailInvalidReason`; inválido fora do e-mail marketing); CT-e filtro `tipo`
   VENDA/COMPRA por `companyRoles` (migração preenche os antigos); NF-e guarda o vendedor (`seller`, do infCpl) e a
   conciliação mostra vendedor e frete da nota.
47. **1.0.153** (18/11/2026, da v3.0.60 da Usaparts): importação de NF-e aceita até 10.000 XMLs e 300 MB por vez
   (`NFE_IMPORT_LIMITS` em `fretes/nfe.ts`).
48. **1.0.154** (19/11/2026, da v3.0.61 da Usaparts): WhatsApp parava de receber (Evolution 2.3.7 / Baileys rc.9 não
   confirmava os avisos de Status; evolution-api#2778): `deploy/evolution/baileys-status.cjs` corrige o Baileys ao subir
   o contêiner (entrypoint no `docker-compose.yml`); `whatsapp.sh status` mostra se está aplicada. Vendedor da NF-e em
   Pedidos e expedição.
49. **1.0.155** (19/11/2026, da v3.0.62 da Usaparts): tela Conferência de frete (`fretes/conferencia.ts`, rotas
   `GET/PATCH fretes/conferencia`, migração `20261119120000_conferencia_frete` com `auditStatus`/`auditCause`/`auditNote`
   em `freight_shipments`); Pedidos com filtro de vendedor, `NOTA_MENOR_ESPERADO` e valor da tabela (`tableExpected`).
50. **1.0.156** (19/11/2026, da v3.0.63 da Usaparts): poupança de frete dos vendedores (`fretes/poupanca.ts`, tabela
   `freight_wallet_moves`, campanhas em `fretes_poupanca_campanhas`); painel gerencial (`fretes/gerencial.ts`, `GET
   fretes/gerencial`); resumo semanal de fretes por e-mail (`resumo-semanal.service.ts`); cotação com produto pelo SKU
   (`produto-sku.ts`) e caixas (`caixas.ts`); Conferência com filtro CIF/FOB; chat "Conversas da equipe".
51. **1.0.157** (20/11/2026, da v3.0.64 da Usaparts): poupança de frete = nota − (cotação + acréscimo), sem o CT-e
   (`walletEntry`); Mapa de vendas usa o DDD do telefone sem estado no cadastro (`MapRow.phoneUf`, `byPhone`).
52. **1.0.158** (20/11/2026, da v3.0.65 da Usaparts): Prisma 7.10.1 e override `effect` ^3.22.5 (alerta alto do
   `npm audit` no @prisma/config). node-forge 1.4.2 (moderado) segue: a 1.4.3 quebrou o `npm ci`.
53. **1.0.159** (20/11/2026): redes sociais pelo app da PLATAFORMA (modelo mLabs): as empresas só fazem o login.
   Apps cadastrados uma vez no painel (Postagens › Contas): Instagram (`postagens_ig_app`), Facebook (`postagens_fb_app`),
   Google/YouTube (`postagens_yt_app`) e TikTok (`postagens_tt_app`). Retorno único no painel (`/instagram/retorno`,
   `/facebook/retorno`, `/youtube/retorno`, `/tiktok/retorno`), que manda a pessoa ao endereço da empresa pelo state
   `<tenantId>.<código>` (rotas públicas `GET /api/public/postagens/<rede>/destino`). Código: `postagens/facebook-login.ts`,
   `youtube.ts`, `tiktok.ts`. Aparelho confiável no app instalado (da v3.0.66 da Usaparts, tabela `trusted_devices`).
   **Pendente (fora do código):** verificação da empresa e análise das permissões na Meta; verificação do app no Google
   (escopo youtube.upload); auditoria do app no TikTok (sem ela, os vídeos saem só como privados).
54. **1.0.160** (23/11/2026, da v3.0.67 da Usaparts): agendamento de coletas (`freight_pickup_schedules`, carrier
   `pickupBySchedule`, módulo `fretes_coletas` no sistema Fretes, perfil "Expedição (coletas)"), painel da TV com avisos
   falados; mensagem de ausência por número (`away.numberIds`); vídeo recebido como documento toca no chat; app do
   celular com grupos em Tudo (`juntos`).
55. **1.0.161** (23/11/2026, da v3.0.68 da Usaparts): Jadlog com `Authorization: Bearer <token>` (`jadlogAuth`);
   Pedidos mostram a última NF-e e a última importação de XML (`lastNfe`, `lastImport`).
56. **1.0.162** (23/11/2026, da v3.0.69 da Usaparts): cotação online de transportadoras do sistema SSW (`sswQuoteEnvelope`
   e `parseSswQuote` em `fretes/integracoes.ts`, SOAP sswCotacao.cotar; nome e domínio configuráveis, padrão genérico);
   resultado da cotação em cartões (troca para tabela, lembrada no navegador) e formulário em 3 passos; aviso de SEFAZ
   fora/instável/atrasada (`sefazHealth`, `GET fretes/sefaz/situacao`, alerta em fretes); campanha de frete
   ACRESCIMO (reajuste: tabela + %, promoção ganha); poupança com % por vendedor (`sellerPcts`, `pctFor`).
57. **1.0.163** (23/11/2026, da v3.0.70 da Usaparts): rastreamento pela chave da NF-e no SSW (`fretes/rastreio.ts`,
   `RastreioService`: na tela do pedido e a cada 30 min nos pedidos em aberto; marca entregue; colunas `trackingAt`,
   `trackingLast`, `trackingCarrier`); Análise de mercado fora dos marketplaces (`src/mercado`, tabela
   `market_analyses`, módulo `mi_mercado` no sistema Marketing Inteligente; IA Gemini ou Claude com pesquisa na web,
   só totais do CRM; também no menu de Fretes).
58. **1.0.164** (24/11/2026, da v3.0.71 da Usaparts): transportadora nova cadastrada sozinha pelo CT-e
   (`autoCarrierFromCte`, `CteService.autoCarrier`/`backfillCarriers`, colunas `quote`, `pickup`, `autoCreated`; entra
   com cotação, coleta e conciliação desligadas); histórico do WhatsApp liga o @lid à conversa do telefone pelas
   mensagens já gravadas (`lidOwners`, `resolveHistoryLids`) e botão "Juntar com a conversa certa"
   (`conversas/:id/juntar`).
59. **1.0.165** (24/11/2026, da v3.0.72 da Usaparts): cotação com frete + reajuste (`mode` na campanha) + % do vendedor
   (`ChargeHint`), poupança com base frete + reajuste (`surchargeBase`) e só com cotação/tabela (sem CT-e de base);
   lote em tabelas (`tabelas/situacao`, `tabelas/excluir`), transportadoras (`transportadoras/situacao`) e cotações
   (`cotacoes/cancelar`); campanhas em resumo com `MultiSelect`; CPF/CNPJ define PF/PJ; Web Push com envio de teste
   (`webpush/teste`, `pushError`, `pushBrowser`) e motivo das falhas no envio.
60. **1.0.166** (24/11/2026, da v3.0.73 da Usaparts): descadastro (`setEmailConsent` false) chama `leaveAllSends`:
   fluxos ATIVO viram SAIU e destinatários PENDENTE saem da fila; `enroll` ignora quem tem `emailOptOutAt`;
   `advance` tira do fluxo quem já tinha descadastrado; relatório mostra "Fora do envio".
61. **1.0.167** (24/11/2026, da v3.0.74 da Usaparts + trabalho só do SaaS): Web Push "Limpar inscritos que não
   funcionam" (`webpush/limpar-inscritos`, `cleanSubscribers`, pula Safari com `isApplePush`); nomes Multi dos 11
   sistemas em 3 pilares (`plataforma/sistemas.ts`, `web/src/lib/sistemas.ts`); padrão Por sistema + telas novas
   (`DEFAULT_BRANDING`, migração `20261125010000_padrao_por_sistema` muda só quem estava em MODERN/ATUAL); empresas de
   demonstração Prime Construtora (`scripts/demo-construcao.ts`, slug `prime`, tudo menos fretes) e Pulso Sports
   (`scripts/demo-fretes.ts`, slug `pulso`, só fretes), criadas por `deploy/demo.sh`; relógio da demo
   (`demo-relogio.ts`/`DemoRelogioService`: move as datas das empresas `isDemo` pelos dias passados, de hora em hora;
   não move `users.passwordChangedAt`/`lockedUntil`; tabelas com índice único em data andam em duas etapas); site com
   a frase nova, pilares, tour em vídeo (`apps/site/video/tour-*.mp4`) e Open Graph (`img/compartilhar.jpg`).
62. **1.0.168** (25/11/2026, da v3.0.75 da Usaparts): Preços e promoções com filtro pelos avisos (`alerta` na lista,
   `TIP_FILTERS`/`matchTip` em `precos/margem.ts`) e ordens `lucro`, `lucro_desc`, `lucro_falta`, `preco_asc`;
   Monitoramento distingue pasta de backups sem permissão (`denied`) e o `deploy.sh` deixa a pasta em 755 (o
   `instalar.sh` já cria assim).
63. **1.0.169** (25/11/2026, da v3.0.76 da Usaparts): `deploy/backup/backup.sh` guarda só as `BACKUP_KEEP_UPLOADS`
   (padrão 3, mínimo 2) cópias mais recentes de `crm-uploads-*` (na Usaparts, 30 cópias de 9 GB encheram o disco).
64. **1.0.170** (25/11/2026, da v3.0.77 da Usaparts): app de coletas (`/app/coletas`, `components/fretes/coletas-hoje.tsx`;
   `POST fretes/coletas/chegou` marca coleta de horário fixo como `period FIXA` + `slot`; `arrivedAt`, `collectedAt`,
   `volumes`, `invoices`; `pickupCountsRequired` na transportadora; `ColetasAvisoService` manda push 15 min antes do corte e
   da coleta); CT-e com `senderName` (preenchido dos XMLs antigos no boot), filtros `uf`/busca por documento, contadores pelos
   filtros, lista em cartões e DACTE (`/fretes/ctes/:id/dacte`, `lib/code128.ts`); cotação com `mapLimit` (6 tabelas) e 20 s
   por tabela (`fretes/limite.ts`); tipo de mercadoria em lote (`tabelas/mercadoria`); caixas sem peso máximo; Rodonaves
   (`rodonavesHint`, `rodonavesQuoteObject`); importação sugere Região e Cidade juntas; custo de publicidade do ML Ads por
   anúncio (`marketplace_ad_items`, `syncItemAds`, `adCostOf`, `adCostPass`/`adCostDays`); Web Push com `swConfirmed`.
65. **1.0.171** (25/11/2026, da v3.0.78 da Usaparts): Diagnóstico das tabelas de frete (`/fretes/diagnostico`,
   `GET fretes/ctes/diagnostico?dias=`, função pura `fretes/diagnostico.ts`): agrupa por transportadora os padrões dos CT-es
   conciliados (ICMS por dentro/a mais, alíquota, taxa com outro nome ou fora da tabela, componente acima/abaixo, peso,
   destinos sem regra, tabela vencida) e separa "Ajustar no CRM" de "Pedir à transportadora".

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
