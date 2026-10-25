import { Global, Injectable, Module, NotFoundException } from '@nestjs/common'
import { env } from '../config/env'
import { hostKind } from '../plataforma/sistemas'
import { PrismaService } from './prisma.service'

export interface TenantInfo {
  id: string
  name: string
  slug: string
  isPlatform: boolean
  status: string
  trialEndsAt: Date | null
  paidUntil: Date | null
  planId: string | null
  planName: string | null
  systems: string[]
  maxUsers: number
  maxWhatsapp: number
  /** Domínio próprio conferido (vale nos links), quando houver. */
  domain: string | null
}

/** Dados da empresa usados a cada requisição, guardados por alguns segundos (troca de plano vale logo depois). */
const INFO_TTL_MS = 15_000

/**
 * Empresa da requisição: pelo endereço acessado (<slug>.<domínio da plataforma>, o domínio próprio cadastrado ou o
 * painel da plataforma). Sem domínio da plataforma configurado (desenvolvimento), vale a empresa padrão (TENANT_SLUG).
 */
@Injectable()
export class TenantService {
  private defaultTenantId: string | null = null
  private readonly infoCache = new Map<string, { at: number; info: TenantInfo }>()
  private readonly hostCache = new Map<string, { at: number; id: string | null }>()

  constructor(private readonly prisma: PrismaService) {}

