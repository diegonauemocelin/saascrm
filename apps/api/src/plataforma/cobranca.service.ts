import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { passwordProblems } from '../auth/password'
import type { RequestCtx } from '../common/decorators'
import type { AuthUser } from '../common/types'
import { env } from '../config/env'
import { TenantService } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../settings/mail.service'
import { SettingsService } from '../settings/settings.service'
import { AsaasClient, type AsaasPayment, brDate, isPaid, paidUntilAfter, paymentStatus } from './asaas'
import { PlataformaService } from './plataforma.service'
import { cleanSlug, STATUS_LABEL, SYSTEMS, type TenantStatus, validDocument } from './sistemas'

export interface SignupInput {
  company: string
  slug: string
  planId: string
  document: string
  adminName: string
  email: string
  phone?: string
  password: string
}

/**
 * Cobrança das mensalidades pelo Asaas: cadastro pelo próprio cliente, assinatura mensal (Pix, boleto ou cartão), avisos
 * de pagamento (webhook) que liberam o acesso, e a tela da assinatura para a empresa.
 */
@Injectable()
export class CobrancaService {
  private readonly logger = new Logger(CobrancaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
    private readonly plataforma: PlataformaService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  private client() {
    if (!env.asaasApiKey) return null
    return new AsaasClient(env.asaasApiKey, env.asaasSandbox, fetch, env.asaasUrl)
  }

  // ---------- Cadastro ----------

  /**
   * "Esqueci o endereço da minha empresa": manda para o e-mail os links de login das empresas em que ele é usuário
   * ativo. A resposta é sempre a mesma (não revela se o e-mail tem cadastro).
   */
  async remindCompanies(rawEmail: string) {
    const message = 'Se este e-mail tiver cadastro, enviamos para ele o endereço de acesso da sua empresa. Confira também a caixa de spam.'
    const email = rawEmail.trim().toLowerCase()
    const platformId = (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id
    if (!platformId || !/^\S+@\S+\.\S+$/.test(email)) return { ok: true, message }
    const users = await this.prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, active: true, tenant: { isPlatform: false, status: { not: 'CANCELADA' } } },
      select: { name: true, tenantId: true, tenant: { select: { name: true } } },
      take: 20,
    })
    if (!users.length) return { ok: true, message }
    const links = await Promise.all(users.map(async (u) => ({ name: u.tenant.name, url: `${await this.tenants.url(u.tenantId)}/login` })))
    const branding = await this.settings.branding(platformId)
    const title = `Endereço de acesso - ${branding.appName}`
    const body = links.length === 1 ? `O endereço de acesso da ${links[0]!.name} é ${links[0]!.url}` : `Você tem acesso a estas empresas: ${links.map((l) => `${l.name}: ${l.url}`).join(' · ')}`
    try {
      await this.mail.send(platformId, {
        to: email,
        subject: title,
        text: `Olá, ${users[0]!.name}.\n\n${links.map((l) => `${l.name}: ${l.url}`).join('\n')}\n\nGuarde este endereço nos favoritos.`,
        html: this.mail.simpleTemplate(branding, {
          title,
          greeting: `Olá, ${users[0]!.name}.`,
          body,
          buttonLabel: links.length === 1 ? 'Entrar' : undefined,
          buttonUrl: links.length === 1 ? links[0]!.url : undefined,
          footnote: 'Guarde este endereço nos favoritos. Se não foi você que pediu, ignore este e-mail.',
        }),
      })
    } catch (err) {
      this.logger.error(`Falha ao enviar o endereço de acesso: ${(err as Error).message}`)
    }
    return { ok: true, message }
  }

  /** Planos que aparecem na página de cadastro. */
  async publicPlans() {
    const rows = await this.prisma.plan.findMany({ where: { active: true, public: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      maxUsers: p.maxUsers,
      maxWhatsapp: p.maxWhatsapp,
      trialDays: p.trialDays,
      systems: SYSTEMS.filter((s) => p.systems.includes(s.key)).map((s) => s.label),
    }))
  }

  async slugAvailable(input: string) {
    const slug = cleanSlug(input)
    if (!slug) return { slug: null, available: false, url: null }
    const used = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
    return { slug, available: !used, url: env.platformDomain ? `https://${slug}.${env.platformDomain}` : null }
  }

  /**
   * Cadastro pelo próprio cliente: cria a empresa (em teste, quando o plano tem teste; senão aguardando o pagamento),
   * o administrador com a senha escolhida e a assinatura no Asaas. Sem teste, o acesso só libera com o pagamento.
   */
  async signup(d: SignupInput, ctx: RequestCtx) {
    const plan = await this.prisma.plan.findFirst({ where: { id: d.planId, active: true, public: true } })
    if (!plan) throw new BadRequestException('Escolha um plano.')
    if (!validDocument(d.document)) throw new BadRequestException('CPF ou CNPJ inválido.')
    const problem = passwordProblems(d.password, d.email)
    if (problem) throw new BadRequestException(problem)
    if (plan.priceCents > 0 && !this.client()) throw new ServiceUnavailableException('O cadastro está temporariamente indisponível (cobrança não configurada). Fale com a sgmulticonecta.')
    const r = await this.plataforma.createCompany(
      null,
      { name: d.company, slug: d.slug, planId: plan.id, start: plan.trialDays ? 'TESTE' : 'AGUARDANDO_PAGAMENTO', trialDays: plan.trialDays || undefined, adminName: d.adminName, adminEmail: d.email, document: d.document, contactName: d.adminName, contactEmail: d.email, contactPhone: d.phone ?? null, password: d.password },
      ctx,
    )
    let payUrl: string | null = null
    let billingError: string | null = null
    try {
      payUrl = (await this.ensureSubscription(r.id)).payUrl
    } catch (err) {
      billingError = (err as Error).message
      this.logger.warn(`Cadastro de ${d.company}: assinatura no Asaas não criada: ${billingError}`)
    }
    return {
      url: r.url,
      trialDays: plan.trialDays,
      payUrl,
      message: plan.trialDays
        ? `Pronto! Seu teste grátis de ${plan.trialDays} dias começou. Entre em ${r.url} com o seu e-mail e a senha que você criou.`
        : billingError
          ? `Empresa cadastrada. A cobrança da primeira mensalidade não foi gerada agora (${billingError}); a sgmulticonecta vai entrar em contato.`
          : 'Empresa cadastrada. Pague a primeira mensalidade para liberar o acesso: assim que o pagamento for confirmado, você já pode entrar.',
    }
  }

  // ---------- Assinatura no Asaas ----------

  /**
   * Garante a assinatura mensal no Asaas (cria o cliente e a assinatura quando faltam). O primeiro vencimento é o fim do
   * teste, ou hoje (sem teste). Devolve o link da fatura em aberto.
   */
  async ensureSubscription(tenantId: string): Promise<{ payUrl: string | null }> {
    const asaas = this.client()
    if (!asaas) throw new BadRequestException('Cobrança não configurada: informe ASAAS_API_KEY no servidor.')
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } })
    if (t.isPlatform) throw new BadRequestException('A empresa dona da plataforma não paga mensalidade.')
    if (!t.plan || t.plan.priceCents <= 0) throw new BadRequestException('A empresa precisa de um plano pago para gerar a cobrança.')
    if (!t.document || !validDocument(t.document)) throw new BadRequestException('Informe o CPF ou CNPJ da empresa (obrigatório para cobrar no Asaas).')
    let customer = t.asaasCustomerId
    if (!customer) {
      customer = (await asaas.createCustomer({ name: t.name, cpfCnpj: t.document, email: t.contactEmail ?? '', mobilePhone: t.contactPhone, externalReference: t.id })).id
      await this.prisma.tenant.update({ where: { id: t.id }, data: { asaasCustomerId: customer } })
    }
    if (!t.asaasSubscriptionId) {
      const first = t.status === 'TESTE' && t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? brDate(t.trialEndsAt) : brDate(Date.now())
      const sub = await asaas.createSubscription({ customer, value: t.plan.priceCents / 100, nextDueDate: first, description: `Plano ${t.plan.name} — ${t.name}`, externalReference: t.id })
      await this.prisma.tenant.update({ where: { id: t.id }, data: { asaasSubscriptionId: sub.id } })
      await this.audit.log({ tenantId: t.id, action: 'plataforma.assinatura_criada', entity: 'tenant', entityId: t.id, data: { plano: t.plan.name, valor: t.plan.priceCents / 100, primeiroVencimento: first } })
      t.asaasSubscriptionId = sub.id
    }
    await this.syncPayments(t.id)
    return { payUrl: await this.openInvoice(t.id) }
  }

  /** Copia as cobranças da assinatura (para a tela e para o histórico). */
  async syncPayments(tenantId: string) {
    const asaas = this.client()
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { asaasSubscriptionId: true } })
    if (!asaas || !t?.asaasSubscriptionId) return
    for (const p of await asaas.subscriptionPayments(t.asaasSubscriptionId)) await this.savePayment(tenantId, p)
  }

  private async savePayment(tenantId: string, p: AsaasPayment) {
    const paid = p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate ?? null
    const data = { valueCents: Math.round(p.value * 100), status: paymentStatus(p.status), billingType: p.billingType ?? null, dueDate: new Date(`${p.dueDate}T12:00:00-03:00`), paidAt: paid ? new Date(`${paid.slice(0, 10)}T12:00:00-03:00`) : null, invoiceUrl: p.invoiceUrl ?? null }
    await this.prisma.tenantPayment.upsert({ where: { asaasPaymentId: p.id }, create: { tenantId, asaasPaymentId: p.id, ...data }, update: data })
  }

  /** Fatura mais antiga em aberto (vencida ou a vencer), para o botão "Pagar". */
  private async openInvoice(tenantId: string) {
    const p = await this.prisma.tenantPayment.findFirst({ where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] }, invoiceUrl: { not: null } }, orderBy: { dueDate: 'asc' } })
    return p?.invoiceUrl ?? null
  }

  /** Troca de plano: o valor da assinatura acompanha (inclusive as cobranças ainda não pagas). */
  async planChanged(tenantId: string) {
    const asaas = this.client()
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } })
    if (!asaas || !t?.asaasSubscriptionId || !t.plan) return
    await asaas.updateSubscription(t.asaasSubscriptionId, { value: t.plan.priceCents / 100, description: `Plano ${t.plan.name} — ${t.name}` })
  }

  /** Cancelada na plataforma: a assinatura no Asaas para de cobrar. */
  async canceled(tenantId: string) {
    const asaas = this.client()
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { asaasSubscriptionId: true } })
    if (!asaas || !t?.asaasSubscriptionId) return
    await asaas.cancelSubscription(t.asaasSubscriptionId)
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { asaasSubscriptionId: null } })
  }

  // ---------- Avisos do Asaas (webhook) ----------

  /**
   * Evento de cobrança do Asaas. O token configurado no Asaas vem no cabeçalho asaas-access-token. Pagamento confirmado
   * libera o acesso na hora (ativa, com o "pago até" no próximo vencimento).
   */
  async webhook(token: string | undefined, body: unknown) {
    const expected = env.asaasWebhookToken
    if (!expected || !token || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new UnauthorizedException()
    const event = String((body as { event?: unknown })?.event ?? '')
    const p = (body as { payment?: AsaasPayment })?.payment
    if (!event.startsWith('PAYMENT_') || !p?.id) return { ok: true }
    const t = await this.prisma.tenant.findFirst({
      where: { OR: [...(p.subscription ? [{ asaasSubscriptionId: p.subscription }] : []), { asaasCustomerId: p.customer }, ...(p.externalReference ? [{ id: /^[0-9a-f-]{36}$/.test(p.externalReference) ? p.externalReference : '00000000-0000-0000-0000-000000000000' }] : [])] },
    })
    if (!t) {
      this.logger.warn(`Asaas: cobrança ${p.id} sem empresa conhecida (${event}).`)
      return { ok: true }
    }
    await this.savePayment(t.id, p)
    if (isPaid(p.status) && !t.isPlatform && t.status !== 'CANCELADA') {
      const paidUntil = paidUntilAfter(p.dueDate, t.paidUntil)
      await this.prisma.tenant.update({ where: { id: t.id }, data: { status: 'ATIVA', paidUntil, suspendedAt: null, trialEndsAt: null } })
      this.tenants.forget(t.id)
      await this.audit.log({ tenantId: t.id, action: 'plataforma.pagamento_confirmado', entity: 'tenant', entityId: t.id, data: { cobranca: p.id, valor: p.value, vencimento: p.dueDate, pagoAte: paidUntil.toISOString(), antes: t.status } })
    } else if (event === 'PAYMENT_OVERDUE') {
      await this.audit.log({ tenantId: t.id, action: 'plataforma.pagamento_vencido', entity: 'tenant', entityId: t.id, data: { cobranca: p.id, valor: p.value, vencimento: p.dueDate } })
    }
    return { ok: true }
  }

  // ---------- Tela da assinatura (empresa cliente) ----------

  async billing(user: AuthUser) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, include: { plan: true } })
    if (t.asaasSubscriptionId) await this.syncPayments(t.id).catch(() => undefined)
    const payments = await this.prisma.tenantPayment.findMany({ where: { tenantId: t.id }, orderBy: { dueDate: 'desc' }, take: 24, select: { id: true, valueCents: true, status: true, billingType: true, dueDate: true, paidAt: true, invoiceUrl: true } })
    return {
      company: t.name,
      status: t.status,
      statusLabel: STATUS_LABEL[t.status as TenantStatus] ?? t.status,
      plan: t.plan ? { name: t.plan.name, priceCents: t.plan.priceCents, maxUsers: t.plan.maxUsers + t.extraUsers, maxWhatsapp: t.plan.maxWhatsapp + t.extraWhatsapp, systems: SYSTEMS.filter((s) => t.plan!.systems.includes(s.key)).map((s) => s.label) } : null,
      trialEndsAt: t.trialEndsAt,
      paidUntil: t.paidUntil,
      payUrl: await this.openInvoice(t.id),
      hasSubscription: !!t.asaasSubscriptionId,
      payments,
    }
  }

  /** Empresa sem assinatura no Asaas (ex.: cadastrada pela plataforma) gera a cobrança pela tela de bloqueio. */
  async payNow(user: AuthUser, ctx: RequestCtx) {
    const r = await this.ensureSubscription(user.tenantId)
    await this.audit.byUser(user, ctx, 'plataforma.cobranca_gerada', 'tenant', user.tenantId)
    if (!r.payUrl) throw new NotFoundException('Nenhuma fatura em aberto agora.')
    return r
  }
}
