/**
 * Seed idempotente: cria a empresa dona da plataforma (sgmulticonecta), os perfis padrão e o primeiro administrador.
 * Pode rodar várias vezes sem duplicar nada. A senha do admin só é gerada (e exibida) na primeira vez.
 *
 *   SEED_ADMIN_EMAIL=voce@empresa.com.br SEED_ADMIN_NAME="Seu Nome" npm run db:seed
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import * as argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '../src/generated/prisma/client'
import { applyPlatformBranding, createDefaultRoles } from '../src/plataforma/perfis-padrao'

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  const slug = process.env.TENANT_SLUG || 'default'

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    // A primeira empresa é a dona da plataforma (painel de empresas, planos e cobranças): não paga e não é bloqueada.
    create: { slug, name: process.env.SEED_TENANT_NAME || 'SG Multiconecta', isPlatform: true, status: 'ATIVA' },
    update: { isPlatform: true, status: 'ATIVA' },
  })

  await createDefaultRoles(prisma, tenant.id)
  if (!(await prisma.tenantSetting.findUnique({ where: { tenantId_key: { tenantId: tenant.id, key: 'branding' } } }))) await applyPlatformBranding(prisma, tenant.id)

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  if (!adminEmail) {
    console.log('SEED_ADMIN_EMAIL não informado: nenhum administrador criado.')
  } else if (await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } } })) {
    console.log(`Administrador ${adminEmail} já existe. Nada alterado.`)
  } else {
    const adminRole = await prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, isSystem: true } })
    const password = randomBytes(12).toString('base64url')
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        roleId: adminRole.id,
        name: process.env.SEED_ADMIN_NAME || 'Administrador',
        email: adminEmail,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 38_912, timeCost: 3, parallelism: 1 }),
        mustChangePassword: true,
      },
    })
    console.log('\n================================================================')
    console.log(' Administrador criado')
    console.log(`  E-mail: ${adminEmail}`)
    console.log(`  Senha provisória: ${password}`)
    console.log(' Ela aparece só agora. No primeiro acesso o sistema pede a troca')
    console.log(' da senha e a configuração do 2FA.')
    console.log('================================================================\n')
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
