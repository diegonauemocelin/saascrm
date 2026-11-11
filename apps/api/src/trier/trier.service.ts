import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { isIP } from 'node:net'
import { AuditService } from '../audit/audit.service'
import { decrypt, encrypt } from '../common/crypto'
import type { RequestCtx } from '../common/decorators'
import { can } from '../common/permissions'
import type { AuthUser } from '../common/types'
import { privateIp } from '../fretes/download'
import { Prisma } from '../generated/prisma/client'
import { moduleActive, PLATFORM_MODULE } from '../plataforma/sistemas'
import { TenantService } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { HttpStatusError, networkError, safeGet, vpnEligibleIp } from './http'
import {
  changedWindow,
  cleanTrier,
  cleanVpnAddress,
  DEFAULT_TRIER,
  DEFAULT_TRIER_STATE,
  DEFAULT_TRIER_VPN,
  effectiveValues,
  fold,
  hostPort,
  nextSync,
  normalizeBaseUrl,
  pageParams,
  productFromTrier,
  rowsOf,
  stockFromTrier,
  TRIER_KEY,
  TRIER_MAX_BYTES,
  TRIER_MAX_PAGES,
  TRIER_PAGE_SIZE,
  TRIER_STATE_KEY,
  TRIER_TIMEOUT_MS,
  TRIER_VPN_KEY,
  trierHttpError,
  type TrierProductData,
  type TrierRoute,
  type TrierSettings,
  type TrierState,
  trierUrl,
  type TrierVpn,
  vpnStatus,
} from './trier'

const TICK_MS = 60_000
const LIST_PAGE = 50
const MODULE = 'erp_trier'

/** Quem quer saber dos produtos alterados (Publicar do ERP atualiza preço e estoque dos anúncios). */
export type TrierChangeListener = (tenantId: string, codes: string[] | 'all') => Promise<void>

export interface TrierSaveInput {
  enabled: boolean
  baseUrl?: string
  token?: string
  ecommerceOnly?: boolean
  useEcommerceValues?: boolean
  importCost?: boolean
  fullEveryHours?: number
  incrementalMinutes?: number
}

export interface TrierListQuery {
  term?: string
  ecommerce?: 'sim' | 'nao' | 'todos'
  inStock?: boolean
  inactive?: boolean
  department?: string
  page?: number
}

/**
 * Trier (ERP de farmácias): o CRM chama o servidor da farmácia (API REST da Trier, token Bearer), copia os produtos e
 * o estoque (cópia completa a cada 6 h e alterados a cada 15 min, por empresa com o módulo no plano) e avisa quem
 * publica no Mercado Livre. Endereço interno só pela liberação da plataforma (acesso pela VPN).
 */
