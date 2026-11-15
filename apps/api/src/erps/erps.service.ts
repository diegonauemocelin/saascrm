import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import { decrypt, encrypt } from '../common/crypto'
import type { RequestCtx } from '../common/decorators'
import { can } from '../common/permissions'
import type { AuthUser } from '../common/types'
import { normSku } from '../marketplaces/precos/impostos'
import { moduleActive } from '../plataforma/sistemas'
import { TenantService } from '../prisma/prisma.module'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { HttpStatusError, networkError, safeGet } from '../trier/http'
import {
  cleanErpSettings,
  DEFAULT_ERP_STATE,
  ERP_KEYS,
  ERP_MAX_BYTES,
  ERP_TIMEOUT_MS,
  type ErpKey,
  type ErpProductData,
  type ErpSettings,
  type ErpState,
  fold,
  fullDue,
  httpErrorText,
  moduleOf,
  normalizeServerUrl,
  searchTextOf,
  settingsKey,
  stateKey,
} from './erps'
import { ADAPTERS } from './provedores'
import type { ErpCtx } from './provedores/tipos'

const TICK_MS = 60_000
const LIST_PAGE = 50
const ENC = 'enc:'
/** Validade do "state" do OAuth (o cliente volta do ERP em poucos minutos). */
const STATE_TTL_MS = 20 * 60_000

export interface ErpSaveInput {
  enabled: boolean
  values?: Record<string, string>
  importCost?: boolean
  fullEveryHours?: number
}

export interface ErpListQuery {
  term?: string
  inStock?: boolean
  inactive?: boolean
  page?: number
}

/**
 * Integrações com ERPs (Bling, Tiny, Omie, Linx, CIGAM), no padrão da Trier: o CRM consulta o ERP (só leitura), copia
 * produtos, preço, estoque e custo para erp_products (cópia completa a cada N horas, por empresa com o módulo no
 * plano) e mostra na tela de cada ERP. Credenciais criptografadas; endereço de rede interna nunca é chamado.
 */
