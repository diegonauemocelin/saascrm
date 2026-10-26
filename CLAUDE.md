# SG Multiconecta CRM (SaaS) — instruções para o Claude

Plataforma SaaS da **SG Multiconecta** (dono: Diego Naue Mocelin): CRM, WhatsApp com vários atendentes, marketing,
postagens com IA, vendido por assinatura para várias empresas. **Não é o CRM da Usaparts**: nasceu de uma cópia dele
(repositório `diegonauemocelin/crm`, versão 0.97.0) e agora segue separado, com a marca SG Multiconecta.

Antes de qualquer trabalho, leia [docs/HISTORICO.md](docs/HISTORICO.md): decisões já tomadas, como está a VPS e o que
está pendente.

## Como trabalhar com o Diego

- Português do Brasil, direto. Ele usa **Windows/PowerShell** no PC (sem `&&`: um comando por linha) e acessa a VPS
  por SSH como root.
- **Nada vai para o GitHub sem a permissão dele.** Antes de enviar, diga o que vai subir e espere o "pode".
- Mudanças grandes (que mudam o produto ou a instalação): proponha antes de fazer.
- Nunca invente preço, prazo ou dado comercial em textos do site ou do sistema.
- O ambiente do Claude não consegue enviar **tags** pelo Git. Depois do push da versão (com permissão), crie a tag
  pela Action **Criar tag da versão** (Run workflow na `main`): ela cria `vX.Y.Z` do `releases.json` e dispara a
  "Publicar versão". O Diego também pode criar a tag pelo Git no PC.

## Versões e publicação

1. Nova entrada no topo de `releases.json` (JSON formatado, 2 espaços; edite com Python `json.dumps(indent=2,
   ensure_ascii=False)`), versão igual em `package.json`, `apps/api/package.json`, `apps/web/package.json` e no
   `package-lock.json` (raiz, `""`, `apps/api` e `apps/web`; confira com `grep -n '"name": "@crm/' -A1 package-lock.json`).
2. `node scripts/check-release.mjs`, `npx tsc --noEmit` (api e web), `npx vitest run` (api), `npm run lint`.
3. Commit na `main`, push (com permissão) e a Action "Criar tag da versão" (ou o Diego, pelo Git no PC).
4. A Action "Publicar versão" gera as imagens `ghcr.io/diegonauemocelin/saascrm-{api,web,backup}:X.Y.Z`.
5. Na VPS: `cd /opt/saascrm && sudo bash deploy/deploy.sh` (instala a maior tag).

Tag com número diferente do `releases.json` falha na Action e o deploy não acha as imagens (já aconteceu com uma
`v1.0.1` criada por engano: apague a tag no GitHub e na VPS com `git tag -d`).

## Arquitetura (resumo)

- `apps/api` NestJS + Prisma 7 + PostgreSQL; `apps/web` React 19 + Vite + Tailwind + shadcn; `apps/site` site
  estático de apresentação; `deploy/` scripts da VPS.
- Multiempresa: a empresa sai do endereço acessado (`<slug>.crm.sgmulticonecta.com.br`, domínio próprio verificado,
  ou o painel `crm.sgmulticonecta.com.br` = empresa dona, `isPlatform`). Código em `apps/api/src/plataforma`.
- Planos liberam "sistemas" (grupos de módulos, `sistemas.ts`); o AuthGuard filtra as permissões pelo plano e bloqueia
  quando a assinatura não está paga (`accessOf`). Cobrança pelo Asaas (`asaas.ts`, `cobranca.service.ts`).
- HTTPS: na VPS atual, Nginx do servidor + `deploy/certificados.sh` (cron a cada 5 min); numa VPS só da plataforma,
  Caddy (perfil `caddy`). Veja `docs/DEPLOY.md`.

## Testes e cuidados

- Testes do vitest não podem importar classes com decorators (Nest): teste funções puras.
- Classes DTO precisam estar declaradas **antes** do controller que as usa (metadados dos decorators).
- Seed: `apps/api/prisma/seed.ts` importa `src/plataforma/perfis-padrao.ts`, copiado para a imagem no
  `apps/api/Dockerfile`. Se o seed passar a importar outro arquivo de `src`, copie também.
- Empresas fictícias para telas e vídeos: `apps/api/scripts/demo-segmentos.ts` (só banco de desenvolvimento).