@Injectable()
export class TrierService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TrierService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly running = new Set<string>()
  private readonly listeners: TrierChangeListener[] = []
  /** Trocado nos testes. */
  getter: typeof safeGet = safeGet

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly tenants: TenantService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  onProductsChanged(fn: TrierChangeListener) {
    this.listeners.push(fn)
  }

  // ---------- Configuração ----------

  async config(tenantId: string): Promise<TrierSettings> {
    return cleanTrier(await this.settings.get<Partial<TrierSettings>>(tenantId, TRIER_KEY, {}), DEFAULT_TRIER)
  }
  async state(tenantId: string): Promise<TrierState> {
    return { ...DEFAULT_TRIER_STATE, ...(await this.settings.get<Partial<TrierState>>(tenantId, TRIER_STATE_KEY, {})) }
  }
  private async saveState(tenantId: string, patch: Partial<TrierState>) {
    await this.settings.set(tenantId, TRIER_STATE_KEY, { ...(await this.state(tenantId)), ...patch })
  }
  private async vpn(tenantId: string): Promise<TrierVpn> {
    return { ...DEFAULT_TRIER_VPN, ...(await this.settings.get<Partial<TrierVpn>>(tenantId, TRIER_VPN_KEY, {})) }
  }

  private vpnStatusOf(baseUrl: string, vpn: TrierVpn) {
    return baseUrl ? vpnStatus(baseUrl, vpn, privateIp, vpnEligibleIp, (h) => isIP(h) > 0) : 'publico'
  }

  private assertView(user: AuthUser, action: 'view' | 'edit' = 'view') {
    if (!can(user.permissions, user.role.isSystem, MODULE, action)) throw new ForbiddenException('Você não tem permissão para a integração com a Trier.')
  }

  async view(user: AuthUser) {
    this.assertView(user)
    const [s, st, vpn] = await Promise.all([this.config(user.tenantId), this.state(user.tenantId), this.vpn(user.tenantId)])
    const status = this.vpnStatusOf(s.baseUrl, vpn)
    const removed = await this.prisma.trierProduct.count({ where: { tenantId: user.tenantId, removedAt: { not: null } } })
    return {
      enabled: s.enabled,
      baseUrl: s.baseUrl,
      hasToken: !!s.tokenEnc,
      ecommerceOnly: s.ecommerceOnly,
      useEcommerceValues: s.useEcommerceValues,
      importCost: s.importCost,
      fullEveryHours: s.fullEveryHours,
      incrementalMinutes: s.incrementalMinutes,
      vpn: { status, allowed: vpn.allowed },
      state: { ...st, removed },
    }
  }

  async save(user: AuthUser, dto: TrierSaveInput, ctx: RequestCtx) {
    this.assertView(user, 'edit')
    const cur = await this.config(user.tenantId)
    let baseUrl = cur.baseUrl
    if (dto.baseUrl !== undefined) {
      try {
        baseUrl = dto.baseUrl.trim() ? normalizeBaseUrl(dto.baseUrl) : ''
      } catch (e) {
        throw new BadRequestException((e as Error).message)
      }
    }
    const token = dto.token?.trim()
    if (token !== undefined && token && (token.length < 8 || token.length > 4000 || /\s/.test(token))) throw new BadRequestException('Token inválido: copie o token completo fornecido pela Trier.')
    const next = cleanTrier({ ...dto, baseUrl, tokenEnc: token ? encrypt(token) : cur.tokenEnc }, cur)
    if (next.enabled && (!next.baseUrl || !next.tokenEnc)) throw new BadRequestException('Para ligar, informe o endereço do servidor da Trier e o token.')
    if (next.baseUrl && this.vpnStatusOf(next.baseUrl, await this.vpn(user.tenantId)) === 'bloqueado') throw new BadRequestException('Endereço não permitido (loopback, link-local ou reservado).')
    await this.settings.set(user.tenantId, TRIER_KEY, next)
    // Endereço novo: a próxima rodada faz a cópia completa.
    if (baseUrl !== cur.baseUrl) await this.saveState(user.tenantId, { lastFullAt: null, lastIncrementalAt: null, lastError: null })
    await this.audit.byUser(user, ctx, 'erp_trier.configuracao', 'setting', undefined, { ...next, tokenEnc: next.tokenEnc ? '(guardado)' : null, tokenAlterado: !!token })
    return this.view(user)
  }

  // ---------- Chamadas à Trier ----------

  private async get(tenantId: string, s: TrierSettings, route: TrierRoute, params: Record<string, string | number | boolean>): Promise<Record<string, unknown>[]> {
    if (!s.baseUrl || !s.tokenEnc) throw new Error('Integração com a Trier sem endereço ou token.')
    const vpn = await this.vpn(tenantId)
    const status = this.vpnStatusOf(s.baseUrl, vpn)
    if (status === 'aguardando') throw new Error('Acesso pela VPN: aguardando liberação da plataforma para este IP e porta.')
    if (status === 'bloqueado') throw new Error('Endereço não permitido (loopback, link-local ou reservado).')
    const allowIp = status === 'liberado' ? hostPort(s.baseUrl).host : null
    let text: string
    try {
      text = await this.getter(trierUrl(s.baseUrl, route, params), { headers: { Authorization: `Bearer ${decrypt(s.tokenEnc)}` }, timeoutMs: TRIER_TIMEOUT_MS, maxBytes: TRIER_MAX_BYTES, allowIp })
    } catch (e) {
      if (e instanceof HttpStatusError) throw Object.assign(new Error(trierHttpError(e.status)), { status: e.status })
      throw new Error(networkError(e))
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error('A Trier respondeu algo que não é JSON. Confira o endereço (padrão: http://<ip-ou-ddns>:4647/sgfpod1).')
    }
    return rowsOf(body)
  }

  /** Lê todas as páginas de uma rota, chamando onPage a cada uma. */
  private async paged(tenantId: string, s: TrierSettings, firstIndex: 0 | 1, route: TrierRoute, extra: Record<string, string | number | boolean>, onPage: (rows: Record<string, unknown>[]) => Promise<void>) {
    let total = 0
    for (let page = 0; page < TRIER_MAX_PAGES; page++) {
      const rows = await this.get(tenantId, s, route, { ...extra, ...pageParams(page, firstIndex) })
      total += rows.length
      if (rows.length) await onPage(rows)
      if (rows.length < TRIER_PAGE_SIZE) return total
    }
    throw new Error(`A Trier devolveu mais de ${TRIER_MAX_PAGES} páginas em ${route}: cópia interrompida.`)
  }

  /** Testar conexão: 1 produto; descobre se o primeiro registro é 0 ou 1. */
  async test(user: AuthUser) {
    this.assertView(user, 'edit')
    const s = await this.config(user.tenantId)
    if (!s.baseUrl || !s.tokenEnc) throw new BadRequestException('Salve o endereço e o token antes de testar.')
    for (const firstIndex of [0, 1] as const) {
      try {
        const rows = await this.get(user.tenantId, s, 'produto/obter-todos-v1', { primeiroRegistro: firstIndex, quantidadeRegistros: 1 })
        await this.saveState(user.tenantId, { firstIndex, lastOkAt: new Date().toISOString() })
        const p = rows[0] ? productFromTrier(rows[0], { importCost: false }) : null
        return { ok: true, message: p ? `Conexão OK. Primeiro produto: ${p.code} — ${p.name}.` : 'Conexão OK, mas a Trier não devolveu produtos.' }
      } catch (e) {
        if ((e as { status?: number }).status === 400 && firstIndex === 0) continue
        return { ok: false, message: (e as Error).message }
      }
    }
    return { ok: false, message: 'A Trier recusou a consulta de produtos.' }
  }

  // ---------- Sincronização ----------

  async tick(now = new Date()) {
    try {
      const rows = await this.prisma.tenantSetting.findMany({ where: { key: TRIER_KEY }, select: { tenantId: true, value: true } })
      for (const r of rows) {
        const s = cleanTrier(r.value as Partial<TrierSettings>)
        if (!s.enabled || this.running.has(r.tenantId)) continue
        const t = await this.tenants.info(r.tenantId).catch(() => null)
        if (!t || !moduleActive(t, MODULE, now.getTime())) continue
        const due = nextSync(now, await this.state(r.tenantId), s)
        if (due) await this.run(r.tenantId, due, now)
      }
    } catch (e) {
      this.logger.warn(`Trier: rotina: ${(e as Error).message}`)
    }
  }

  async syncNow(user: AuthUser, ctx: RequestCtx) {
    this.assertView(user, 'edit')
    const s = await this.config(user.tenantId)
    if (!s.enabled) throw new BadRequestException('Ligue a integração com a Trier antes.')
    if (this.running.has(user.tenantId)) return { started: false, message: 'Já existe uma cópia em andamento.' }
    await this.audit.byUser(user, ctx, 'erp_trier.copiar_agora', 'setting')
    void this.run(user.tenantId, 'full', new Date())
    return { started: true, message: 'Cópia completa iniciada. Acompanhe a situação nesta tela.' }
  }

  private async run(tenantId: string, kind: 'full' | 'incremental', now: Date) {
    if (this.running.has(tenantId)) return
    this.running.add(tenantId)
    await this.saveState(tenantId, { running: kind, runningSince: now.toISOString() })
    try {
      const s = await this.config(tenantId)
      const st = await this.state(tenantId)
      if (kind === 'full') await this.full(tenantId, s, st.firstIndex, now)
      else await this.incremental(tenantId, s, st, now)
    } catch (e) {
      const msg = (e as Error).message.slice(0, 400)
      this.logger.warn(`Trier (${tenantId}): ${msg}`)
      await this.saveState(tenantId, { lastError: msg, lastErrorAt: new Date().toISOString() })
    } finally {
      this.running.delete(tenantId)
      await this.saveState(tenantId, { running: null, runningSince: null }).catch(() => undefined)
    }
  }

  private async full(tenantId: string, s: TrierSettings, firstIndex: 0 | 1, runAt: Date) {
    await this.paged(tenantId, s, firstIndex, 'produto/obter-todos-v1', {}, async (rows) => void (await this.storeProducts(tenantId, rows, s, runAt)))
    await this.paged(tenantId, s, firstIndex, 'estoque/obter-todos-v1', {}, async (rows) => void (await this.storeStock(tenantId, rows)))
    await this.prisma.trierProduct.updateMany({ where: { tenantId, seenAt: { lt: runAt }, removedAt: null }, data: { removedAt: new Date() } })
    const products = await this.prisma.trierProduct.count({ where: { tenantId, removedAt: null } })
    await this.saveState(tenantId, { lastFullAt: runAt.toISOString(), lastIncrementalAt: runAt.toISOString(), lastOkAt: new Date().toISOString(), lastError: null, products })
    await this.notify(tenantId, 'all')
  }

  private async incremental(tenantId: string, s: TrierSettings, st: TrierState, now: Date) {
    const win = changedWindow(st, now)
    const codes = new Set<string>()
    await this.paged(tenantId, s, st.firstIndex, 'produto/obter-alterados-v1', win, async (rows) => {
      for (const c of await this.storeProducts(tenantId, rows, s, now)) codes.add(c)
    })
    await this.paged(tenantId, s, st.firstIndex, 'estoque/obter-alterados-v1', win, async (rows) => {
      for (const c of await this.storeStock(tenantId, rows)) codes.add(c)
    })
    const products = await this.prisma.trierProduct.count({ where: { tenantId, removedAt: null } })
    await this.saveState(tenantId, { lastIncrementalAt: now.toISOString(), lastOkAt: new Date().toISOString(), lastError: null, products })
    if (codes.size) await this.notify(tenantId, [...codes])
  }

  private async notify(tenantId: string, codes: string[] | 'all') {
    for (const fn of this.listeners) await fn(tenantId, codes).catch((e) => this.logger.warn(`Trier: aviso de alteração: ${(e as Error).message}`))
  }

  private async storeProducts(tenantId: string, rows: Record<string, unknown>[], s: TrierSettings, seenAt: Date): Promise<string[]> {
    const list = rows.map((r) => productFromTrier(r, { importCost: s.importCost })).filter((p): p is TrierProductData => !!p)
    const now = new Date()
    await this.prisma.$transaction(
      list.map((p) => {
        const data = { ...p, seenAt, syncedAt: now, removedAt: null }
        return this.prisma.trierProduct.upsert({ where: { tenantId_code: { tenantId, code: p.code } }, create: { tenantId, ...data }, update: data })
      }),
    )
    return list.map((p) => p.code)
  }

  private async storeStock(tenantId: string, rows: Record<string, unknown>[]): Promise<string[]> {
    const list = rows.map(stockFromTrier).filter((x): x is { code: string; stock: number } => !!x)
    const now = new Date()
    await this.prisma.$transaction(list.map((x) => this.prisma.trierProduct.updateMany({ where: { tenantId, code: x.code }, data: { stock: x.stock, syncedAt: now } })))
    return list.map((x) => x.code)
  }

  // ---------- Consulta ----------

  /** Preço e estoque que valem para a empresa (e-commerce quando configurado). */
  async effective(tenantId: string, p: { price: Prisma.Decimal | null; ecommercePrice: Prisma.Decimal | null; stock: number | null; ecommerceStock: number | null }, s?: TrierSettings) {
    const cfg = s ?? (await this.config(tenantId))
    return effectiveValues({ price: p.price === null ? null : Number(p.price), ecommercePrice: p.ecommercePrice === null ? null : Number(p.ecommercePrice), stock: p.stock, ecommerceStock: p.ecommerceStock }, cfg.useEcommerceValues)
  }

  async list(user: AuthUser, q: TrierListQuery) {
    this.assertView(user)
    const T = user.tenantId
    const s = await this.config(T)
    const where: Prisma.TrierProductWhereInput = { tenantId: T, ...(q.inactive ? {} : { removedAt: null, active: true }) }
    const term = q.term ? fold(q.term.trim()) : ''
    if (term) where.searchText = { contains: term }
    if (q.ecommerce === 'sim') where.ecommerce = true
    else if (q.ecommerce === 'nao') where.ecommerce = false
    if (q.department) where.department = q.department
    if (q.inStock) where.OR = [{ stock: { gt: 0 } }, { ecommerceStock: { gt: 0 } }]
    const page = Math.max(1, Math.min(q.page ?? 1, 2000))
    const [total, rows, st] = await Promise.all([
      this.prisma.trierProduct.count({ where }),
      this.prisma.trierProduct.findMany({ where, orderBy: [{ name: 'asc' }], skip: (page - 1) * LIST_PAGE, take: LIST_PAGE }),
      this.state(T),
    ])
    const items = await Promise.all(
      rows.map(async (r) => {
        const eff = await this.effective(T, r, s)
        return {
          code: r.code,
          ean: r.ean,
          name: r.name,
          ecommerceName: r.ecommerceName,
          brand: r.brand,
          department: r.department,
          groupName: r.groupName,
          category: r.category,
          classification: r.classification,
          typeName: r.typeName,
          activeIngredient: r.activeIngredient,
          compounded: r.compounded,
          ncm: r.ncm,
          unit: r.unit,
          active: r.active && !r.removedAt,
          ecommerce: r.ecommerce,
          price: eff.price,
          stock: eff.stock,
          erpPrice: r.price === null ? null : Number(r.price),
          erpStock: r.stock,
          dims: { widthMm: r.widthMm, heightMm: r.heightMm, depthMm: r.depthMm, weightG: r.weightG },
          changedAt: r.changedAt,
          syncedAt: r.syncedAt,
        }
      }),
    )
    return { total, page, pageSize: LIST_PAGE, items, sync: { enabled: s.enabled, ...st } }
  }

  /** Valores distintos de departamento, grupo e categoria (filtro "o que pode ser publicado"). */
  async values(tenantId: string) {
    const by = async (field: 'department' | 'groupName' | 'category') => {
      const g = await this.prisma.trierProduct.groupBy({ by: [field], where: { tenantId, removedAt: null, [field]: { not: null } }, _count: { _all: true } })
      return g.map((x) => ({ value: (x as Record<string, unknown>)[field] as string, count: x._count._all })).sort((a, b) => a.value.localeCompare(b.value, 'pt-BR'))
    }
    const [departments, groups, categories] = await Promise.all([by('department'), by('groupName'), by('category')])
    return { departments, groups, categories }
  }

  // ---------- Plataforma: acesso pela VPN ----------

  private async assertPlatform(user: AuthUser, action: 'view' | 'edit') {
    const t = await this.tenants.info(user.tenantId)
    if (!t.isPlatform || !can(user.permissions, user.role.isSystem, PLATFORM_MODULE, action)) throw new ForbiddenException('Só a administração da plataforma libera o acesso pela VPN.')
  }

  /** Empresas com a Trier num endereço privado (aguardando ou já liberado). */
  async vpnList(user: AuthUser) {
    await this.assertPlatform(user, 'view')
    const rows = await this.prisma.tenantSetting.findMany({ where: { key: TRIER_KEY }, select: { tenantId: true, value: true } })
    const out = []
    for (const r of rows) {
      const s = cleanTrier(r.value as Partial<TrierSettings>)
      if (!s.baseUrl) continue
      const vpn = await this.vpn(r.tenantId)
      const status = this.vpnStatusOf(s.baseUrl, vpn)
      if (status === 'publico' && !vpn.allowed) continue
      const t = await this.tenants.info(r.tenantId).catch(() => null)
      const { host, port } = hostPort(s.baseUrl)
      out.push({ tenantId: r.tenantId, company: t?.name ?? r.tenantId, baseUrl: s.baseUrl, requested: host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`, status, allowed: vpn.allowed, allowedBy: vpn.by, allowedAt: vpn.at })
    }
    return out
  }

  /** Libera (ou retira) um IP:porta privado exato para a empresa. Nunca faixa inteira. */
  async vpnSet(user: AuthUser, tenantId: string, address: string | null, ctx: RequestCtx) {
    await this.assertPlatform(user, 'edit')
    const exists = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
    if (!exists) throw new NotFoundException('Empresa não encontrada.')
    let allowed: string | null = null
    if (address !== null && address.trim()) {
      try {
        allowed = cleanVpnAddress(address, privateIp, vpnEligibleIp)
      } catch (e) {
        throw new BadRequestException((e as Error).message)
      }
    }
    const value: TrierVpn = { allowed, by: allowed ? user.name : null, at: allowed ? new Date().toISOString() : null }
    await this.settings.set(tenantId, TRIER_VPN_KEY, value)
    await this.audit.byUser(user, ctx, 'erp_trier.vpn', 'tenant', tenantId, { liberado: allowed })
    return value
  }
}
