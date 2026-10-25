# Implantação da plataforma (VPS dedicada)

A plataforma roda inteira em containers (`saascrm`) numa VPS **só dela**. O Caddy fica na frente, nas portas 80 e 443, e
emite sozinho o certificado HTTPS de cada endereço no primeiro acesso:

- `crm.sgmulticonecta.com.br`: painel da plataforma (empresas, planos, cobranças);
- `crm.sgmulticonecta.com.br/cadastro`: cadastro de empresas novas;
- `<empresa>.crm.sgmulticonecta.com.br`: o CRM de cada empresa;
- domínio próprio da empresa (ex.: `crm.empresa.com.br`): cadastrado no painel da plataforma.

### Dois jeitos de instalar (o instalador escolhe sozinho)

| VPS | HTTPS | O que muda no servidor |
|---|---|---|
| **Só da plataforma** (portas 80/443 livres) | Caddy da plataforma, certificado no primeiro acesso | Nada fora dos containers |
| **Com outro sistema** e o **Nginx do servidor** nas portas 80/443 | Nginx do servidor + certbot | Um arquivo só da plataforma no Nginx (`saascrm`), o certbot e um cron |

- **Caddy:** só emite certificado para endereços que a API confirma (`/api/public/dominio-permitido`): subdomínios de
  empresas cadastradas e domínios próprios.
- **Nginx do servidor:** o `deploy/certificados.sh` roda a cada 5 minutos (`/etc/cron.d/saascrm-certificados`), pega na
  API os endereços da plataforma, emite os certificados que faltam e refaz o arquivo da plataforma no Nginx. Antes de
  recarregar, confere com `nginx -t`; com erro, volta o arquivo anterior. Os outros sites do servidor não são tocados.
  Empresa nova ou domínio próprio conferido ganha HTTPS em até 5 minutos. Ver a situação:
  `sudo bash deploy/certificados.sh --status` (registro em `/var/log/saascrm-certificados.log`).
- **Portas 80/443 com um container de outro sistema:** o instalador para sem alterar nada e mostra qual é o container;
  nesse caso a plataforma precisa entrar pelo servidor web dele (análise caso a caso).

A plataforma usa uma porta interna (`127.0.0.1:8180`, ou a próxima livre), sem acesso de fora.

**Memória:** a VPS não compila nada. A cada versão publicada, o GitHub Actions constrói as imagens e publica em
`ghcr.io/diegonauemocelin/saascrm-*`; o deploy só as baixa. Recomendado: 4 GB de RAM (8 GB com WhatsApp para muitas empresas).

## 1. DNS (antes de instalar)

No DNS de `sgmulticonecta.com.br`, aponte para o IP da VPS onde a plataforma vai ser instalada:

| Tipo | Nome | Valor |
|---|---|---|
| A | `crm` (crm.sgmulticonecta.com.br) | IP da VPS |
| A | `*.crm` (*.crm.sgmulticonecta.com.br) | IP da VPS |

O curinga (`*.crm`) cobre o endereço de todas as empresas, sem criar registro por empresa. O site `sgmulticonecta.com.br`
continua onde está, sem mudança.

## 2. Pré-requisitos na VPS

- Ubuntu 24.04 ou Debian 12, com as portas 80 e 443 liberadas no firewall do provedor (numa VPS com outro sistema, já
  estão). Memória livre: 1,5 GB para a plataforma (mais com WhatsApp).