  async defaultId(): Promise<string> {
    if (this.defaultTenantId) return this.defaultTenantId
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: env.tenantSlug } })
    if (!tenant) throw new NotFoundException('Empresa padrão não encontrada. Rode o seed (npm run db:seed).')
    this.defaultTenantId = tenant.id
    return tenant.id
  }

  /** Empresa do endereço acessado; null = endereço que não é de nenhuma empresa. */
  async idFromHost(host: string | undefined): Promise<string | null> {
    if (!env.platformDomain) return this.defaultId()
    const h = (host ?? '').toLowerCase().replace(/:\d+$/, '')
    const hit = this.hostCache.get(h)
    if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.id
    const k = hostKind(h, env.platformDomain, env.platformAdminHost)
    let id: string | null = null
    // O painel e o próprio domínio da plataforma (página de cadastro) são da empresa dona.
    if (k.kind === 'admin' || h === env.platformDomain || h === `www.${env.platformDomain}`) id = (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id ?? null
    else if (k.kind === 'slug') id = (await this.prisma.tenant.findUnique({ where: { slug: k.slug }, select: { id: true } }))?.id ?? null
    else if (k.kind === 'custom') id = (await this.prisma.tenantDomain.findUnique({ where: { host: k.host }, select: { tenantId: true } }))?.tenantId ?? null
    else if (k.kind === 'none' && (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h))) id = await this.defaultId().catch(() => null)
    this.hostCache.set(h, { at: Date.now(), id })
    return id
  }

  /**
   * O servidor pode emitir certificado HTTPS para este endereço? Só o domínio da plataforma, o painel, o subdomínio de
   * uma empresa cadastrada e o domínio próprio cadastrado (evita certificados para nomes que alguém aponte por engano).
   */
  async certificateAllowed(host: string): Promise<boolean> {
    if (!env.platformDomain) return false
    const h = host.toLowerCase().replace(/\.$/, '')
    if (h === env.platformDomain || h === `www.${env.platformDomain}` || h === env.platformAdminHost) return true
    if (env.siteDomain && (h === env.siteDomain || h === `www.${env.siteDomain}`)) return true
    const k = hostKind(h, env.platformDomain, env.platformAdminHost)
    if (k.kind === 'slug') return !!(await this.prisma.tenant.findUnique({ where: { slug: k.slug }, select: { id: true } }))
    if (k.kind === 'custom') return !!(await this.prisma.tenantDomain.findUnique({ where: { host: k.host }, select: { id: true } }))
    return false
  }

  /**
   * Endereços que precisam de certificado quando o HTTPS fica no Nginx do servidor (deploy/certificados.sh): o domínio
   * da plataforma, o painel, o subdomínio de cada empresa não cancelada e os domínios próprios já conferidos (um domínio
   * ainda não apontado falharia na emissão e gastaria o limite de tentativas do Let's Encrypt).
   */
  async certificateHosts(): Promise<string[]> {
    if (!env.platformDomain) return []
    const [tenants, domains] = await Promise.all([
      this.prisma.tenant.findMany({ where: { isPlatform: false, status: { not: 'CANCELADA' } }, select: { slug: true } }),
      this.prisma.tenantDomain.findMany({ where: { verifiedAt: { not: null }, tenant: { status: { not: 'CANCELADA' } } }, select: { host: true } }),
    ])
    const site = env.siteDomain ? [env.siteDomain, `www.${env.siteDomain}`] : []
    const hosts = [env.platformDomain, env.platformAdminHost, ...site, ...tenants.map((t) => `${t.slug}.${env.platformDomain}`), ...domains.map((d) => d.host)]
    return [...new Set(hosts.filter((h): h is string => !!h && /^[a-z0-9.-]+$/.test(h)))].sort()
  }

  /** Empresa do endereço, ou erro 404 quando o endereço não é de nenhuma empresa. */
  async requireFromHost(host: string | undefined): Promise<string> {
    const id = await this.idFromHost(host)
    if (!id) throw new NotFoundException('Endereço não encontrado. Confira o endereço da sua empresa.')
    return id
  }

  async info(tenantId: string): Promise<TenantInfo> {
    const hit = this.infoCache.get(tenantId)
    if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.info
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true, domains: { where: { verifiedAt: { not: null } }, orderBy: { createdAt: 'asc' }, take: 1 } } })
    const info: TenantInfo = {
      id: t.id,
      name: t.name,
      slug: t.slug,
      isPlatform: t.isPlatform,
      status: t.status,
      trialEndsAt: t.trialEndsAt,
      paidUntil: t.paidUntil,
      planId: t.planId,
      planName: t.plan?.name ?? null,
      systems: [...new Set([...(t.plan?.systems ?? []), ...t.extraSystems])],
      maxUsers: (t.plan?.maxUsers ?? 0) + t.extraUsers,
      maxWhatsapp: (t.plan?.maxWhatsapp ?? 0) + t.extraWhatsapp,
      domain: t.domains[0]?.host ?? null,
    }
    this.infoCache.set(tenantId, { at: Date.now(), info })
    return info
  }

  /**
   * Endereço da empresa para os links (e-mails, scripts, retorno de integrações): o domínio próprio conferido, o
   * subdomínio na plataforma ou, no painel da plataforma, o endereço do painel. Sem plataforma configurada, APP_URL.
   */
  async url(tenantId: string): Promise<string> {
    if (!env.platformDomain) return env.appUrl
    const t = await this.info(tenantId)
    if (t.isPlatform && env.platformAdminHost) return `https://${env.platformAdminHost}`
    return `https://${t.domain ?? `${t.slug}.${env.platformDomain}`}`
  }

  /** Limites do plano (usuários ativos e números de WhatsApp); null = sem limite (empresa dona ou sem plataforma). */
  async limits(tenantId: string): Promise<{ users: number; whatsapp: number; plan: string | null } | null> {
    if (!env.platformDomain) return null
    const t = await this.info(tenantId)
    if (t.isPlatform) return null
    return { users: t.maxUsers, whatsapp: t.maxWhatsapp, plan: t.planName }
  }

  /** Depois de mudar plano, situação ou domínios: vale na hora. */
  forget(tenantId?: string) {
    if (tenantId) this.infoCache.delete(tenantId)
    else this.infoCache.clear()
    this.hostCache.clear()
  }
}

@Global()
@Module({
  providers: [PrismaService, TenantService],
  exports: [PrismaService, TenantService],
})
export class PrismaModule {}
