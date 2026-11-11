import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { AuditService } from '../../audit/audit.service'
import type { RequestCtx } from '../../common/decorators'
import type { AuthUser } from '../../common/types'
import type { Prisma, TrierProduct } from '../../generated/prisma/client'
import { moduleActive } from '../../plataforma/sistemas'
import { TenantService } from '../../prisma/prisma.module'
import { PrismaService } from '../../prisma/prisma.service'
import { SettingsService } from '../../settings/settings.service'
import { TrierService } from '../../trier/trier.service'
import { validGtin } from '../../trier/trier'
import { MercadoLivreService } from '../mercadolivre.service'
import { normSku } from '../precos/impostos'
import {
  type AttrValue,
  buildItemBody,
  type CategoryAttribute,
  cleanPublicar,
  DEFAULT_MAX_TITLE,
  DEFAULT_PUBLICAR,
  draftProblems,
  type DraftLike,
  explainMlError,
  LISTING_TYPES,
  type ListingType,
  listingPrice,
  listingQuantity,
  MAX_PICTURES,
  mergeAttributes,
  missingAttributes,
  ML_SITE,
  mlTitle,
  needsUpdate,
  prefillAttributes,
  publishEligibility,
  PUBLICAR_CONFIG_KEY,
  type PublicarConfig,
  requiredAttributes,
  retryDelayFor,
} from './publicar'

const MODULE = 'marketplace_publicar'
const TICK_MS = 5 * 60_000
const GAP_MS = 1000
const PAGE = 50
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dec = (v: Prisma.Decimal | null) => (v === null ? null : Number(v))

export interface DraftPatch {
  mode?: 'catalogo' | 'tradicional'
  catalogProductId?: string | null
  categoryId?: string | null
  title?: string
  description?: string | null
  listingType?: ListingType
  freeShipping?: boolean
  attributes?: AttrValue[]
  syncEnabled?: boolean
}

interface CatalogHit {
  id: string
  name: string
  domainId: string | null
  picture: string | null
}

/**
 * Marketplaces › Publicar do ERP: monta o anúncio do Mercado Livre a partir do produto da Trier (catálogo pelo EAN ou
 * categoria + atributos), envia em segundo plano (~1 por segundo) e, depois de publicado, mantém preço e estoque
 * seguindo o ERP. Medicamento nunca é publicado; só aparece o que a empresa liberou (departamento/grupo/categoria).
 */