- Docker e Compose v2:

  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  ```

- Git:

  ```bash
  sudo apt-get install -y git
  ```

## 3. Chave de backup (no SEU computador, não na VPS)

Os backups são criptografados com uma chave pública; a privada fica só com você. Instale o `age`
(https://github.com/FiloSottile/age/releases) e rode:

```bash
age-keygen -o chave-backup-saascrm.txt
```

O comando mostra `Public key: age1...`: é ela que vai para a VPS. Guarde o arquivo em local seguro e com cópia.
**Sem ele, os backups não podem ser restaurados.**

## 4. Baixar o código na VPS

Repositório privado: crie uma *deploy key* somente leitura (GitHub → repositório → Settings → Deploy keys).

```bash
sudo git clone git@github.com:diegonauemocelin/saascrm.git /opt/saascrm
```

## 5. Instalar

```bash
cd /opt/saascrm && sudo BACKUP_AGE_RECIPIENT="age1...sua-chave-publica" bash deploy/instalar.sh crm.sgmulticonecta.com.br seu-email@sgmulticonecta.com.br "Seu Nome"
```

O script confere o DNS e quem usa as portas 80/443 (e escolhe o jeito do HTTPS), cria o `.env` com segredos aleatórios,
sobe os containers e cria a empresa dona da plataforma com o primeiro administrador (a senha provisória aparece uma
única vez no terminal). Na VPS com o Nginx do servidor, ele também instala o certbot (se faltar), emite os certificados
e agenda o `deploy/certificados.sh`.

> **Guarde o `APP_ENCRYPTION_KEY`** do `/opt/saascrm/.env` junto da chave de backup. Sem ele, o 2FA e as senhas guardadas
> (SMTP, integrações) não podem ser lidos numa restauração em outro servidor.

Depois, confira:

```bash
node scripts/teste-fumaca.mjs https://crm.sgmulticonecta.com.br
```

## 6. Cobrança (Asaas)

1. Crie a conta no Asaas. Para testar, use antes o sandbox (https://sandbox.asaas.com).
2. Em **Integrações → Chaves de API**, gere a chave e coloque no `.env`:

   ```bash
   ASAAS_API_KEY=...
   ASAAS_ENV=sandbox      # troque para producao quando for cobrar de verdade
   ```

3. Em **Integrações → Webhooks**, cadastre:
   - URL: `https://crm.sgmulticonecta.com.br/api/webhooks/asaas`
   - Token de autenticação: o `ASAAS_WEBHOOK_TOKEN` do `.env`
   - Eventos: cobranças (criada, confirmada, recebida, vencida, estornada, removida).
4. Aplique: `sudo bash deploy/deploy.sh`.

Funcionamento:

- **Cadastro com teste grátis:** a empresa usa na hora, pelos dias de teste do plano. A assinatura no Asaas começa a cobrar
  no fim do teste.
- **Cadastro sem teste:** o acesso libera quando o Asaas confirmar o pagamento da primeira mensalidade.
- **Atraso:** depois do vencimento há 5 dias de tolerância com aviso; depois disso o acesso é bloqueado até o pagamento.
  O administrador da empresa vê o botão para pagar na própria tela de bloqueio.

## 7. Domínio próprio de uma empresa

1. No painel da plataforma (Empresas → a empresa → Domínios), cadastre o endereço (ex.: `crm.empresa.com.br`).
2. A empresa cria no DNS dela um **CNAME** de `crm.empresa.com.br` para `<empresa>.crm.sgmulticonecta.com.br`
   (ou um registro A para o IP da VPS).
3. Clique em **Verificar**. Verificado, o primeiro acesso emite o certificado e os links dos e-mails passam a usar esse
   endereço.

## Site de apresentação (sgmulticonecta.com.br)

1. No DNS, registros **A** `@` e `www` → IP da VPS (somente DNS).
2. No `/opt/saascrm/.env`, acrescente `SITE_DOMAIN=sgmulticonecta.com.br` e rode `sudo bash deploy/deploy.sh`.
3. Em até 5 minutos o certificado sai (Nginx do servidor) ou no primeiro acesso (Caddy).
4. No painel da plataforma, **Plataforma → Site**: WhatsApp, e-mail e Instagram do contato comercial.

Detalhes e como refazer os vídeos: [docs/SITE.md](SITE.md).

## 8. Atualizar para uma nova versão

```bash
cd /opt/saascrm && sudo bash deploy/deploy.sh
```