@Injectable()
export class ErpsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ErpsService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly running = new Set<string>()
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

  private adapter(key: string) {
    if (!(ERP_KEYS as readonly string[]).includes(key)) throw new NotFoundException('Integração não encontrada.')
    return ADAPTERS[key as ErpKey]
  }

  private assertCan(user: AuthUser, key: ErpKey, action: 'view' | 'edit' = 'view') {
    if (!can(user.permissions, user.role.isSystem, moduleOf(key), action)) throw new ForbiddenException(`Você não tem permissão para a integração com ${ADAPTERS[key].def.name}.`)
  }

  async config(tenantId: string, key: ErpKey): Promise<ErpSettings> {
    return cleanErpSettings(await this.settings.get<Partial<ErpSettings>>(tenantId, settingsKey(key), {}))
  }
  async state(tenantId: string, key: ErpKey): Promise<ErpState> {
    return { ...DEFAULT_ERP_STATE, ...(await this.settings.get<Partial<ErpState>>(tenantId, stateKey(key), {})) }
  }
  private async saveState(tenantId: string, key: ErpKey, patch: Partial<ErpState>) {
    await this.settings.set(tenantId, stateKey(key), { ...(await this.state(tenantId, key)), ...patch })
  }

  /** Valores abertos (os secretos descriptografados). */
  private open(values: Record<string, string>) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (!v.startsWith(ENC)) out[k] = v
      else
        try {
          out[k] = decrypt(v.slice(ENC.length))
        } catch {
          // Chave de criptografia trocada: o valor precisa ser informado de novo.
        }
    }
    return out
  }

  private secretKeys(key: ErpKey) {
    return new Set(ADAPTERS[key].def.fields.filter((f) => f.secret).map((f) => f.key))
  }

  /** Valor guardado criptografado: os campos secretos e tudo o que não é campo da tela (ex.: tokens OAuth). */
  private isSecret(key: ErpKey, field: string) {
    const f = ADAPTERS[key].def.fields.find((x) => x.key === field)
    return !f || !!f.secret
  }

  /** Contexto do adaptador: credenciais, chamada HTTP segura e gravação de tokens renovados. */
  private ctx(tenantId: string, key: ErpKey, s: ErpSettings): ErpCtx {
    const name = ADAPTERS[key].def.name
    const values = this.open(s.values)
    return {
      values,
      request: async (url, o = {}) => {
        try {
          return await this.getter(url, { method: o.method, body: o.body, headers: o.headers, timeoutMs: ERP_TIMEOUT_MS, maxBytes: ERP_MAX_BYTES, allowIp: null })
        } catch (e) {
          if (e instanceof HttpStatusError) throw Object.assign(new Error(httpErrorText(name, e.status)), { status: e.status, body: e.body })
          throw new Error(networkError(e).replace(/Trier/g, name).replace(/da farmácia/g, 'do servidor'))
        }
      },
      save: async (patch) => {
        const cur = await this.config(tenantId, key)
        const next = { ...cur.values }
        for (const [k, v] of Object.entries(patch)) {
          next[k] = this.isSecret(key, k) && v ? ENC + encrypt(v) : v
          values[k] = v
        }
        await this.settings.set(tenantId, settingsKey(key), { ...cur, values: next })
      },
    }
  }

  // ---------- Tela ----------

  async view(user: AuthUser, key: string, origin: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key)
    const [s, st, products, removed] = await Promise.all([
      this.config(user.tenantId, a.def.key),
      this.state(user.tenantId, a.def.key),
      this.prisma.erpProduct.count({ where: { tenantId: user.tenantId, provider: a.def.key, removedAt: null } }),
      this.prisma.erpProduct.count({ where: { tenantId: user.tenantId, provider: a.def.key, removedAt: { not: null } } }),
    ])
    const secrets = this.secretKeys(a.def.key)
    return {
      def: { key: a.def.key, name: a.def.name, segment: a.def.segment, howTo: a.def.howTo, oauth: !!a.def.oauth, fields: a.def.fields },
      enabled: s.enabled,
      values: Object.fromEntries(a.def.fields.map((f) => [f.key, secrets.has(f.key) ? '' : (s.values[f.key] ?? '')])),
      saved: Object.fromEntries(a.def.fields.filter((f) => secrets.has(f.key)).map((f) => [f.key, !!s.values[f.key]])),
      importCost: s.importCost,
      fullEveryHours: s.fullEveryHours,
      redirectUri: a.def.oauth ? this.redirectUri(origin, a.def.key) : null,
      state: { ...st, products, removed },
    }
  }

  async save(user: AuthUser, key: string, dto: ErpSaveInput, ctx: RequestCtx) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    const cur = await this.config(user.tenantId, a.def.key)
    const values = { ...cur.values }
    const changed: string[] = []
    for (const f of a.def.fields) {
      const raw = dto.values?.[f.key]
      if (raw === undefined) continue
      let v = raw.trim()
      // Campo secreto em branco: mantém o guardado.
      if (f.secret && !v) continue
      if (v.length > 4000 || /[\u0000-\u001f]/.test(v)) throw new BadRequestException(`${f.label}: valor inválido.`)
      if (f.url && v) {
        try {
          v = normalizeServerUrl(v)
        } catch (e) {
          throw new BadRequestException(`${f.label}: ${(e as Error).message}`)
        }
      }
      const stored = f.secret ? ENC + encrypt(v) : v
      if (f.secret || values[f.key] !== stored) changed.push(f.key)
      values[f.key] = stored
    }
    const next = cleanErpSettings({ enabled: dto.enabled, values, importCost: dto.importCost ?? cur.importCost, fullEveryHours: dto.fullEveryHours ?? cur.fullEveryHours }, cur)
    const missing = a.def.fields.filter((f) => !f.optional && !next.values[f.key])
    if (next.enabled && missing.length) throw new BadRequestException(`Para ligar, preencha: ${missing.map((f) => f.label).join(', ')}.`)
    await this.settings.set(user.tenantId, settingsKey(a.def.key), next)
    // Credencial nova: a próxima rodada faz a cópia completa.
    if (changed.length) await this.saveState(user.tenantId, a.def.key, { lastFullAt: null, lastError: null })
    await this.audit.byUser(user, ctx, `${moduleOf(a.def.key)}.configuracao`, 'setting', undefined, { ligado: next.enabled, camposAlterados: changed, importarCusto: next.importCost, horas: next.fullEveryHours })
    return { ok: true }
  }

  async test(user: AuthUser, key: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    const s = await this.config(user.tenantId, a.def.key)
    const missing = a.def.fields.filter((f) => !f.optional && !s.values[f.key])
    if (missing.length) throw new BadRequestException(`Salve antes: ${missing.map((f) => f.label).join(', ')}.`)
    try {
      const message = await a.test(this.ctx(user.tenantId, a.def.key, s))
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
    const id = `${user.tenantId}:${a.def.key}`
    if (this.running.has(id)) return { started: false, message: 'Já existe uma cópia em andamento.' }
    await this.audit.byUser(user, ctx, `${moduleOf(a.def.key)}.copiar_agora`, 'setting')
    void this.run(user.tenantId, a.def.key, new Date())
    return { started: true, message: 'Cópia completa iniciada. Acompanhe a situação nesta tela.' }
  }

  async list(user: AuthUser, key: string, q: ErpListQuery) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key)
    const words = fold(q.term ?? '').split(/\s+/).filter(Boolean).slice(0, 6)
    const where = {
      tenantId: user.tenantId,
      provider: a.def.key,
      removedAt: null,
      ...(q.inactive ? {} : { active: true }),
      ...(q.inStock ? { stock: { gt: 0 } } : {}),
      ...(words.length ? { AND: words.map((w) => ({ searchText: { contains: w } })) } : {}),
    }
    const page = Math.max(1, q.page ?? 1)
    const [total, rows] = await Promise.all([this.prisma.erpProduct.count({ where }), this.prisma.erpProduct.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * LIST_PAGE, take: LIST_PAGE })])
    return {
      total,
      page,
      pageSize: LIST_PAGE,
      rows: rows.map((r) => ({ code: r.code, name: r.name, ean: r.ean, brand: r.brand, category: r.category, unit: r.unit, price: r.price === null ? null : Number(r.price), stock: r.stock === null ? null : Number(r.stock), cost: r.cost === null ? null : Number(r.cost), active: r.active, syncedAt: r.syncedAt })),
    }
  }

  // ---------- OAuth (Bling) ----------

  /** Endereço de volta do OAuth: o mesmo endereço da empresa (subdomínio ou domínio próprio). */
  redirectUri(origin: string, key: ErpKey) {
    return `${origin.replace(/\/+$/, '')}/api/erps/${key}/oauth/retorno`
  }

  async authorize(user: AuthUser, key: string, origin: string) {
    const a = this.adapter(key)
    this.assertCan(user, a.def.key, 'edit')
    if (!a.authorizeUrl) throw new BadRequestException('Esta integração não usa autorização.')
    const s = await this.config(user.tenantId, a.def.key)
    const values = this.open(s.values)
    const missing = a.def.fields.filter((f) => !f.optional && !values[f.key])
    if (missing.length) throw new BadRequestException(`Salve antes: ${missing.map((f) => f.label).join(', ')}.`)
    // "state" criptografado (AES-GCM com a chave do sistema): empresa, integração, hora e um número aleatório.
    const state = Buffer.from(encrypt(`${user.tenantId}.${a.def.key}.${Date.now()}.${randomBytes(8).toString('hex')}`)).toString('base64url')
    return { url: a.authorizeUrl(values, this.redirectUri(origin, a.def.key), state) }
  }

  /** Volta do ERP com o código: confere o "state" (empresa do endereço, assinatura e validade) e troca pelo token. */
  async oauthReturn(tenantId: string, key: string, code: string, state: string, origin: string) {
    const a = this.adapter(key)
    if (!a.exchangeCode) throw new BadRequestException('Esta integração não usa autorização.')
    let parts: string[]
    try {
      parts = decrypt(Buffer.from(state, 'base64url').toString('utf8')).split('.')
    } catch {
      throw new BadRequestException('Autorização inválida. Clique em Conectar de novo.')
    }
    if (parts.length !== 4) throw new BadRequestException('Autorização inválida. Clique em Conectar de novo.')
    const [tid, k, at] = parts as [string, string, string, string]
    if (tid !== tenantId || k !== a.def.key) throw new BadRequestException('Autorização de outra empresa ou integração.')
    if (Date.now() - Number(at) > STATE_TTL_MS) throw new BadRequestException('A autorização expirou. Clique em Conectar de novo.')
    const s = await this.config(tenantId, a.def.key)
    await a.exchangeCode(this.ctx(tenantId, a.def.key, s), code, this.redirectUri(origin, a.def.key))
    await this.saveState(tenantId, a.def.key, { connectedAt: new Date().toISOString(), lastError: null, lastFullAt: null })
  }

  // ---------- Cópia ----------

  async tick(now = new Date()) {
    try {
      const rows = await this.prisma.tenantSetting.findMany({ where: { key: { in: ERP_KEYS.map(settingsKey) } }, select: { tenantId: true, key: true, value: true } })
      for (const r of rows) {
        const key = r.key.slice(4) as ErpKey
        const s = cleanErpSettings(r.value as Partial<ErpSettings>)
        if (!s.enabled || this.running.has(`${r.tenantId}:${key}`)) continue
        const t = await this.tenants.info(r.tenantId).catch(() => null)
        if (!t || !moduleActive(t, moduleOf(key), now.getTime())) continue
        if (fullDue(now, await this.state(r.tenantId, key), s)) await this.run(r.tenantId, key, now)
      }
    } catch (e) {
      this.logger.warn(`ERPs: rotina: ${(e as Error).message}`)
    }
  }

  private async run(tenantId: string, key: ErpKey, runAt: Date) {
    const id = `${tenantId}:${key}`
    if (this.running.has(id)) return
    this.running.add(id)
    await this.saveState(tenantId, key, { running: true, runningSince: runAt.toISOString() })
    try {
      const s = await this.config(tenantId, key)
      await ADAPTERS[key].sync(this.ctx(tenantId, key, s), async (rows) => this.store(tenantId, key, rows, s, runAt))
      await this.prisma.erpProduct.updateMany({ where: { tenantId, provider: key, seenAt: { lt: runAt }, removedAt: null }, data: { removedAt: new Date() } })
      const products = await this.prisma.erpProduct.count({ where: { tenantId, provider: key, removedAt: null } })
      await this.saveState(tenantId, key, { lastFullAt: runAt.toISOString(), lastOkAt: new Date().toISOString(), lastError: null, products })
    } catch (e) {
      const msg = (e as Error).message.slice(0, 400)
      this.logger.warn(`${key} (${tenantId}): ${msg}`)
      await this.saveState(tenantId, key, { lastError: msg, lastErrorAt: new Date().toISOString() })
    } finally {
      this.running.delete(id)
      await this.saveState(tenantId, key, { running: false, runningSince: null }).catch(() => undefined)
    }
  }

  private async store(tenantId: string, key: ErpKey, rows: ErpProductData[], s: ErpSettings, seenAt: Date) {
    const name = ADAPTERS[key].def.name
    for (const p of rows) {
      if (!p.code || !p.name) continue
      const data = {
        name: p.name,
        ean: p.ean,
        brand: p.brand,
        category: p.category,
        ncm: p.ncm,
        unit: p.unit,
        price: p.price,
        stock: p.stock,
        cost: s.importCost ? p.cost : null,
        active: p.active,
        externalId: p.externalId,
        searchText: searchTextOf(p),
        seenAt,
        removedAt: null,
        syncedAt: new Date(),
      }
      await this.prisma.erpProduct.upsert({ where: { tenantId_provider_code: { tenantId, provider: key, code: p.code } }, create: { tenantId, provider: key, code: p.code, ...data }, update: data })
      if (s.importCost && p.cost !== null && p.cost > 0) await this.storeCost(tenantId, p.code, p.cost, name)
    }
  }

  /** Custo do ERP em Preços e promoções (origem "erp"), sem passar por cima de custo digitado ou importado. */
  private async storeCost(tenantId: string, code: string, cost: number, name: string) {
    const sku = normSku(code)
    const cur = await this.prisma.marketplaceCost.findUnique({ where: { tenantId_sku: { tenantId, sku } } })
    if (cur && cur.source !== 'erp') return
    const data = { cost, source: 'erp', percent: null, updatedById: null, updatedByName: `${name} (ERP)` }
    await this.prisma.marketplaceCost.upsert({ where: { tenantId_sku: { tenantId, sku } }, create: { tenantId, sku, ...data }, update: data })
  }
}