@Injectable()
export class PublicarService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PublicarService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly workers = new Set<string>()
  private readonly attrCache = new Map<string, { at: number; list: CategoryAttribute[]; maxTitle: number; name: string }>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly ml: MercadoLivreService,
    private readonly trier: TrierService,
    private readonly tenants: TenantService,
  ) {}

  onApplicationBootstrap() {
    this.trier.onProductsChanged((tenantId, codes) => this.erpChanged(tenantId, codes))
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
    void this.recover()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** Envio que ficou no meio quando o sistema reiniciou: não dá para saber se o Mercado Livre criou o anúncio. */
  private async recover() {
    try {
      await this.prisma.mlPublication.updateMany({ where: { status: 'ENVIANDO' }, data: { status: 'ERRO', error: 'Envio interrompido (o sistema reiniciou). Confira no Mercado Livre se o anúncio foi criado antes de enviar de novo.' } })
      await this.tick()
    } catch (e) {
      this.logger.warn(`Publicar: retomada: ${(e as Error).message}`)
    }
  }

  private async active(tenantId: string) {
    const t = await this.tenants.info(tenantId).catch(() => null)
    return !!t && moduleActive(t, MODULE)
  }

  async tick() {
    const pend = await this.prisma.mlPublication.findMany({ where: { OR: [{ status: 'PENDENTE' }, { status: 'PUBLICADO', syncEnabled: true }] }, distinct: ['tenantId'], select: { tenantId: true } })
    for (const p of pend) if (await this.active(p.tenantId)) this.kick(p.tenantId)
  }

  // ---------- Configuração ----------

  async config(tenantId: string): Promise<PublicarConfig> {
    return cleanPublicar(await this.settings.get<Partial<PublicarConfig>>(tenantId, PUBLICAR_CONFIG_KEY, {}), DEFAULT_PUBLICAR)
  }

  async configView(user: AuthUser) {
    const [config, values] = await Promise.all([this.config(user.tenantId), this.trier.values(user.tenantId)])
    return { config, values }
  }

  async saveConfig(user: AuthUser, raw: Partial<Record<keyof PublicarConfig, unknown>>, ctx: RequestCtx) {
    const next = cleanPublicar(raw, await this.config(user.tenantId))
    await this.settings.set(user.tenantId, PUBLICAR_CONFIG_KEY, next)
    await this.audit.byUser(user, ctx, 'marketplace_publicar.configuracao', 'setting', undefined, next as unknown as Record<string, unknown>)
    // Acréscimo ou sincronização mudaram: recalcula o que cada anúncio deve ter.
    await this.erpChanged(user.tenantId, 'all')
    return this.configView(user)
  }

  private async seller(tenantId: string) {
    const c = await this.ml.config(tenantId)
    if (c.status === 'DESCONECTADO' || !c.refreshTokenEnc || !c.userId) throw new BadRequestException('Conecte o Mercado Livre em Configurações › Marketplaces › Conexões dos marketplaces.')
    return c.userId
  }

  // ---------- Produtos que podem ser publicados ----------

  /** Produtos do ERP liberados para publicar (filtro da empresa, e-commerce se configurado) e que não são medicamento. */
  async candidates(user: AuthUser, q: { term?: string; page?: number; situacao?: 'todos' | 'sem_anuncio' | 'publicados' }) {
    const T = user.tenantId
    const [c, s] = await Promise.all([this.config(T), this.trier.config(T)])
    const any = [...c.allowedDepartments, ...c.allowedGroups, ...c.allowedCategories].length > 0
    if (!any) return { total: 0, page: 1, pageSize: PAGE, items: [], hiddenMedicines: 0, noFilter: true }
    const ins = (list: string[]) => list.map((v) => ({ equals: v, mode: 'insensitive' as const }))
    const where: Prisma.TrierProductWhereInput = {
      tenantId: T,
      removedAt: null,
      active: true,
      ...(s.ecommerceOnly ? { ecommerce: true } : {}),
      OR: [...ins(c.allowedDepartments).map((department) => ({ department })), ...ins(c.allowedGroups).map((groupName) => ({ groupName })), ...ins(c.allowedCategories).map((category) => ({ category }))],
    }
    if (q.term?.trim()) where.searchText = { contains: q.term.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() }
    const rows = await this.prisma.trierProduct.findMany({ where, orderBy: { name: 'asc' }, take: 20_000 })
    let hiddenMedicines = 0
    const eligible = rows.filter((p) => {
      const e = publishEligibility(p, c)
      if (!e.ok && e.medicine) hiddenMedicines++
      return e.ok
    })
    const pubs = await this.prisma.mlPublication.findMany({ where: { tenantId: T, source: 'trier', productCode: { in: eligible.map((p) => p.code) } }, select: { id: true, productCode: true, status: true, itemId: true, permalink: true, error: true } })
    const pubBy = new Map(pubs.map((p) => [p.productCode, p]))
    let list = eligible
    if (q.situacao === 'sem_anuncio') list = list.filter((p) => !pubBy.get(p.code)?.itemId)
    else if (q.situacao === 'publicados') list = list.filter((p) => !!pubBy.get(p.code)?.itemId)
    const page = Math.max(1, q.page ?? 1)
    const slice = list.slice((page - 1) * PAGE, page * PAGE)
    const items = await Promise.all(
      slice.map(async (p) => {
        const eff = await this.trier.effective(T, p, s)
        return { code: p.code, name: p.name, ean: p.ean, brand: p.brand, department: p.department, groupName: p.groupName, category: p.category, price: listingPrice(eff.price, c.markupPct), erpPrice: eff.price, stock: eff.stock, publication: pubBy.get(p.code) ?? null }
      }),
    )
    return { total: list.length, page, pageSize: PAGE, items, hiddenMedicines, noFilter: false }
  }

  private async product(tenantId: string, code: string) {
    const p = await this.prisma.trierProduct.findUnique({ where: { tenantId_code: { tenantId, code } } })
    if (!p || p.removedAt) throw new NotFoundException('Produto não encontrado no ERP.')
    return p
  }

  private async assertEligible(tenantId: string, p: TrierProduct) {
    const e = publishEligibility(p, await this.config(tenantId))
    if (!e.ok) throw new BadRequestException(e.reason)
  }

  // ---------- Mercado Livre: catálogo, categoria e atributos ----------

  private async catalogSearch(tenantId: string, ean: string): Promise<CatalogHit[]> {
    const r = await this.ml.apiGet<{ results?: { id: string; name: string; domain_id?: string; pictures?: { url?: string; secure_url?: string }[] }[] }>(tenantId, '/products/search', { status: 'active', site_id: ML_SITE, product_identifier: ean })
    return (r.results ?? []).slice(0, 5).map((x) => ({ id: x.id, name: x.name, domainId: x.domain_id ?? null, picture: x.pictures?.[0]?.secure_url ?? x.pictures?.[0]?.url ?? null }))
  }

  private async categoryFromDomain(tenantId: string, domainId: string): Promise<string | null> {
    const r = await this.ml.apiGet<{ id: string; name: string }[]>(tenantId, `/catalog_domains/${encodeURIComponent(domainId)}/categories`).catch(() => [])
    return Array.isArray(r) && r[0] ? r[0].id : null
  }

  async predictCategories(tenantId: string, q: string) {
    const r = await this.ml.apiGet<{ category_id: string; category_name: string; domain_name?: string }[]>(tenantId, `/sites/${ML_SITE}/domain_discovery/search`, { q: q.slice(0, 120), limit: 3 })
    return (Array.isArray(r) ? r : []).map((x) => ({ id: x.category_id, name: x.category_name, domain: x.domain_name ?? null }))
  }

  private async category(tenantId: string, id: string) {
    if (!/^MLB\d{1,12}$/.test(id)) throw new BadRequestException('Categoria inválida.')
    const hit = this.attrCache.get(id)
    if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit
    const [list, cat] = await Promise.all([
      this.ml.apiGet<CategoryAttribute[]>(tenantId, `/categories/${id}/attributes`),
      this.ml.apiGet<{ name?: string; settings?: { max_title_length?: number } }>(tenantId, `/categories/${id}`),
    ])
    const v = { at: Date.now(), list: Array.isArray(list) ? list : [], maxTitle: cat.settings?.max_title_length ?? DEFAULT_MAX_TITLE, name: cat.name ?? id }
    this.attrCache.set(id, v)
    return v
  }

  // ---------- Rascunho ----------

  /** Começa (ou reabre) o anúncio do produto: tenta o catálogo pelo EAN, senão a categoria sugerida. */
  async prepare(user: AuthUser, code: string, ctx: RequestCtx) {
    const T = user.tenantId
    await this.seller(T)
    const p = await this.product(T, code)
    await this.assertEligible(T, p)
    const existing = await this.prisma.mlPublication.findUnique({ where: { tenantId_source_productCode: { tenantId: T, source: 'trier', productCode: code } } })
    if (existing) return this.draftView(user, existing.id)
    const [c, s] = await Promise.all([this.config(T), this.trier.config(T)])
    const name = (s.useEcommerceValues && p.ecommerceName) || p.name
    const hits = validGtin(p.ean) ? await this.catalogSearch(T, p.ean!).catch(() => []) : []
    let mode: 'catalogo' | 'tradicional' = 'tradicional'
    let categoryId: string | null = null
    let catalogProductId: string | null = null
    let catalogName: string | null = null
    if (hits[0]?.domainId) {
      categoryId = await this.categoryFromDomain(T, hits[0].domainId)
      if (categoryId) {
        mode = 'catalogo'
        catalogProductId = hits[0].id
        catalogName = hits[0].name
      }
    }
    if (!categoryId) categoryId = (await this.predictCategories(T, name).catch(() => []))[0]?.id ?? null
    const cat = categoryId ? await this.category(T, categoryId).catch(() => null) : null
    const eff = await this.trier.effective(T, p, s)
    const created = await this.prisma.mlPublication.create({
      data: {
        tenantId: T,
        source: 'trier',
        productCode: code,
        status: 'RASCUNHO',
        mode,
        catalogProductId,
        catalogName,
        categoryId,
        categoryName: cat?.name ?? null,
        title: mlTitle(name, cat?.maxTitle ?? DEFAULT_MAX_TITLE),
        description: (s.useEcommerceValues && p.description) || null,
        listingType: c.listingType,
        attributes: prefillAttributes(p, cat?.list ?? []) as unknown as Prisma.InputJsonValue,
        price: listingPrice(eff.price, c.markupPct),
        quantity: listingQuantity(eff.stock),
        syncEnabled: c.keepSynced,
        createdById: user.id,
        createdByName: user.name.slice(0, 120),
      },
    })
    await this.audit.byUser(user, ctx, 'marketplace_publicar.rascunho', 'ml_publication', created.id, { produto: code, modo: mode })
    return this.draftView(user, created.id)
  }

  private async load(tenantId: string, id: string) {
    const d = await this.prisma.mlPublication.findFirst({ where: { id, tenantId } })
    if (!d) throw new NotFoundException('Publicação não encontrada.')
    return d
  }

  private asDraft(d: { mode: string; title: string; categoryId: string | null; catalogProductId: string | null; listingType: string; price: Prisma.Decimal | null; quantity: number | null; freeShipping: boolean; attributes: unknown; pictures: unknown }): DraftLike {
    return {
      mode: d.mode === 'catalogo' ? 'catalogo' : 'tradicional',
      title: d.title,
      categoryId: d.categoryId,
      catalogProductId: d.catalogProductId,
      listingType: (LISTING_TYPES as readonly string[]).includes(d.listingType) ? (d.listingType as ListingType) : 'gold_special',
      price: dec(d.price),
      quantity: d.quantity,
      freeShipping: d.freeShipping,
      attributes: Array.isArray(d.attributes) ? (d.attributes as AttrValue[]) : [],
      pictures: Array.isArray(d.pictures) ? (d.pictures as { id: string }[]) : [],
    }
  }

  async draftView(user: AuthUser, id: string) {
    const T = user.tenantId
    const d = await this.load(T, id)
    const p = await this.prisma.trierProduct.findUnique({ where: { tenantId_code: { tenantId: T, code: d.productCode } } })
    const cat = d.categoryId ? await this.category(T, d.categoryId).catch(() => null) : null
    const draft = this.asDraft(d)
    const required = cat ? requiredAttributes(cat.list, draft.mode) : []
    const missing = missingAttributes(required, draft.attributes)
    const eligibility = p ? publishEligibility(p, await this.config(T)) : { ok: false as const, reason: 'Produto não está mais no ERP.', medicine: false }
    const problems = [...(eligibility.ok ? [] : [eligibility.reason]), ...(cat || !d.categoryId ? [] : ['Não foi possível ler a categoria no Mercado Livre.']), ...draftProblems(draft, missing)]
    if (draft.title.length > (cat?.maxTitle ?? DEFAULT_MAX_TITLE)) problems.push(`Título com mais de ${cat?.maxTitle ?? DEFAULT_MAX_TITLE} caracteres.`)
    const hits = p && validGtin(p.ean) && !d.itemId ? await this.catalogSearch(T, p.ean!).catch(() => []) : []
    return {
      publication: { ...d, price: dec(d.price), desiredPrice: dec(d.desiredPrice), sentPrice: dec(d.sentPrice) },
      product: p ? { code: p.code, name: p.name, ean: p.ean, brand: p.brand, department: p.department, groupName: p.groupName, category: p.category, ncm: p.ncm, dims: { widthMm: p.widthMm, heightMm: p.heightMm, depthMm: p.depthMm, weightG: p.weightG } } : null,
      catalog: hits,
      category: cat ? { id: d.categoryId, name: cat.name, maxTitle: cat.maxTitle } : null,
      required: required.map((a) => ({ id: a.id, name: a.name, valueType: a.value_type ?? null, values: (a.values ?? []).slice(0, 300), units: a.allowed_units ?? [] })),
      packageAttributes: ['SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT'],
      missing: missing.map((m) => m.id),
      problems,
      canPublish: problems.length === 0 && ['RASCUNHO', 'ERRO'].includes(d.status) && !d.itemId,
    }
  }

  async updateDraft(user: AuthUser, id: string, patch: DraftPatch, ctx: RequestCtx) {
    const T = user.tenantId
    const d = await this.load(T, id)
    if (d.itemId && (patch.mode || patch.categoryId !== undefined || patch.catalogProductId !== undefined)) throw new BadRequestException('Anúncio já publicado: a categoria e o catálogo não mudam por aqui.')
    if (['PENDENTE', 'ENVIANDO'].includes(d.status)) throw new ConflictException('O anúncio está sendo enviado. Aguarde.')
    const data: Prisma.MlPublicationUpdateInput = {}
    if (patch.mode) data.mode = patch.mode
    if (patch.catalogProductId !== undefined) data.catalogProductId = patch.catalogProductId
    if (patch.categoryId !== undefined) {
      const cat = patch.categoryId ? await this.category(T, patch.categoryId) : null
      data.categoryId = patch.categoryId
      data.categoryName = cat?.name ?? null
    }
    if (patch.title !== undefined) data.title = patch.title.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (patch.description !== undefined) data.description = patch.description?.slice(0, 50_000) ?? null
    if (patch.listingType) data.listingType = patch.listingType
    if (patch.freeShipping !== undefined) data.freeShipping = patch.freeShipping
    if (patch.syncEnabled !== undefined) data.syncEnabled = patch.syncEnabled
    if (patch.attributes) data.attributes = mergeAttributes(this.asDraft(d).attributes, patch.attributes) as unknown as Prisma.InputJsonValue
    if (d.status === 'ERRO' && !d.itemId) data.status = 'RASCUNHO'
    await this.prisma.mlPublication.update({ where: { id }, data })
    await this.audit.byUser(user, ctx, 'marketplace_publicar.editar', 'ml_publication', id, { campos: Object.keys(data) })
    return this.draftView(user, id)
  }

  /** Foto enviada pela pessoa: vai direto para o Mercado Livre (POST /pictures/items/upload); o CRM guarda só o id. */
  async uploadPicture(user: AuthUser, id: string, file: Express.Multer.File | undefined) {
    const T = user.tenantId
    const d = await this.load(T, id)
    if (!file?.buffer?.length) throw new BadRequestException('Envie a foto (JPG ou PNG).')
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) throw new BadRequestException('A foto precisa ser JPG ou PNG.')
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('A foto pode ter até 10 MB.')
    const pics = this.asDraft(d).pictures as { id: string; url?: string }[]
    if (pics.length >= MAX_PICTURES) throw new BadRequestException(`Até ${MAX_PICTURES} fotos por anúncio.`)
    await this.seller(T)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.mimetype === 'image/png' ? 'foto.png' : 'foto.jpg')
    const r = await this.ml.apiUpload<{ id?: string; variations?: { secure_url?: string; url?: string; size?: string }[] }>(T, '/pictures/items/upload', form)
    if (!r.id) throw new BadRequestException('O Mercado Livre não devolveu a foto carregada.')
    const url = r.variations?.find((v) => v.secure_url)?.secure_url ?? null
    await this.prisma.mlPublication.update({ where: { id }, data: { pictures: [...pics, { id: r.id, url }] as unknown as Prisma.InputJsonValue } })
    return this.draftView(user, id)
  }

  async removePicture(user: AuthUser, id: string, pictureId: string) {
    const d = await this.load(user.tenantId, id)
    const pics = (this.asDraft(d).pictures as { id: string }[]).filter((p) => p.id !== pictureId)
    await this.prisma.mlPublication.update({ where: { id }, data: { pictures: pics as unknown as Prisma.InputJsonValue } })
    return this.draftView(user, id)
  }

  async remove(user: AuthUser, id: string, ctx: RequestCtx) {
    const d = await this.load(user.tenantId, id)
    if (d.itemId) throw new BadRequestException('Anúncio já publicado: o vínculo fica guardado (pause ou encerre o anúncio no Mercado Livre).')
    if (['PENDENTE', 'ENVIANDO'].includes(d.status)) throw new ConflictException('O anúncio está sendo enviado. Aguarde.')
    await this.prisma.mlPublication.delete({ where: { id } })
    await this.audit.byUser(user, ctx, 'marketplace_publicar.excluir_rascunho', 'ml_publication', id, { produto: d.productCode })
    return { ok: true }
  }

  async publications(user: AuthUser, q: { status?: string; page?: number }) {
    const where: Prisma.MlPublicationWhereInput = { tenantId: user.tenantId, ...(q.status ? { status: q.status } : {}) }
    const page = Math.max(1, q.page ?? 1)
    const [total, rows] = await Promise.all([
      this.prisma.mlPublication.count({ where }),
      this.prisma.mlPublication.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    ])
    const counts = await this.prisma.mlPublication.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: { _all: true } })
    return {
      total,
      page,
      pageSize: PAGE,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      items: rows.map((r) => ({ id: r.id, productCode: r.productCode, title: r.title, status: r.status, mode: r.mode, listingType: r.listingType, itemId: r.itemId, permalink: r.permalink, error: r.error, price: dec(r.price), quantity: r.quantity, syncEnabled: r.syncEnabled, desiredPrice: dec(r.desiredPrice), desiredQuantity: r.desiredQuantity, sentPrice: dec(r.sentPrice), sentQuantity: r.sentQuantity, syncError: r.syncError, syncedAt: r.syncedAt, publishedAt: r.publishedAt, updatedAt: r.updatedAt })),
    }
  }

  // ---------- Envio ----------

  /** Coloca na fila (revisão feita na tela). Medicamento e rascunho com pendência não entram. */
  async publish(user: AuthUser, ids: string[], ctx: RequestCtx) {
    const T = user.tenantId
    await this.seller(T)
    const queued: string[] = []
    const refused: { id: string; reason: string }[] = []
    for (const id of ids) {
      const v = await this.draftView(user, id).catch((e: Error) => ({ error: e.message }))
      if ('error' in v) refused.push({ id, reason: v.error })
      else if (!v.canPublish) refused.push({ id, reason: v.problems.join(' ') || 'Já enviado.' })
      else {
        await this.prisma.mlPublication.update({ where: { id }, data: { status: 'PENDENTE', error: null } })
        queued.push(id)
      }
    }
    if (queued.length) {
      await this.audit.byUser(user, ctx, 'marketplace_publicar.publicar', 'ml_publication', undefined, { ids: queued })
      this.kick(T)
    }
    return { queued: queued.length, refused }
  }

  /** Fila por empresa: um envio por vez, ~1 por segundo (publicações e depois atualizações de preço/estoque). */
  private kick(tenantId: string) {
    if (this.workers.has(tenantId)) return
    this.workers.add(tenantId)
    void (async () => {
      try {
        if (!(await this.active(tenantId))) return
        for (;;) {
          const next = await this.prisma.mlPublication.findFirst({ where: { tenantId, status: 'PENDENTE' }, orderBy: { updatedAt: 'asc' } })
          if (!next) break
          await this.send(tenantId, next.id)
          await sleep(GAP_MS)
        }
        await this.pushUpdates(tenantId)
      } catch (e) {
        this.logger.warn(`Publicar (${tenantId}): ${(e as Error).message}`)
      } finally {
        this.workers.delete(tenantId)
      }
    })()
  }

  private async userProductSeller(tenantId: string, seller: string) {
    const u = await this.ml.apiGet<{ tags?: string[] }>(tenantId, `/users/${seller}`).catch(() => ({ tags: [] as string[] }))
    return (u.tags ?? []).includes('user_product_seller')
  }

  private async send(tenantId: string, id: string) {
    const claimed = await this.prisma.mlPublication.updateMany({ where: { id, status: 'PENDENTE' }, data: { status: 'ENVIANDO' } })
    if (!claimed.count) return
    const fail = (msg: string) => this.prisma.mlPublication.update({ where: { id }, data: { status: 'ERRO', error: msg.slice(0, 1000) } })
    try {
      const d = await this.load(tenantId, id)
      const seller = await this.seller(tenantId)
      const p = await this.product(tenantId, d.productCode)
      const [c, s] = await Promise.all([this.config(tenantId), this.trier.config(tenantId)])
      const e = publishEligibility(p, c)
      if (!e.ok) return await fail(e.reason)
      const eff = await this.trier.effective(tenantId, p, s)
      const price = listingPrice(eff.price, c.markupPct)
      const quantity = listingQuantity(eff.stock)
      const draft = { ...this.asDraft(d), price, quantity }
      const cat = draft.categoryId ? await this.category(tenantId, draft.categoryId) : null
      const problems = draftProblems(draft, cat ? missingAttributes(requiredAttributes(cat.list, draft.mode), draft.attributes) : [])
      if (problems.length) return await fail(problems.join(' '))
      const body = buildItemBody(draft, { userProductSeller: await this.userProductSeller(tenantId, seller) })
      // Validador oficial antes de criar (não cria nada; devolve os motivos da recusa).
      await this.ml.apiSend(tenantId, 'POST', '/items/validate', body, {}, retryDelayFor('update'))
      const item = await this.ml.apiSend<{ id?: string; permalink?: string; price?: number; available_quantity?: number }>(tenantId, 'POST', '/items', body, {}, retryDelayFor('create'))
      if (!item.id) return await fail('O Mercado Livre não devolveu o código do anúncio.')
      const now = new Date()
      await this.prisma.mlPublication.update({
        where: { id },
        data: { status: 'PUBLICADO', itemId: item.id, permalink: item.permalink ?? null, error: null, price, quantity, sentPrice: price, sentQuantity: quantity, desiredPrice: price, desiredQuantity: quantity, publishedAt: now, syncedAt: now },
      })
      if (d.description?.trim()) {
        await this.ml.apiSend(tenantId, 'POST', `/items/${item.id}/description`, { plain_text: d.description.trim() }, {}, retryDelayFor('create')).catch((err: Error) =>
          this.prisma.mlPublication.update({ where: { id }, data: { syncError: `Anúncio criado, mas a descrição não foi aceita: ${explainMlError(err.message)}`.slice(0, 1000) } }),
        )
      }
      if (s.importCost && p.cost !== null) await this.storeCost(tenantId, p.code, Number(p.cost))
    } catch (err) {
      await fail(explainMlError((err as Error).message))
    }
  }

  /** Custo da Trier em Preços e promoções (origem "erp"), sem passar por cima de custo digitado ou importado. */
  private async storeCost(tenantId: string, code: string, cost: number) {
    const sku = normSku(code)
    const cur = await this.prisma.marketplaceCost.findUnique({ where: { tenantId_sku: { tenantId, sku } } })
    if (cur && cur.source !== 'erp') return
    const data = { cost, source: 'erp', percent: null, updatedById: null, updatedByName: 'Trier (ERP)' }
    await this.prisma.marketplaceCost.upsert({ where: { tenantId_sku: { tenantId, sku } }, create: { tenantId, sku, ...data }, update: data })
  }

  /** ERP mudou: recalcula preço e estoque que cada anúncio vinculado deve ter (e o custo, se importado). */
  async erpChanged(tenantId: string, codes: string[] | 'all') {
    const [c, s] = await Promise.all([this.config(tenantId), this.trier.config(tenantId)])
    const pubs = await this.prisma.mlPublication.findMany({ where: { tenantId, source: 'trier', itemId: { not: null }, ...(codes === 'all' ? {} : { productCode: { in: codes } }) } })
    if (!pubs.length) return
    const products = await this.prisma.trierProduct.findMany({ where: { tenantId, code: { in: pubs.map((p) => p.productCode) } } })
    const byCode = new Map(products.map((p) => [p.code, p]))
    let pending = false
    for (const pub of pubs) {
      const p = byCode.get(pub.productCode)
      const eff = p ? await this.trier.effective(tenantId, p, s) : { price: null, stock: 0 }
      const gone = !p || !!p.removedAt || !p.active
      const desiredPrice = listingPrice(eff.price, c.markupPct)
      const desiredQuantity = gone ? 0 : listingQuantity(eff.stock)
      await this.prisma.mlPublication.update({ where: { id: pub.id }, data: { desiredPrice, desiredQuantity } })
      if (s.importCost && p?.cost !== null && p?.cost !== undefined) await this.storeCost(tenantId, p.code, Number(p.cost))
      if (pub.syncEnabled && needsUpdate({ desiredPrice, desiredQuantity, sentPrice: dec(pub.sentPrice), sentQuantity: pub.sentQuantity }).any) pending = true
    }
    if (pending && c.keepSynced && (await this.active(tenantId))) this.kick(tenantId)
  }

  /** Envia ao ML preço e estoque que mudaram no ERP (PUT /items/{id}). Estoque 0 pausa o anúncio. */
  private async pushUpdates(tenantId: string) {
    const c = await this.config(tenantId)
    if (!c.keepSynced) return
    const pubs = await this.prisma.mlPublication.findMany({ where: { tenantId, status: 'PUBLICADO', syncEnabled: true, itemId: { not: null } } })
    for (const pub of pubs) {
      const n = needsUpdate({ desiredPrice: dec(pub.desiredPrice), desiredQuantity: pub.desiredQuantity, sentPrice: dec(pub.sentPrice), sentQuantity: pub.sentQuantity })
      if (!n.any) continue
      // Recusado há pouco: tenta de novo depois de 1 hora (ou na próxima mudança do ERP com outro valor).
      if (pub.syncError && pub.syncedAt && Date.now() - pub.syncedAt.getTime() < 3_600_000) continue
      const body: Record<string, unknown> = {}
      if (n.price) body.price = dec(pub.desiredPrice)
      if (n.quantity) body.available_quantity = pub.desiredQuantity
      try {
        await this.ml.apiSend(tenantId, 'PUT', `/items/${pub.itemId}`, body, {}, retryDelayFor('update'))
        await this.prisma.mlPublication.update({
          where: { id: pub.id },
          data: { ...(n.price ? { sentPrice: pub.desiredPrice, price: pub.desiredPrice } : {}), ...(n.quantity ? { sentQuantity: pub.desiredQuantity, quantity: pub.desiredQuantity } : {}), syncError: null, syncedAt: new Date() },
        })
      } catch (err) {
        await this.prisma.mlPublication.update({ where: { id: pub.id }, data: { syncError: explainMlError((err as Error).message).slice(0, 1000), syncedAt: new Date() } })
      }
      await sleep(GAP_MS)
    }
  }
}