Sem argumento, instala a última versão publicada (tag `vX.Y.Z`). Para uma versão específica: `sudo bash deploy/deploy.sh v1.0.0`.
O deploy faz backup, baixa as imagens, aplica as migrations, sobe e confere a saúde **na versão esperada**. Se algo falhar,
volta sozinho para a versão anterior.

## 9. Rollback manual

```bash
sudo bash deploy/rollback.sh
```

Volta para a versão instalada antes da atual (ou informe a versão). O rollback **não desfaz migrations**: se a versão nova
mudou o banco de forma incompatível, restaure o backup feito antes do deploy (passo 11).

## 10. Backup

- **Automático:** todo dia às 3h (`BACKUP_HOUR`), com retenção de 30 dias, em `/opt/saascrm/backups`. Banco (todas as
  empresas) e arquivos enviados, criptografados e com checksum.
- **Imediato:** `sudo bash deploy/backup-agora.sh`
- **Cópia externa (recomendado):** copie a pasta `backups/` para fora da VPS. Os arquivos já estão criptografados.

## 11. Restauração

Teste, sem afetar produção (restaura num banco temporário, confere e apaga):

```bash
sudo bash deploy/restaurar.sh --teste backups/crm-db-AAAAMMDD-HHMMSS.dump.age /root/chave-backup-saascrm.txt
```

Restauração real (pede a confirmação `RESTAURAR` e faz backup do estado atual antes):

```bash
sudo bash deploy/restaurar.sh backups/crm-db-AAAAMMDD-HHMMSS.dump.age /root/chave-backup-saascrm.txt
```

Copie a chave privada para a VPS só nesse momento e apague em seguida: `sudo shred -u /root/chave-backup-saascrm.txt`.

## 12. Operação do dia a dia

| Tarefa | Comando (em `/opt/saascrm`) |
|---|---|
| Ver status | `sudo docker compose ps` |
| Ver logs da API | `sudo docker compose logs -f --tail=100 api` |
| Ver os certificados | Caddy: `sudo docker compose logs -f --tail=100 caddy` · Nginx: `sudo bash deploy/certificados.sh --status` |
| Reiniciar | `sudo docker compose restart` |
| Histórico de deploys | `cat .deploy/historico.log` |

## Firewall

Abertas para fora: só 80 e 443 (Caddy ou o Nginx do servidor) e a porta do SSH. O banco, a API e o WhatsApp não têm porta
publicada; o frontend publica só em `127.0.0.1` (porta `CRM_HTTP_PORT` do `.env`).

## WhatsApp (Evolution API)

Desligado até ser ativado. A Evolution API e o Redis sobem só com `COMPOSE_PROFILES=whatsapp` no `.env`, sem porta
publicada. O limite de números de cada empresa vem do plano dela.

```bash
sudo bash deploy/whatsapp.sh status
sudo bash deploy/whatsapp.sh ativar        # gera as chaves no .env, cria o banco "evolution" e sobe tudo
sudo bash deploy/whatsapp.sh reiniciar
sudo bash deploy/whatsapp.sh atualizacao-automatica ligar
sudo bash deploy/whatsapp.sh atualizar
sudo bash deploy/whatsapp.sh desativar
```

- **Limites do servidor:** `WHATSAPP_MAX_NUMBERS` e `WHATSAPP_MAX_CONNECTED` (somando todas as empresas). Ajuste conforme a
  memória: cada número conectado usa por volta de 100-150 MB. `sudo bash deploy/whatsapp.sh limite 20`.
- **Chaves:** `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET` ficam só no `.env`.

## Remover completamente

```bash
cd /opt/saascrm && sudo docker compose down
```

Com o Nginx do servidor, retire também o arquivo e o cron da plataforma:

```bash
sudo rm -f /etc/cron.d/saascrm-certificados /etc/nginx/sites-enabled/saascrm /etc/nginx/sites-available/saascrm /etc/nginx/conf.d/saascrm.conf && sudo nginx -t && sudo systemctl reload nginx
```

Os dados ficam nos volumes `saascrm_pgdata`, `saascrm_uploads` e `saascrm_caddy-data` até serem removidos com
`docker volume rm`.
