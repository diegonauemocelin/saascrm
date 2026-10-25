import { randomBytes } from 'node:crypto'
import { resolve4, resolveCname } from 'node:dns/promises'
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { AuthService } from '../auth/auth.service'
import { hashPassword } from '../auth/password'
import type { RequestCtx } from '../common/decorators'
import { type Action, can } from '../common/permissions'
import type { AuthUser } from '../common/types'
import { env } from '../config/env'
import { Prisma } from '../generated/prisma/client'
import { TenantService } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { createDefaultRoles } from './perfis-padrao'
import { accessOf, avulsoTotal, cleanSale, cleanSlug, cleanSystems, nextStatus, PLATFORM_MODULE, SALE_DEFAULTS, type SaleSettings, STATUS_LABEL, SYSTEMS, TENANT_STATUSES, type TenantStatus } from './sistemas'

const DAY = 86_400_000

export interface PlanInput {
  name?: string
  description?: string
  priceCents?: number
  systems?: string[]
  maxUsers?: number
  maxWhatsapp?: number
  trialDays?: number
  public?: boolean
  active?: boolean
  sortOrder?: number
}

export interface CompanyInput {
  name: string
  slug: string
  planId?: string | null
  /** Como começa: em teste (dias do plano), aguardando o pagamento ou já ativa (paga por fora). */
  start?: 'TESTE' | 'AGUARDANDO_PAGAMENTO' | 'ATIVA'
  trialDays?: number
  paidUntil?: string | null
  adminName: string
  adminEmail: string
  document?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  /** Senha escolhida no cadastro (sem ela, o administrador recebe o convite para criar a senha). */
  password?: string
  /** Sistemas avulsos (sem plano) e os limites que vêm com eles. */
  extraSystems?: string[]
  extraUsers?: number
  extraWhatsapp?: number
}

/**
 * Painel da plataforma (só na empresa dona, sgmulticonecta): empresas clientes, planos, domínios próprios, cobranças e a
 * rotina diária que muda a situação das assinaturas (ativa → atrasada → suspensa).
 */
export interface SiteContact {
  whatsapp: string
  email: string
  instagram: string
}
const EMPTY_SITE: SiteContact = { whatsapp: '', email: '', instagram: '' }

