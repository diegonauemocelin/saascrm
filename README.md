# sgmulticonecta CRM (SaaS)

CRM, atendimento por WhatsApp, automação de marketing e postagens, vendido por assinatura para várias empresas,
em português do Brasil. A sgmulticonecta controla tudo pelo painel da plataforma: empresas, planos, sistemas liberados
por plano, cobranças e domínios.

| | |
|---|---|
| Versão atual | ver [`releases.json`](releases.json) (também na tela **Atualizações** do sistema) |
| Painel da plataforma | https://crm.sgmulticonecta.com.br |
| Cadastro de empresas | https://crm.sgmulticonecta.com.br/cadastro |
| Implantação | [docs/DEPLOY.md](docs/DEPLOY.md) |
| Segurança | [docs/SEGURANCA.md](docs/SEGURANCA.md) |
| Como publicar versões | [docs/RELEASES.md](docs/RELEASES.md) |

## Como funciona

- **Empresa (tenant):** cada cliente tem os seus dados isolados e o seu endereço: `<empresa>.crm.sgmulticonecta.com.br` ou
  um domínio próprio (`crm.empresa.com.br`). O endereço acessado define a empresa.
- **Planos:** cada plano libera um conjunto de sistemas (cada módulo do CRM é um sistema), o número de usuários e de
  números de WhatsApp. Dá para liberar sistemas extras para uma empresa sem trocar o plano. Integração com e-commerce e
  ERP aparecem no menu como **sob consulta**.
- **Assinatura:** cadastro pelo site, com teste grátis (3 ou 7 dias, definido no plano) ou liberação após o pagamento da
  primeira mensalidade. Cobrança mensal pelo Asaas (Pix, boleto ou cartão); sem pagamento, o acesso é bloqueado.

## Arquitetura

```
Internet ─► Caddy da plataforma ou Nginx do servidor + certbot (HTTPS de cada endereço)
              │
   ┌──────────── docker compose "saascrm" ──────────────────┐
   │ web     Nginx sem root: frontend React + proxy /api     │
   │ api     NestJS 12 (Node 24), REST + OpenAPI, multiempresa│
   │ db      PostgreSQL 18 (rede interna, sem porta pública) │
   │ backup  pg_dump diário criptografado com age            │
   └────────────────────────────────────────────────────────┘
```

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 12, TypeScript 6, Prisma 7 (PostgreSQL), class-validator, Swagger |
| Frontend | React 19, Vite 8, Tailwind CSS 4, shadcn/ui (componentes + block `sidebar-07`), TanStack Query, React Router 8 |
| Segurança | Argon2id, TOTP (otplib), JWT HS256 em cookie HttpOnly, refresh token rotativo, CSRF double-submit, Helmet, rate limit |
| Cobrança | Asaas (assinatura mensal, webhook com token) |
| Infra | Docker Compose, Caddy (on-demand TLS) ou Nginx do servidor + certbot, backups com `age` |

Repositório em *npm workspaces*:

```
apps/api      API NestJS (src/, prisma/, test/; src/plataforma: empresas, planos e cobrança)
apps/web      Frontend React (src/pages, src/components, src/lib)
deploy/       Scripts da VPS: instalação, Caddy, deploy, rollback, backup, restauração, WhatsApp
scripts/      Verificação de versão, teste de fumaça, banco local de desenvolvimento
releases.json Fonte única da versão e do histórico exibido na tela Atualizações
```

## Desenvolvimento local

Pré-requisito: Node.js 24.

```bash
npm install
```

```bash
copy apps\api\.env.example apps\api\.env
```

Preencha `JWT_ACCESS_SECRET`, `APP_ENCRYPTION_KEY` e `SEED_ADMIN_EMAIL` no `apps/api/.env` (os comandos para gerar os segredos estão no próprio arquivo). Depois, em três terminais:

```bash
npm run dev:db
```

```bash
npm run db:migrate -w @crm/api && npm run db:seed -w @crm/api && npm run dev:api
```

```bash
npm run dev:web
```

Acesse http://localhost:5173 (a empresa dona da plataforma; para testar outras empresas, use `TENANT_SLUG`/`PLATFORM_DOMAIN` no `apps/api/.env`). O seed mostra a senha provisória do administrador no terminal. A documentação da API fica em http://localhost:3000/api/docs.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run typecheck` | Checagem de tipos da API e do frontend |
| `npm test` | Testes automatizados (permissões, bloqueio de login, 2FA, criptografia, auditoria, upload, SSRF) |
| `npm run build` | Build de produção |
| `npm run release:check` | Confere se a versão está igual em `releases.json` e nos `package.json` |
| `npm run smoke -- https://crm.sgmulticonecta.com.br` | Teste de fumaça das proteções em um ambiente no ar |

## Layouts

Cada usuário escolhe em **Meu perfil → Aparência** (o administrador define o padrão e pode travar a escolha em **Configurações → Aparência**):

- **Moderno:** menu lateral recolhível do shadcn/ui (block `sidebar-07`), breadcrumb e busca global (Ctrl+K).
- **Clássico:** menu superior com listas suspensas por área, no estilo do RD Station, com tabelas mais compactas.

As telas são as mesmas nos dois; só muda a moldura, então nenhum recurso fica de fora de um dos layouts.
