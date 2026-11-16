import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { normalizePhone } from '../atendimento/br'
import { AuditService } from '../audit/audit.service'
import { decrypt, encrypt } from '../common/crypto'
import type { RequestCtx } from '../common/decorators'
import { can } from '../common/permissions'
import type { AuthUser } from '../common/types'
import { env } from '../config/env'
import type { Prisma } from '../generated/prisma/client'
import type { CustomerData } from '../integracoes/magazord'
import { LeadCaptureService } from '../leads/lead-capture.service'
import { LeadConfigService } from '../leads/lead-config.service'
import { moduleActive, PLATFORM_MODULE } from '../plataforma/sistemas'
import { TenantService } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { RastreamentoService } from '../rastreamento/rastreamento.service'
import { SettingsService } from '../settings/settings.service'
import { networkError, safeRequest } from '../trier/http'
import { cleanLoja, DEFAULT_LOJA_STATE, LOJA_KEYS, type LojaCart, type LojaKey, lojaModule, type LojaOrder, type LojaProduct, type LojaSettings, lojaSettingsKey, type LojaState, lojaStateKey } from './lojas'
import { LOJA_ADAPTERS } from './provedores'
import type { LojaCtx } from './provedores/tipos'

const TICK_MS = 60_000
/** Clientes, pedidos e carrinhos a cada 15 minutos; produtos a cada 6 horas. */
const SYNC_EVERY_MS = 15 * 60_000
const PRODUCTS_EVERY_MS = 6 * 3_600_000
const MAX_PAGES = 2000
const ORIGIN = 'Ecommerce'
const ENC = 'enc:'
const STATE_TTL_MS = 20 * 60_000
const appKey = (k: LojaKey) => `lojas_app_${k}`

/**
 * Integrações com plataformas de loja virtual (Tray, Nuvemshop e Loja Integrada), no padrão da Magazord: clientes
 * viram leads, pedidos marcam a venda, carrinhos vão para Carrinhos abandonados e produtos para o Catálogo. Só lê a
 * loja. Tray e Nuvemshop usam o aplicativo da SG (chaves guardadas pela plataforma) e a loja autoriza pelo Conectar.
 */