@Injectable()
export class PlataformaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PlataformaService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- Venda (sistemas avulsos, kits e completo) ----------

  private async platformId() {
    return (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id ?? null
  }

  /** Como a plataforma vende: preços à mostra ou sob consulta, e os sistemas avulsos com o valor mensal de cada um. */
  async sale(): Promise<SaleSettings> {
    const id = await this.platformId()
    return id ? cleanSale(await this.settings.get(id, 'venda', SALE_DEFAULTS)) : SALE_DEFAULTS
  }

  async saveSale(user: AuthUser, d: unknown, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    const value = cleanSale(d)
    if (value.avulso && !value.sellable.length) throw new BadRequestException('Escolha pelo menos um sistema para a venda avulsa.')
    await this.settings.set(user.tenantId, 'venda', value)
    await this.audit.byUser(user, ctx, 'plataforma.venda', 'settings', 'venda', { precosVisiveis: value.showPrices, avulso: value.avulso, sistemas: value.sellable, valores: Object.fromEntries(Object.entries(value.prices).map(([k, v]) => [k, v / 100])), testeDias: value.trialDays })
    return value
  }

  // ---------- Site de apresentação ----------

  /** Contato mostrado no site (planos sob consulta): WhatsApp comercial, e-mail e Instagram. */
  async siteContact(): Promise<SiteContact> {
    const id = (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id
    return id ? this.settings.get(id, 'site', EMPTY_SITE) : EMPTY_SITE
  }

  async saveSiteContact(user: AuthUser, d: SiteContact, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    const value: SiteContact = { whatsapp: d.whatsapp.replace(/\D/g, '').slice(0, 15), email: d.email.trim().toLowerCase(), instagram: d.instagram.trim().replace(/^@/, '').slice(0, 60) }
    await this.settings.set(user.tenantId, 'site', value)
    await this.audit.byUser(user, ctx, 'plataforma.site_contato', 'settings', 'site', { ...value })
    return value
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.reviewStatuses(), 3_600_000)
    this.timer.unref()
    setTimeout(() => void this.reviewStatuses(), 60_000).unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** Só a empresa dona da plataforma, com a permissão do módulo Plataforma. */
  async assertCan(user: AuthUser, action: Action) {
    const t = await this.tenants.info(user.tenantId)
    if (!t.isPlatform || !can(user.permissions, user.role.isSystem, PLATFORM_MODULE, action)) throw new ForbiddenException('Você não tem permissão para esta ação.')
  }

  /** A cada hora: mensalidade vencida vira "atrasada" e, depois da tolerância, "suspensa" (o pagamento reativa). */
  async reviewStatuses() {
    try {
      const list = await this.prisma.tenant.findMany({ where: { isPlatform: false, isDemo: false, status: { in: ['ATIVA', 'ATRASADA'] } }, select: { id: true, name: true, status: true, paidUntil: true, isPlatform: true } })
      for (const t of list) {
        const next = nextStatus(t)
        if (next === t.status) continue
        await this.prisma.tenant.update({ where: { id: t.id }, data: { status: next, ...(next === 'SUSPENSA' ? { suspendedAt: new Date() } : {}) } })
        this.tenants.forget(t.id)
        await this.audit.log({ tenantId: t.id, action: 'plataforma.situacao_automatica', entity: 'tenant', entityId: t.id, data: { de: t.status, para: next, pagoAte: t.paidUntil?.toISOString() ?? null } })
        this.logger.log(`Assinatura de ${t.name}: ${t.status} → ${next}`)
      }
    } catch (err) {
      this.logger.warn(`Revisão das assinaturas: ${(err as Error).message}`)
    }
  }

  // ---------- Resumo ----------

  async summary(user: AuthUser) {
    await this.assertCan(user, 'view')
    // Empresas de demonstração não contam (nem na receita).
    const companies = await this.prisma.tenant.findMany({ where: { isPlatform: false, isDemo: false }, select: { status: true, extraSystems: true, plan: { select: { priceCents: true } } } })
    const sale = await this.sale()
    const byStatus = Object.fromEntries(TENANT_STATUSES.map((s) => [s, companies.filter((c) => c.status === s).length]))
    const mrrCents = companies.filter((c) => c.status === 'ATIVA' || c.status === 'ATRASADA').reduce((s, c) => s + (c.plan ? c.plan.priceCents : avulsoTotal(c.extraSystems, sale)), 0)
    const overdue = await this.prisma.tenantPayment.aggregate({ where: { status: 'VENCIDA' }, _sum: { valueCents: true }, _count: true })
    return { total: companies.length, byStatus, mrrCents, overdueCents: overdue._sum.valueCents ?? 0, overdueCount: overdue._count, platformDomain: env.platformDomain }
  }

  // ---------- Sistemas e planos ----------

  systems() {
    return SYSTEMS.map((s) => ({ key: s.key, label: s.label, onRequest: 'onRequest' in s && s.onRequest }))
  }

  async plans(user: AuthUser) {
    await this.assertCan(user, 'view')
    const rows = await this.prisma.plan.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { priceCents: 'asc' }], include: { _count: { select: { tenants: true } } } })
    return rows.map(({ _count, ...p }) => ({ ...p, companies: _count.tenants }))
  }

  private cleanPlan(d: PlanInput, partial: boolean) {
    const out: Prisma.PlanUncheckedCreateInput | Prisma.PlanUncheckedUpdateInput = {}
    if (d.name !== undefined || !partial) {
      const name = (d.name ?? '').trim().slice(0, 60)
      if (!name) throw new BadRequestException('Dê um nome ao plano.')
      out.name = name
    }
    if (d.description !== undefined) out.description = d.description.trim().slice(0, 400)
    if (d.priceCents !== undefined || !partial) {
      if (!Number.isInteger(d.priceCents) || d.priceCents! < 0 || d.priceCents! > 10_000_000) throw new BadRequestException('Valor mensal inválido.')
      out.priceCents = d.priceCents
    }
    if (d.systems !== undefined) out.systems = cleanSystems(d.systems)
    for (const k of ['maxUsers', 'maxWhatsapp'] as const) {
      if (d[k] === undefined) continue
      if (!Number.isInteger(d[k]) || d[k]! < 0 || d[k]! > 10_000) throw new BadRequestException('Limites: números inteiros de 0 a 10.000.')
      out[k] = d[k]
    }
    if (d.trialDays !== undefined) {
      if (![0, 3, 7, 14, 30].includes(d.trialDays)) throw new BadRequestException('Teste grátis: 0, 3, 7, 14 ou 30 dias.')
      out.trialDays = d.trialDays
    }
    if (d.public !== undefined) out.public = d.public
    if (d.active !== undefined) out.active = d.active
    if (d.sortOrder !== undefined) out.sortOrder = Math.max(0, Math.min(999, Math.round(d.sortOrder)))
    return out
  }

  async createPlan(user: AuthUser, d: PlanInput, ctx: RequestCtx) {
    await this.assertCan(user, 'create')
    const p = await this.prisma.plan.create({ data: this.cleanPlan(d, false) as Prisma.PlanUncheckedCreateInput })
    await this.audit.byUser(user, ctx, 'plataforma.plano_criado', 'plan', p.id, { nome: p.name, valor: p.priceCents / 100, sistemas: p.systems })
    return p
  }

  async updatePlan(user: AuthUser, id: string, d: PlanInput, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    const p = await this.prisma.plan.update({ where: { id }, data: this.cleanPlan(d, true) }).catch(() => null)
    if (!p) throw new NotFoundException('Plano não encontrado.')
    this.tenants.forget()
    await this.audit.byUser(user, ctx, 'plataforma.plano_alterado', 'plan', id, { nome: p.name, valor: p.priceCents / 100, sistemas: p.systems })
    return p
  }

  // ---------- Empresas ----------

  async companies(user: AuthUser, q: { search?: string; status?: string }) {
    await this.assertCan(user, 'view')
    const s = q.search?.trim()
    const rows = await this.prisma.tenant.findMany({
      where: {
        isPlatform: false,
        ...(q.status && (TENANT_STATUSES as readonly string[]).includes(q.status) ? { status: q.status } : {}),
        ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { slug: { contains: s.toLowerCase() } }, { contactEmail: { contains: s, mode: 'insensitive' } }, { document: { contains: s.replace(/\D/g, '') || s } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { plan: { select: { id: true, name: true, priceCents: true } }, domains: { select: { host: true, verifiedAt: true } }, _count: { select: { users: true } } },
    })
    const numbers = await this.prisma.whatsappNumber.groupBy({ by: ['tenantId'], where: { tenantId: { in: rows.map((r) => r.id) }, deletedAt: null }, _count: true })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      url: this.urlOf(r.slug, r.domains.find((d) => d.verifiedAt)?.host ?? null),
      status: r.status,
      statusLabel: STATUS_LABEL[r.status as TenantStatus] ?? r.status,
      plan: r.plan,
      trialEndsAt: r.trialEndsAt,
      paidUntil: r.paidUntil,
      users: r._count.users,
      whatsapp: numbers.find((n) => n.tenantId === r.id)?._count ?? 0,
      extraUsers: r.extraUsers,
      extraWhatsapp: r.extraWhatsapp,
      extraSystems: r.extraSystems,
      isDemo: r.isDemo,
      document: r.document,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      contactPhone: r.contactPhone,
      notes: r.notes,
      domains: r.domains,
      createdAt: r.createdAt,
      access: accessOf(r),
    }))
  }

  private urlOf(slug: string, domain: string | null) {
    return env.platformDomain ? `https://${domain ?? `${slug}.${env.platformDomain}`}` : env.appUrl
  }

  /**
   * Nova empresa: cria a empresa, os perfis padrão e o administrador, e manda o convite por e-mail para ele criar a
   * senha. Começa em teste, aguardando o pagamento ou já ativa (quando a mensalidade foi combinada por fora).
   */
  async createCompany(user: AuthUser | null, d: CompanyInput, ctx: RequestCtx) {
    if (user) await this.assertCan(user, 'create')
    const name = d.name.trim().slice(0, 120)
    if (name.length < 2) throw new BadRequestException('Informe o nome da empresa.')
    const slug = cleanSlug(d.slug || name)
    if (!slug) throw new BadRequestException('Endereço inválido: use de 3 a 30 letras, números ou hífen (alguns nomes são reservados).')
    if (await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) throw new BadRequestException(`O endereço "${slug}" já está em uso. Escolha outro.`)
    const email = d.adminEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('E-mail do administrador inválido.')
    const plan = d.planId ? await this.prisma.plan.findFirst({ where: { id: d.planId, active: true } }) : null
    if (d.planId && !plan) throw new BadRequestException('Plano não encontrado (ou desativado).')
    const start = d.start ?? (plan?.trialDays ? 'TESTE' : 'AGUARDANDO_PAGAMENTO')
    const trialDays = d.trialDays ?? plan?.trialDays ?? 7
    const paidUntil = d.paidUntil && Number.isFinite(Date.parse(d.paidUntil)) ? new Date(d.paidUntil) : start === 'ATIVA' ? new Date(Date.now() + 30 * DAY) : null
    const { tenant, admin } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          planId: plan?.id ?? null,
          extraSystems: cleanSystems(d.extraSystems ?? []),
          extraUsers: Math.max(0, Math.min(1000, Math.round(d.extraUsers ?? 0))),
          extraWhatsapp: Math.max(0, Math.min(1000, Math.round(d.extraWhatsapp ?? 0))),
          status: start,
          trialEndsAt: start === 'TESTE' ? new Date(Date.now() + trialDays * DAY) : null,
          paidUntil,
          document: d.document?.replace(/\D/g, '').slice(0, 14) || null,
          contactName: d.contactName?.trim().slice(0, 120) || d.adminName.trim().slice(0, 120),
          contactEmail: d.contactEmail?.trim().toLowerCase().slice(0, 200) || email,
          contactPhone: d.contactPhone?.replace(/[^\d+]/g, '').slice(0, 20) || null,
        },
      })
      const roleId = await createDefaultRoles(tx, tenant.id)
      // Sem senha escolhida, uma aleatória que ninguém conhece: o administrador cria a dele pelo link do convite.
      const admin = await tx.user.create({ data: { tenantId: tenant.id, roleId, name: d.adminName.trim().slice(0, 120) || 'Administrador', email, passwordHash: await hashPassword(d.password ?? randomBytes(24).toString('base64url')), mustChangePassword: false } })
      await tx.tenantSetting.create({ data: { tenantId: tenant.id, key: 'branding', value: { appName: name, shortName: name.slice(0, 30) } as Prisma.InputJsonValue } })
      return { tenant, admin }
    })
    const url = this.urlOf(tenant.slug, null)
    let invite = d.password ? 'não precisa (senha criada no cadastro)' : 'enviado'
    try {
      if (!d.password) await this.auth.sendPasswordLink(admin.id, tenant.id, admin.email, admin.name, 'invite')
    } catch (err) {
      invite = `não enviado (${(err as Error).message.slice(0, 120).replace(/\.+$/, '')}). Configure o SMTP da plataforma em Configurações › E-mail e use "Reenviar convite"`
    }
    await this.audit.log({ tenantId: tenant.id, userId: user?.id, userEmail: user?.email ?? email, action: user ? 'plataforma.empresa_criada' : 'plataforma.cadastro', entity: 'tenant', entityId: tenant.id, ...ctx, data: { nome: name, endereco: slug, plano: plan?.name ?? null, sistemasAvulsos: d.extraSystems?.length ? d.extraSystems : undefined, inicio: start } })
    return { id: tenant.id, slug, url, invite, inviteSent: invite !== 'enviado' ? !!d.password : true, message: `Empresa criada em ${url}. Convite para ${email}: ${invite}.` }
  }

  async resendInvite(user: AuthUser, id: string) {
    await this.assertCan(user, 'edit')
    const admin = await this.prisma.user.findFirst({ where: { tenantId: id, role: { isSystem: true }, active: true }, orderBy: { createdAt: 'asc' } })
    if (!admin) throw new NotFoundException('Esta empresa não tem administrador ativo.')
    await this.auth.sendPasswordLink(admin.id, id, admin.email, admin.name, 'invite')
    return { ok: true, message: `Convite reenviado para ${admin.email}.` }
  }

  /** Alterar a empresa: plano, adicionais, contato, observação, vencimento e a situação (suspender, reativar, cancelar). */
  async updateCompany(user: AuthUser, id: string, d: Partial<CompanyInput> & { status?: string; trialEndsAt?: string | null; extraUsers?: number; extraWhatsapp?: number; extraSystems?: string[]; notes?: string | null }, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    const cur = await this.prisma.tenant.findFirst({ where: { id, isPlatform: false } })
    if (!cur) throw new NotFoundException('Empresa não encontrada.')
    const data: Prisma.TenantUncheckedUpdateInput = {}
    if (d.name !== undefined) data.name = d.name.trim().slice(0, 120) || cur.name
    if (d.planId !== undefined) {
      if (d.planId && !(await this.prisma.plan.findUnique({ where: { id: d.planId }, select: { id: true } }))) throw new BadRequestException('Plano não encontrado.')
      data.planId = d.planId || null
    }
    for (const k of ['extraUsers', 'extraWhatsapp'] as const) if (d[k] !== undefined) data[k] = Math.max(0, Math.min(1000, Math.round(d[k]!)))
    if (d.extraSystems !== undefined) data.extraSystems = cleanSystems(d.extraSystems)
    for (const k of ['document', 'contactName', 'contactEmail', 'contactPhone', 'notes'] as const) if (d[k] !== undefined) data[k] = d[k]?.toString().trim().slice(0, k === 'notes' ? 1000 : 200) || null
    if (d.paidUntil !== undefined) data.paidUntil = d.paidUntil && Number.isFinite(Date.parse(d.paidUntil)) ? new Date(d.paidUntil) : null
    if (d.trialEndsAt !== undefined) data.trialEndsAt = d.trialEndsAt && Number.isFinite(Date.parse(d.trialEndsAt)) ? new Date(d.trialEndsAt) : null
    if (d.status !== undefined && d.status !== cur.status) {
      if (!(TENANT_STATUSES as readonly string[]).includes(d.status)) throw new BadRequestException('Situação inválida.')
      data.status = d.status
      if (d.status === 'SUSPENSA') data.suspendedAt = new Date()
      if (d.status === 'CANCELADA') data.canceledAt = new Date()
      if (d.status === 'ATIVA') {
        data.suspendedAt = null
        data.canceledAt = null
        // Reativada sem vencimento futuro: ganha 30 dias (o pagamento confirmado no Asaas atualiza depois).
        const until = (data.paidUntil as Date | null | undefined) ?? cur.paidUntil
        if (!until || until.getTime() < Date.now()) data.paidUntil = new Date(Date.now() + 30 * DAY)
      }
    }
    const r = await this.prisma.tenant.update({ where: { id }, data })
    this.tenants.forget(id)
    await this.audit.byUser(user, ctx, 'plataforma.empresa_alterada', 'tenant', id, { empresa: r.name, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])) })
    return { ok: true }
  }

  // ---------- Domínios próprios ----------

  private cleanHost(input: string) {
    const h = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) throw new BadRequestException('Domínio inválido. Ex.: crm.suaempresa.com.br')
    if (env.platformDomain && (h === env.platformDomain || h.endsWith(`.${env.platformDomain}`))) throw new BadRequestException('Use um domínio da empresa (os endereços da plataforma já funcionam sem cadastro).')
    return h
  }

  async addDomain(user: AuthUser, id: string, host: string, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    const t = await this.prisma.tenant.findFirst({ where: { id, isPlatform: false }, select: { id: true } })
    if (!t) throw new NotFoundException('Empresa não encontrada.')
    const h = this.cleanHost(host)
    if (await this.prisma.tenantDomain.findUnique({ where: { host: h } })) throw new BadRequestException('Este domínio já está cadastrado.')
    await this.prisma.tenantDomain.create({ data: { tenantId: id, host: h } })
    await this.audit.byUser(user, ctx, 'plataforma.dominio_cadastrado', 'tenant', id, { dominio: h })
    return this.verifyDomain(user, id, h)
  }

  async removeDomain(user: AuthUser, id: string, host: string, ctx: RequestCtx) {
    await this.assertCan(user, 'edit')
    await this.prisma.tenantDomain.deleteMany({ where: { tenantId: id, host: host.toLowerCase() } })
    this.tenants.forget(id)
    await this.audit.byUser(user, ctx, 'plataforma.dominio_removido', 'tenant', id, { dominio: host })
    return { ok: true }
  }

  /**
   * Confere o DNS: o domínio aponta (CNAME) para o endereço da empresa na plataforma, ou para o mesmo IP. Só domínio
   * conferido vale nos links (e o certificado é emitido quando o primeiro acesso chega).
   */
  async verifyDomain(user: AuthUser, id: string, host: string) {
    await this.assertCan(user, 'edit')
    const d = await this.prisma.tenantDomain.findFirst({ where: { tenantId: id, host: host.toLowerCase() }, include: { tenant: { select: { slug: true } } } })
    if (!d) throw new NotFoundException('Domínio não encontrado.')
    if (!env.platformDomain) throw new BadRequestException('Configure PLATFORM_DOMAIN no servidor para usar domínios próprios.')
    const target = `${d.tenant.slug}.${env.platformDomain}`
    const cname = await resolveCname(d.host).catch(() => [] as string[])
    let ok = cname.some((c) => c.toLowerCase().replace(/\.$/, '') === target || c.toLowerCase().replace(/\.$/, '').endsWith(`.${env.platformDomain}`))
    if (!ok) {
      const [mine, theirs] = await Promise.all([resolve4(target).catch(() => [] as string[]), resolve4(d.host).catch(() => [] as string[])])
      ok = theirs.length > 0 && theirs.every((ip) => mine.includes(ip))
    }
    await this.prisma.tenantDomain.update({ where: { id: d.id }, data: { verifiedAt: ok ? (d.verifiedAt ?? new Date()) : null } })
    this.tenants.forget(id)
    return { ok, host: d.host, target, message: ok ? `${d.host} conferido: aponta para a plataforma.` : `${d.host} ainda não aponta para a plataforma. No DNS do domínio, crie um registro CNAME de ${d.host} para ${target} e confira de novo (a propagação pode levar algumas horas).` }
  }

  // ---------- Cobranças ----------

  async payments(user: AuthUser, tenantId?: string) {
    await this.assertCan(user, 'view')
    return this.prisma.tenantPayment.findMany({ where: tenantId ? { tenantId } : {}, orderBy: { dueDate: 'desc' }, take: 300, include: { tenant: { select: { name: true, slug: true } } } })
  }
}