@Injectable()
export class LojasService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LojasService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly running = new Set<string>()
  /** Trocado nos testes. */
  getter: typeof safeRequest = safeRequest

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly tenants: TenantService,
    private readonly capture: LeadCaptureService,
    private readonly scoring: LeadConfigService,
    private readonly tracking: RastreamentoService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private adapter(key: string) {
    if (!(LOJA_KEYS as readonly string[]).includes(key)) throw new NotFoundException('Integração não encontrada.')
    return LOJA_ADAPTERS[key as LojaKey]
  }

  private assertCan(user: AuthUser, key: LojaKey, action: 'view' | 'edit' = 'view') {
    if (!can(user.permissions, user.role.isSystem, lojaModule(key), action)) throw new ForbiddenException(`Você não tem permissão para a integração com ${LOJA_ADAPTERS[key].def.name}.`)
  }

  /** Administração da plataforma (empresa dona + permissão "plataforma"): configura o aplicativo da SG. */
  private async isPlatformUser(user: AuthUser) {
    const t = await this.tenants.info(user.tenantId)
    return t.isPlatform && can(user.permissions, user.role.isSystem, PLATFORM_MODULE, 'edit')
  }

  async config(tenantId: string, key: LojaKey): Promise<LojaSettings> {
    return cleanLoja(await this.settings.get<Partial<LojaSettings>>(tenantId, lojaSettingsKey(key), {}))
  }
  async state(tenantId: string, key: LojaKey): Promise<LojaState> {
    const s = await this.settings.get<Partial<LojaState>>(tenantId, lojaStateKey(key), {})
    return { ...DEFAULT_LOJA_STATE, ...s, totals: { ...DEFAULT_LOJA_STATE.totals, ...(s.totals ?? {}) } }
  }
  private async saveState(tenantId: string, key: LojaKey, patch: Partial<LojaState>) {
    const next = { ...(await this.state(tenantId, key)), ...patch }
    await this.settings.set(tenantId, lojaStateKey(key), next)
    return next
  }

  private open(values: Record<string, string>) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (!v.startsWith(ENC)) out[k] = v
      else
        try {
          out[k] = decrypt(v.slice(ENC.length))
        } catch {
          // chave de criptografia trocada: o valor precisa ser informado de novo
        }
    }
    return out
  }

  /** Guardado criptografado: os campos secretos e tudo o que não é campo da tela (tokens). */
  private isSecret(key: LojaKey, field: string) {
    const f = LOJA_ADAPTERS[key].def.fields.find((x) => x.key === field)
    return !f || !!f.secret
  }

  // ---------- Aplicativo da SG (chaves guardadas na empresa da plataforma) ----------

  private async platformId() {
    return (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id ?? null
  }

  private async appValues(key: LojaKey): Promise<Record<string, string>> {
    const pid = await this.platformId()
    if (!pid) return {}
    return this.open(await this.settings.get<Record<string, string>>(pid, appKey(key), {}))
  }

  async saveApp(user: AuthUser, key: string, values: Record<string, string>, ctx: RequestCtx) {
    const a = this.adapter(key)
    if (!(await this.isPlatformUser(user))) throw new ForbiddenException('Só a administração da plataforma configura o aplicativo.')
    const cur = await this.settings.get<Record<string, string>>(user.tenantId, appKey(a.def.key), {})
    const next = { ...cur }
    for (const f of a.def.appFields) {
      const v = values[f.key]?.trim()
      if (!v) continue
      if (v.length > 2000 || /[\u0000-\u001f]/.test(v)) throw new BadRequestException(`${f.label}: valor inválido.`)
      next[f.key] = f.secret ? ENC + encrypt(v) : v
    }
    await this.settings.set(user.tenantId, appKey(a.def.key), next)
    await this.audit.byUser(user, ctx, `${lojaModule(a.def.key)}.aplicativo`, 'setting', undefined, { campos: Object.keys(values).filter((k) => values[k]?.trim()) })
    return { ok: true }
  }

  /** Endereço de volta da autorização: o painel da plataforma (o mesmo cadastrado no aplicativo da SG). */
  redirectUri(key: LojaKey) {
    const base = env.platformAdminHost ? `https://${env.platformAdminHost}` : env.appUrl
    return `${base.replace(/\/+$/, '')}/api/lojas/${key}/oauth/retorno`
  }

  // ---------- Contexto do adaptador ----------

  private ctx(tenantId: string, key: LojaKey, s: LojaSettings, app: Record<string, string>): LojaCtx {
    const values = this.open(s.values)
    return {
      values,
      app,
      request: async (url, o = {}) => {
        try {
          return await this.getter(url, { method: o.method, body: o.body, headers: o.headers, timeoutMs: 30_000, maxBytes: 20 * 1024 * 1024, allowIp: null })
        } catch (e) {
          throw new Error(networkError(e).replace(/Trier/g, LOJA_ADAPTERS[key].def.name).replace(/da farmácia/g, 'da loja'))
        }
      },
      save: async (patch) => {
        const cur = await this.config(tenantId, key)
        const next = { ...cur.values }
        for (const [k, v] of Object.entries(patch)) {
          next[k] = this.isSecret(key, k) && v ? ENC + encrypt(v) : v
          values[k] = v
        }
        await this.settings.set(tenantId, lojaSettingsKey(key), { ...cur, values: next })
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }
  }

  // ---------- Tela ----------

  async view(user: AuthUser, key: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key)
    const [s, st, app] = await Promise.all([this.config(user.tenantId, a.def.key), this.state(user.tenantId, a.def.key), this.appValues(a.def.key)])
    const platform = await this.isPlatformUser(user)
    return {
      def: { key: a.def.key, name: a.def.name, oauth: a.def.oauth, fields: a.def.fields, supports: a.def.supports, howTo: a.def.howTo, appFields: platform ? a.def.appFields : [] },
      enabled: s.enabled,
      values: Object.fromEntries(a.def.fields.map((f) => [f.key, f.secret ? '' : (s.values[f.key] ?? '')])),
      saved: Object.fromEntries(a.def.fields.filter((f) => f.secret).map((f) => [f.key, !!s.values[f.key]])),
      importCustomers: s.importCustomers,
      importOrders: s.importOrders,
      importCarts: s.importCarts,
      importProducts: s.importProducts,
      abandonHours: s.abandonHours,
      // O aplicativo da SG está configurado? (sem mostrar as chaves)
      appReady: !a.def.oauth || a.def.appFields.filter((f) => !f.optional).every((f) => !!app[f.key]),
      app: platform ? Object.fromEntries(a.def.appFields.map((f) => [f.key, f.secret ? (app[f.key] ? '(guardado)' : '') : (app[f.key] ?? '')])) : null,
      redirectUri: a.def.oauth ? this.redirectUri(a.def.key) : null,
      connected: a.def.oauth ? !!(this.open(s.values).accessToken) : null,
      state: st,
    }
  }

  async save(user: AuthUser, key: string, dto: Partial<LojaSettings> & { values?: Record<string, string> }, ctx: RequestCtx) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    const cur = await this.config(user.tenantId, a.def.key)
    const values = { ...cur.values }
    for (const f of a.def.fields) {
      const raw = dto.values?.[f.key]
      if (raw === undefined) continue
      const v = raw.trim()
      if (f.secret && !v) continue
      if (v.length > 4000 || /[\u0000-\u001f]/.test(v)) throw new BadRequestException(`${f.label}: valor inválido.`)
      values[f.key] = f.secret ? ENC + encrypt(v) : v
    }
    const next = cleanLoja({ ...cur, ...dto, values }, cur)
    const missing = a.def.fields.filter((f) => !f.optional && !next.values[f.key])
    if (next.enabled && missing.length) throw new BadRequestException(`Para ligar, preencha: ${missing.map((f) => f.label).join(', ')}.`)
    if (next.enabled && a.def.oauth && !this.open(next.values).accessToken) throw new BadRequestException(`Para ligar, conecte a loja (botão Conectar) antes.`)
    await this.settings.set(user.tenantId, lojaSettingsKey(a.def.key), next)
    await this.audit.byUser(user, ctx, `${lojaModule(a.def.key)}.configuracao`, 'setting', undefined, { ligado: next.enabled, clientes: next.importCustomers, pedidos: next.importOrders, carrinhos: next.importCarts, produtos: next.importProducts })
    return { ok: true }
  }

  async test(user: AuthUser, key: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    const s = await this.config(user.tenantId, a.def.key)
    try {
      const message = await a.test(this.ctx(user.tenantId, a.def.key, s, await this.appValues(a.def.key)))
      await this.saveState(user.tenantId, a.def.key, { lastOkAt: new Date().toISOString() })
      return { ok: true, message }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }

  async syncNow(user: AuthUser, key: string, ctx: RequestCtx) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    const s = await this.config(user.tenantId, a.def.key)
    if (!s.enabled) throw new BadRequestException(`Ligue a integração com ${a.def.name} antes.`)
    if (this.running.has(`${user.tenantId}:${a.def.key}`)) return { started: false, message: 'Já existe uma sincronização em andamento.' }
    await this.audit.byUser(user, ctx, `${lojaModule(a.def.key)}.sincronizar`, 'setting')
    void this.run(user.tenantId, a.def.key, true)
    return { started: true, message: 'Sincronização iniciada. Acompanhe nesta tela.' }
  }

  // ---------- OAuth ----------

  async authorize(user: AuthUser, key: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    if (!a.authorizeUrl) throw new BadRequestException('Esta integração não usa autorização.')
    const app = await this.appValues(a.def.key)
    if (a.def.appFields.some((f) => !f.optional && !app[f.key])) throw new BadRequestException(`O aplicativo da SG Multiconecta na ${a.def.name} ainda não está configurado. Fale com a SG Multiconecta.`)
    const s = await this.config(user.tenantId, a.def.key)
    const missing = a.def.fields.filter((f) => !f.optional && !s.values[f.key])
    if (missing.length) throw new BadRequestException(`Salve antes: ${missing.map((f) => f.label).join(', ')}.`)
    const state = Buffer.from(encrypt(`${user.tenantId}.${a.def.key}.${Date.now()}.${randomBytes(8).toString('hex')}`)).toString('base64url')
    return { url: a.authorizeUrl(this.ctx(user.tenantId, a.def.key, s, app), this.redirectUri(a.def.key), state) }
  }

  /**
   * Volta da autorização (rota pública, no endereço do painel da plataforma, que é o cadastrado no aplicativo). A
   * empresa sai do "state" criptografado com a chave do sistema (gerado por um usuário logado da empresa), conferido
   * aqui. Devolve o endereço da tela da integração na empresa.
   */
  async oauthReturn(key: string, params: Record<string, string>) {
    const a = this.adapter(key)
    if (!a.exchange) throw new BadRequestException('Esta integração não usa autorização.')
    let parts: string[]
    try {
      parts = decrypt(Buffer.from(params.state ?? '', 'base64url').toString('utf8')).split('.')
    } catch {
      throw new BadRequestException('Autorização inválida. Clique em Conectar de novo.')
    }
    const [tenantId, k, at] = parts
    if (parts.length !== 4 || !tenantId || k !== a.def.key) throw new BadRequestException('Autorização inválida. Clique em Conectar de novo.')
    const back = `${await this.tenants.url(tenantId)}/loja/${a.def.key}`
    if (Date.now() - Number(at) > STATE_TTL_MS) return { back, error: 'A autorização expirou. Clique em Conectar de novo.' }
    try {
      const s = await this.config(tenantId, a.def.key)
      await a.exchange(this.ctx(tenantId, a.def.key, s, await this.appValues(a.def.key)), params, this.redirectUri(a.def.key))
      await this.saveState(tenantId, a.def.key, { connectedAt: new Date().toISOString(), lastError: null })
      return { back, error: null }
    } catch (e) {
      return { back, error: (e as Error).message || 'Não foi possível concluir a autorização.' }
    }
  }

  // ---------- Sincronização ----------

  async tick(now = new Date()) {
    try {
      const rows = await this.prisma.tenantSetting.findMany({ where: { key: { in: LOJA_KEYS.map(lojaSettingsKey) } }, select: { tenantId: true, key: true, value: true } })
      for (const r of rows) {
        const key = r.key.slice(5) as LojaKey
        if (!cleanLoja(r.value as Partial<LojaSettings>).enabled || this.running.has(`${r.tenantId}:${key}`)) continue
        const t = await this.tenants.info(r.tenantId).catch(() => null)
        if (!t || !moduleActive(t, lojaModule(key), now.getTime())) continue
        const st = await this.state(r.tenantId, key)
        if (st.lastRunAt && now.getTime() - Date.parse(st.lastRunAt) < SYNC_EVERY_MS) continue
        await this.run(r.tenantId, key, false)
      }
    } catch (e) {
      this.logger.warn(`Lojas: rotina: ${(e as Error).message}`)
    }
  }

  private async run(tenantId: string, key: LojaKey, forceProducts: boolean) {
    const id = `${tenantId}:${key}`
    if (this.running.has(id)) return
    this.running.add(id)
    const a = LOJA_ADAPTERS[key]
    try {
      await this.saveState(tenantId, key, { running: true, lastRunAt: new Date().toISOString() })
      const s = await this.config(tenantId, key)
      const c = this.ctx(tenantId, key, s, await this.appValues(key))
      if (s.importCustomers && a.def.supports.customers) await this.syncCustomers(tenantId, key, s, c)
      if (s.importOrders && a.def.supports.orders) await this.syncOrders(tenantId, key, s, c)
      if (s.importCarts && a.def.supports.carts && a.carts) await this.syncCarts(tenantId, key, s, c)
      const st = await this.state(tenantId, key)
      if (s.importProducts && a.def.supports.products && (forceProducts || !st.productsAt || Date.now() - Date.parse(st.productsAt) >= PRODUCTS_EVERY_MS)) await this.syncProducts(tenantId, key, c)
      await this.saveState(tenantId, key, { running: false, lastOkAt: new Date().toISOString(), lastError: null })
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500)
      this.logger.warn(`${key} (${tenantId}): ${msg}`)
      await this.saveState(tenantId, key, { running: false, lastError: msg }).catch(() => undefined)
    } finally {
      this.running.delete(id)
    }
  }

  /** Cursor com 5 minutos de folga (relógios diferentes). */
  private since(cursor: string | null) {
    return cursor ? new Date(Date.parse(cursor) - 5 * 60_000) : null
  }

  private async syncCustomers(tenantId: string, key: LojaKey, s: LojaSettings, c: LojaCtx) {
    const started = new Date()
    let st = await this.state(tenantId, key)
    const since = this.since(st.customersCursor)
    for (let page = 1; page <= MAX_PAGES; page++) {
      const p = await LOJA_ADAPTERS[key].customers(c, since, page)
      let created = 0
      for (const cu of p.items) if ((await this.upsertCustomer(tenantId, s, cu)).created) created++
      st = await this.saveState(tenantId, key, { totals: { ...st.totals, customers: st.totals.customers + p.items.length, leadsCreated: st.totals.leadsCreated + created } })
      if (!p.more || !p.items.length) break
    }
    await this.saveState(tenantId, key, { customersCursor: started.toISOString() })
  }

  /** Cliente da loja vira lead (origem "Ecommerce"); já ligado: só completa dados em branco. */
  async upsertCustomer(tenantId: string, s: LojaSettings, c: CustomerData): Promise<{ leadId: string | null; created: boolean }> {
    const linked = await this.prisma.lead.findFirst({ where: { tenantId, ecommerceId: c.externalId, deletedAt: null }, orderBy: { createdAt: 'asc' } })
    if (linked) {
      if (linked.anonymizedAt) return { leadId: null, created: false }
      const data: Prisma.LeadUncheckedUpdateInput = {}
      const phone = c.phone ? normalizePhone(c.phone) : null
      if (!linked.name && c.name) data.name = c.name
      if (!linked.phone && phone) data.phone = phone
      if (!linked.company && c.company) data.company = c.company
      if (!linked.city && c.city) data.city = c.city
      if (!linked.state && c.state) data.state = c.state
      if (!linked.email && c.email && !(await this.prisma.lead.count({ where: { tenantId, email: c.email } }))) data.email = c.email
      if (Object.keys(data).length) await this.prisma.lead.update({ where: { id: linked.id }, data })
      return { leadId: linked.id, created: false }
    }
    const result = await this.capture.capture(tenantId, c, {
      title: 'Cadastrou-se na loja virtual',
      originName: ORIGIN,
      touch: { source: 'ecommerce', medium: 'cadastro', landing: 'Cadastro na loja virtual' },
      details: { clienteLoja: c.externalId },
      tags: s.tags,
      occurredAt: c.registeredAt ?? undefined,
    })
    if (!result) return { leadId: null, created: false }
    await this.prisma.lead.update({ where: { id: result.leadId }, data: { ecommerceId: c.externalId } })
    return result
  }

  private async leadFor(tenantId: string, s: LojaSettings, customerId: string | null, customer: CustomerData | null) {
    if (customerId) {
      const linked = await this.prisma.lead.findFirst({ where: { tenantId, ecommerceId: customerId, deletedAt: null }, select: { id: true } })
      if (linked) return linked.id
    }
    return customer ? (await this.upsertCustomer(tenantId, s, customer)).leadId : null
  }

  private async syncOrders(tenantId: string, key: LojaKey, s: LojaSettings, c: LojaCtx) {
    const started = new Date()
    let st = await this.state(tenantId, key)
    const since = this.since(st.ordersCursor)
    for (let page = 1; page <= MAX_PAGES; page++) {
      const p = await LOJA_ADAPTERS[key].orders(c, since, page)
      for (const o of p.items) await this.upsertOrder(tenantId, key, s, c, o)
      st = await this.saveState(tenantId, key, { totals: { ...st.totals, orders: st.totals.orders + p.items.length } })
      if (!p.more || !p.items.length) break
    }
    await this.saveState(tenantId, key, { ordersCursor: started.toISOString() })
  }

  private async upsertOrder(tenantId: string, key: LojaKey, s: LojaSettings, c: LojaCtx, o: LojaOrder) {
    const before = await this.prisma.ecommerceOrder.findUnique({ where: { tenantId_externalId: { tenantId, externalId: o.externalId } } })
    const leadId = before?.leadId ?? (await this.leadFor(tenantId, s, o.customerId, o.customer))
    let items = o.items
    if (!items && !before?.itemsAt && LOJA_ADAPTERS[key].orderItems) items = await LOJA_ADAPTERS[key].orderItems!(c, o.externalId).catch(() => null)
    const data = {
      code: o.code.slice(0, 60),
      leadId,
      customerId: o.customerId,
      orderedAt: o.orderedAt,
      total: o.total,
      statusCode: 0,
      statusName: o.statusName.slice(0, 80),
      statusGroup: o.statusGroup,
      payment: o.payment?.slice(0, 80) ?? null,
      channel: o.channel?.slice(0, 60) ?? LOJA_ADAPTERS[key].def.name,
      ...(items ? { itemsAt: new Date() } : {}),
    }
    const saved = await this.prisma.ecommerceOrder.upsert({ where: { tenantId_externalId: { tenantId, externalId: o.externalId } }, create: { tenantId, externalId: o.externalId, ...data }, update: data })
    if (items) {
      await this.prisma.$transaction([
        this.prisma.ecommerceOrderItem.deleteMany({ where: { orderId: saved.id } }),
        this.prisma.ecommerceOrderItem.createMany({ data: items.map((l) => ({ tenantId, orderId: saved.id, ...l })) }),
      ])
    }
    await this.prisma.ecommerceCart.updateMany({ where: { tenantId, orderCode: data.code, status: { not: 3 } }, data: { status: 3 } })
    if (!leadId || o.statusGroup !== 'pago' || before?.statusGroup === 'pago') return
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead || lead.anonymizedAt) return
    const update: Prisma.LeadUncheckedUpdateInput = {
      stage: 'CLIENTE',
      lastActivityAt: !lead.lastActivityAt || lead.lastActivityAt < o.orderedAt ? o.orderedAt : lead.lastActivityAt,
      tags: lead.tags.filter((t) => t !== 'checkout-iniciado' && t !== 'carrinho-abandonado'),
      events: {
        create: {
          tenantId,
          type: 'venda',
          title: `Comprou na loja virtual: pedido ${data.code} — ${o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          data: { pedido: data.code, valor: o.total, situacao: data.statusName, pagamento: data.payment, loja: LOJA_ADAPTERS[key].def.name } as Prisma.InputJsonValue,
          occurredAt: o.orderedAt,
        },
      },
    }
    if (!lead.lastSaleAt || lead.lastSaleAt <= o.orderedAt) {
      update.lastSaleAt = o.orderedAt
      update.lastSaleValue = o.total
    }
    await this.prisma.lead.update({ where: { id: leadId }, data: update })
    await this.prisma.ecommerceCart.updateMany({ where: { tenantId, leadId, contactStatus: 'CONTATADO', lastActivityAt: { lte: o.orderedAt } }, data: { contactStatus: 'RECUPERADO' } })
    await this.scoring.rescore(tenantId, [leadId])
  }

  private async syncCarts(tenantId: string, key: LojaKey, s: LojaSettings, c: LojaCtx) {
    const started = new Date()
    let st = await this.state(tenantId, key)
    const since = this.since(st.cartsCursor)
    for (let page = 1; page <= MAX_PAGES; page++) {
      const p = await LOJA_ADAPTERS[key].carts!(c, since, page)
      for (const cart of p.items) await this.upsertCart(tenantId, s, cart)
      st = await this.saveState(tenantId, key, { totals: { ...st.totals, carts: st.totals.carts + p.items.length } })
      if (!p.more || !p.items.length) break
    }
    await this.saveState(tenantId, key, { cartsCursor: started.toISOString() })
    await this.markAbandoned(tenantId, s)
  }

  private async upsertCart(tenantId: string, s: LojaSettings, c: LojaCart) {
    const leadId = await this.leadFor(tenantId, s, c.customerId, c.customer)
    const before = await this.prisma.ecommerceCart.findUnique({ where: { tenantId_externalId: { tenantId, externalId: c.externalId } } })
    const status = c.orderCode ? 3 : c.abandoned ? 2 : 1
    const data = {
      status,
      leadId,
      customerId: c.customerId,
      customerName: c.customer?.name?.slice(0, 160) ?? null,
      customerEmail: c.customer?.email?.slice(0, 200) ?? null,
      customerPhone: c.customer?.phone ? normalizePhone(c.customer.phone) : null,
      startedAt: c.startedAt,
      lastActivityAt: c.lastActivityAt,
      checkoutStarted: before?.checkoutStarted === true || c.abandoned,
      checkoutUrl: c.checkoutUrl,
      items: c.items as unknown as Prisma.InputJsonValue,
      itemCount: c.items.reduce((n, i) => n + i.qty, 0),
      value: c.value,
      orderCode: c.orderCode?.slice(0, 60) ?? null,
      ...(status === 3 && before?.contactStatus === 'CONTATADO' ? { contactStatus: 'RECUPERADO' } : {}),
    }
    await this.prisma.ecommerceCart.upsert({ where: { tenantId_externalId: { tenantId, externalId: c.externalId } }, create: { tenantId, externalId: c.externalId, ...data }, update: data })
    if (leadId && data.checkoutStarted && status !== 3) await this.tracking.tagLead(leadId, ['checkout-iniciado'], [])
  }

  /** Carrinho abandonado (a loja marcou ou está aberto sem atividade além do prazo): uma vez na linha do tempo. */
  private async markAbandoned(tenantId: string, s: LojaSettings) {
    const limit = new Date(Date.now() - s.abandonHours * 3_600_000)
    const carts = await this.prisma.ecommerceCart.findMany({
      where: { tenantId, leadId: { not: null }, externalId: { contains: ':' }, OR: [{ status: 2 }, { status: 1, lastActivityAt: { lt: limit } }], itemCount: { gt: 0 } },
      select: { leadId: true, items: true, lastActivityAt: true, externalId: true },
    })
    for (const c of carts) {
      const already = await this.prisma.leadEvent.count({ where: { leadId: c.leadId!, type: 'carrinho_abandonado', data: { path: ['carrinho'], equals: c.externalId } } })
      if (already) continue
      const names = ((c.items as unknown as { name: string }[]) ?? []).map((i) => i.name)
      await this.prisma.leadEvent.create({
        data: {
          tenantId,
          leadId: c.leadId!,
          type: 'carrinho_abandonado',
          title: `Abandonou o carrinho: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` e mais ${names.length - 3}` : ''}`.slice(0, 300),
          data: { carrinho: c.externalId, itens: c.items } as Prisma.InputJsonValue,
          occurredAt: c.lastActivityAt ?? new Date(),
        },
      })
      await this.tracking.tagLead(c.leadId!, ['carrinho-abandonado'], [])
    }
  }

  private async syncProducts(tenantId: string, key: LojaKey, c: LojaCtx) {
    const started = new Date()
    let count = 0
    for (let page = 1; page <= MAX_PAGES; page++) {
      const p = await LOJA_ADAPTERS[key].products(c, page)
      for (const pr of p.items) await this.upsertProduct(tenantId, pr, started)
      count += p.items.length
      if (!p.more || !p.items.length) break
    }
    // Produtos desta loja que não vieram nesta cópia: inativos no Catálogo.
    await this.prisma.storeProduct.updateMany({ where: { tenantId, externalId: { startsWith: `${key}:` }, syncedAt: { lt: started } }, data: { active: false } })
    const st = await this.state(tenantId, key)
    await this.saveState(tenantId, key, { productsAt: started.toISOString(), totals: { ...st.totals, products: count } })
  }

  private async upsertProduct(tenantId: string, p: LojaProduct, syncedAt: Date) {
    const data = { code: p.code.slice(0, 60), name: p.name.slice(0, 300), brand: p.brand?.slice(0, 120) ?? null, price: p.price, priceFrom: p.priceFrom, stock: p.stock === null ? null : Math.round(p.stock), image: p.image, url: p.url, active: p.active, syncedAt }
    await this.prisma.storeProduct.upsert({ where: { tenantId_externalId: { tenantId, externalId: p.externalId } }, create: { tenantId, externalId: p.externalId, ...data }, update: data })
  }
}
