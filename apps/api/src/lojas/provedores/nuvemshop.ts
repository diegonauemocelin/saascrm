/**
 * Nuvemshop (Tiendanube), API 2025-03. Só leitura (GET). Documentação: tiendanube.github.io/api-documentation
 * (intro, authentication, resources/customer, order, abandoned-checkout, product, product-variant, store).
 *
 * - OAuth "authorization code": https://www.tiendanube.com/apps/{app_id}/authorize?state=... → volta com code e state;
 *   POST https://www.tiendanube.com/apps/authorize/token (JSON no corpo) devolve access_token (não expira) e user_id
 *   (id da loja).
 * - Base https://api.nuvemshop.com.br/2025-03/{store_id}; cabeçalhos "Authorization: Bearer" e User-Agent com nome e
 *   e-mail ("If you don't supply this header, you will get a 400 Bad Request").
 * - Paginação page/per_page (até 200); próxima página pelo cabeçalho Link rel="next".
 * - Limite: balde de 40 com vazão de 2 por segundo por loja e app → 600 ms entre chamadas.
 */
import { ext, email, https, money, num, parseDate, str, type LojaCart, type LojaOrder, type LojaProduct, type OrderGroup } from '../lojas'
import type { CartItem, CustomerData, OrderLine } from '../../integracoes/magazord'
import type { LojaAdapter, LojaCtx, Page } from './tipos'
import { arr, getWithRetry, header, httpError, obj, parseJson, rawId, yearsAgo } from './comum'

const KEY = 'nuvemshop' as const
const API = 'https://api.nuvemshop.com.br/2025-03'
const AUTH = 'https://www.tiendanube.com/apps'
export const NUVEMSHOP_USER_AGENT = 'SG Multiconecta CRM (contato@sgmulticonecta.com.br)'
const PER_PAGE = 200
const PAUSE = 600

// ---------- Mapeamento (funções puras) ----------

/** Campos traduzidos vêm como objeto por idioma ({ pt: "...", es: "..." }); fica o português ou o primeiro. */
export function nsText(v: unknown): string | null {
  if (typeof v === 'string' || typeof v === 'number') return str(v)
  const o = obj(v)
  return str(o.pt) ?? str(o.es) ?? str(o.en) ?? str(Object.values(o).find((x) => typeof x === 'string' && x.trim()))
}

/** Cliente (GET /customers). Não lê `identification` (CPF/CNPJ). */
export function customerFromNuvemshop(c: Record<string, unknown>): CustomerData | null {
  const id = str(c?.id, 40)
  if (!id) return null
  const addr = obj(c.default_address)
  return {
    externalId: ext(KEY, id),
    name: str(c.name, 160),
    email: email(c.email),
    phone: str(c.phone, 40) ?? str(c.billing_phone, 40) ?? str(addr.phone, 40),
    company: null,
    city: str(addr.city, 80) ?? str(c.billing_city, 80),
    state: str(addr.province, 80) ?? str(c.billing_province, 80),
    registeredAt: parseDate(c.created_at),
  }
}

const PAYMENT_LABEL: Record<string, string> = {
  authorized: 'Pagamento autorizado',
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  partially_paid: 'Parcialmente pago',
  abandoned: 'Pagamento abandonado',
  refunded: 'Reembolsado',
  partially_refunded: 'Parcialmente reembolsado',
  voided: 'Pagamento anulado',
}

/**
 * Grupo da situação pelos valores da documentação: status "open" | "closed" | "cancelled" e payment_status
 * "authorized" | "pending" | "paid" | "partially_paid" | "abandoned" | "refunded" | "partially_refunded" | "voided".
 */
export function nuvemshopStatus(status: unknown, payment: unknown): { name: string; group: OrderGroup } {
  const s = String(status ?? '').toLowerCase()
  const p = String(payment ?? '').toLowerCase()
  if (s === 'cancelled') return { name: 'Cancelado', group: 'cancelado' }
  const name = PAYMENT_LABEL[p] ?? (s === 'closed' ? 'Arquivado' : s === 'open' ? 'Aberto' : str(p || s, 60) ?? 'Sem situação')
  if (p === 'refunded' || p === 'voided' || p === 'abandoned') return { name, group: 'cancelado' }
  if (p === 'paid' || p === 'partially_refunded') return { name, group: 'pago' }
  if (p === 'pending' || p === 'authorized' || p === 'partially_paid') return { name, group: 'pendente' }
  return { name, group: 'outro' }
}

/** Itens do pedido (products[]): price é o preço unitário na hora da compra. */
export function orderLinesFromNuvemshop(products: unknown): OrderLine[] {
  const out: OrderLine[] = []
  for (const raw of arr(products)) {
    const i = obj(raw)
    const quantity = Math.round(num(i.quantity) ?? 0)
    if (quantity <= 0) continue
    const unit = money(i.price) ?? 0
    out.push({
      sku: str(i.sku, 60),
      name: str(i.name, 200) ?? 'Produto sem nome',
      brand: null,
      quantity,
      total: Math.round(unit * quantity * 100) / 100,
    })
  }
  return out
}

/** Pedido (GET /orders). O cliente vem em `customer` (com o escopo read_customers) ou nos campos contact_*. */
export function orderFromNuvemshop(o: Record<string, unknown>): LojaOrder | null {
  const id = str(o?.id, 40)
  if (!id) return null
  const c = obj(o.customer)
  const cid = str(c.id, 40)
  const customer = cid
    ? customerFromNuvemshop({ ...c, billing_city: o.billing_city, billing_province: o.billing_province, phone: c.phone ?? o.contact_phone, email: c.email ?? o.contact_email, name: c.name ?? o.contact_name })
    : null
  const st = nuvemshopStatus(o.status, o.payment_status)
  const pay = obj(o.payment_details)
  return {
    externalId: ext(KEY, id),
    code: str(o.number, 60) ?? id,
    customerId: cid ? ext(KEY, cid) : null,
    customer,
    orderedAt: parseDate(o.created_at) ?? new Date(),
    total: money(o.total) ?? 0,
    statusName: st.name,
    statusGroup: st.group,
    payment: str(o.gateway_name, 80) ?? str(pay.method, 80),
    channel: str(o.storefront, 40),
    items: Array.isArray(o.products) ? orderLinesFromNuvemshop(o.products) : null,
  }
}

/** Itens do checkout abandonado. */
export function cartItemsFromNuvemshop(products: unknown): CartItem[] {
  return arr(products)
    .slice(0, 50)
    .map((raw) => {
      const i = obj(raw)
      const code = (str(i.sku, 60) ?? str(i.variant_id, 60) ?? str(i.product_id, 60) ?? '').slice(0, 60)
      return { code, name: (str(i.name, 160) ?? code) || 'Produto', qty: Math.max(1, Math.round(num(i.quantity) ?? 1)), image: https(obj(i.image).src), url: null }
    })
}

/**
 * Checkout abandonado (GET /checkouts). Não traz o id do cliente; o contato vai com o id do próprio checkout
 * ("nuvemshop:checkout:123"), para o serviço achar o lead pelo e-mail/telefone. Não lê contact_identification.
 */
export function cartFromNuvemshop(k: Record<string, unknown>): LojaCart | null {
  const id = str(k?.id, 40)
  if (!id) return null
  const mail = email(k.contact_email)
  const phone = str(k.contact_phone, 40) ?? str(k.shipping_phone, 40) ?? str(k.billing_phone, 40)
  const customer: CustomerData | null =
    mail || phone
      ? {
          externalId: ext(KEY, `checkout:${id}`),
          name: str(k.contact_name, 160) ?? str(k.billing_name, 160) ?? str(k.shipping_name, 160),
          email: mail,
          phone,
          company: null,
          city: str(k.shipping_city, 80) ?? str(k.billing_city, 80),
          state: str(k.shipping_province, 80) ?? str(k.billing_province, 80),
          registeredAt: null,
        }
      : null
  return {
    externalId: ext(KEY, id),
    customerId: null,
    customer,
    items: cartItemsFromNuvemshop(k.products),
    value: money(k.total),
    startedAt: parseDate(k.created_at),
    lastActivityAt: parseDate(k.updated_at) ?? parseDate(k.created_at),
    checkoutUrl: https(k.abandoned_checkout_url),
    abandoned: true,
    orderCode: null,
  }
}

/**
 * Produto (GET /products): um registro por variante (preço, estoque e SKU ficam na variante). A documentação não traz
 * o endereço da página do produto (só `handle`, sem o formato da URL), então `url` fica null.
 */
export function productsFromNuvemshop(p: Record<string, unknown>): LojaProduct[] {
  const pid = str(p?.id, 40)
  const base = nsText(p?.name)
  if (!pid || !base) return []
  const images = arr(p.images).map(obj).sort((a, b) => (num(a.position) ?? 0) - (num(b.position) ?? 0))
  const firstImage = https(images[0]?.src)
  const visibility = str(p.visibility, 20)
  const active = visibility ? visibility !== 'hidden' : p.published !== false
  const brand = str(p.brand, 80)
  const variants = arr(p.variants).map(obj)
  return variants
    .map((v): LojaProduct | null => {
      const vid = str(v.id, 40)
      if (!vid) return null
      const values = arr(v.values).map(nsText).filter((x): x is string => !!x)
      const name = variants.length > 1 && values.length ? `${base} - ${values.join(' / ')}` : base
      const full = money(v.price)
      const promo = money(v.promotional_price)
      const onSale = promo !== null && promo > 0 && full !== null && promo < full
      const stock = v.stock_management === false ? null : num(v.stock)
      const vImage = v.image_id ? https(images.find((i) => String(i.id) === String(v.image_id))?.src) : null
      return {
        externalId: ext(KEY, vid),
        code: (str(v.sku, 60) ?? vid).slice(0, 60),
        name: name.slice(0, 200),
        brand,
        price: onSale ? promo : full,
        priceFrom: onSale ? full : null,
        stock: stock === null ? null : Math.trunc(stock),
        image: vImage ?? firstImage,
        url: null,
        active,
      }
    })
    .filter((x): x is LojaProduct => !!x)
}

/** Há próxima página? Cabeçalho Link com rel="next"; sem o cabeçalho, página cheia. */
export function nuvemshopHasNext(headers: Record<string, string>, count: number, perPage: number): boolean {
  const link = header(headers, 'link')
  if (link !== null) return /rel="?next"?/i.test(link)
  return count >= perPage
}

// ---------- Chamadas ----------

function base(ctx: LojaCtx) {
  const store = (ctx.values.storeId ?? '').trim()
  const token = (ctx.values.accessToken ?? '').trim()
  if (!/^\d{1,20}$/.test(store) || !token) throw new Error('Nuvemshop: loja não conectada. Clique em Conectar.')
  return { url: `${API}/${store}`, headers: { Authorization: `Bearer ${token}`, 'User-Agent': NUVEMSHOP_USER_AGENT, Accept: 'application/json' } }
}

/** Lista paginada. 404 numa listagem é "sem resultados" (documentado em /checkouts: "Error finding result with the parameters entered"). */
async function list(ctx: LojaCtx, path: string, params: Record<string, string>, page: number): Promise<{ rows: Record<string, unknown>[]; more: boolean }> {
  const b = base(ctx)
  const q = new URLSearchParams({ ...params, page: String(Math.max(1, page)), per_page: String(PER_PAGE) })
  const r = await getWithRetry(ctx, `${b.url}${path}?${q}`, b.headers, PAUSE)
  if (r.status === 404) return { rows: [], more: false }
  if (r.status !== 200) throw httpError('Nuvemshop', r)
  const rows = arr(parseJson(r.body)).map(obj)
  return { rows, more: rows.length > 0 && nuvemshopHasNext(r.headers, rows.length, PER_PAGE) }
}

const CUSTOMER_FIELDS = 'id,name,email,phone,default_address,billing_phone,billing_city,billing_province,created_at,updated_at'

export const nuvemshop: LojaAdapter = {
  def: {
    key: KEY,
    name: 'Nuvemshop',
    oauth: true,
    fields: [],
    appFields: [
      { key: 'appId', label: 'ID do aplicativo (app_id)', help: 'Número do aplicativo no painel de parceiros da Nuvemshop.' },
      { key: 'clientId', label: 'Client ID', help: 'Normalmente igual ao ID do aplicativo.' },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
    ],
    supports: { customers: true, orders: true, carts: true, cartLink: true, products: true },
    howTo:
      'Clique em Conectar: você vai para a Nuvemshop, entra com o usuário da loja e autoriza o aplicativo da SG Multiconecta. ' +
      'Depois disso o CRM passa a ler clientes, pedidos, carrinhos abandonados (com o link para o cliente voltar à compra) e produtos. ' +
      'A Nuvemshop só mostra carrinhos abandonados dos últimos 30 dias. O CRM só lê dados: nada é alterado na sua loja.',
  },

  authorizeUrl(ctx, _redirectUri, state) {
    const appId = (ctx.app.appId ?? '').trim()
    if (!/^\d{1,20}$/.test(appId)) throw new Error('Nuvemshop: o ID do aplicativo da SG não está configurado.')
    return `${AUTH}/${appId}/authorize?state=${encodeURIComponent(state)}`
  },

  async exchange(ctx, params) {
    const code = (params.code ?? '').trim()
    if (!code) throw new Error('Nuvemshop: a autorização voltou sem o código.')
    const clientId = (ctx.app.clientId || ctx.app.appId || '').trim()
    const clientSecret = (ctx.app.clientSecret ?? '').trim()
    if (!clientId || !clientSecret) throw new Error('Nuvemshop: as chaves do aplicativo da SG não estão configuradas.')
    const r = await ctx.request(`${AUTH}/authorize/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': NUVEMSHOP_USER_AGENT },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
    })
    const j = obj(parseJson(r.body))
    const token = str(j.access_token, 400)
    const storeId = str(j.user_id ?? j.store_id, 20)
    if (r.status !== 200 || !token || !storeId || !/^\d+$/.test(storeId)) throw httpError('Nuvemshop', r)
    await ctx.save({ accessToken: token, storeId })
  },

  async test(ctx) {
    const b = base(ctx)
    const r = await getWithRetry(ctx, `${b.url}/store?fields=id,name,original_domain`, b.headers, PAUSE)
    if (r.status !== 200) throw httpError('Nuvemshop', r)
    const j = obj(parseJson(r.body))
    const name = nsText(j.name) ?? str(j.original_domain) ?? `loja ${str(j.id) ?? ''}`.trim()
    return `Conectado à loja ${name} (Nuvemshop).`
  },

  async customers(ctx, since, page): Promise<Page<CustomerData>> {
    const params: Record<string, string> = { fields: CUSTOMER_FIELDS }
    if (since) params.updated_at_min = since.toISOString()
    const { rows, more } = await list(ctx, '/customers', params, page)
    return { items: rows.map(customerFromNuvemshop).filter((c): c is CustomerData => !!c), more }
  },

  async orders(ctx, since, page): Promise<Page<LojaOrder>> {
    const { rows, more } = await list(ctx, '/orders', { updated_at_min: (since ?? yearsAgo(2)).toISOString() }, page)
    return { items: rows.map(orderFromNuvemshop).filter((o): o is LojaOrder => !!o), more }
  },

  async orderItems(ctx, externalId) {
    const id = rawId(externalId)
    if (!/^\d{1,20}$/.test(id)) return null
    const b = base(ctx)
    const r = await getWithRetry(ctx, `${b.url}/orders/${id}`, b.headers, PAUSE)
    if (r.status !== 200) return null
    return orderLinesFromNuvemshop(obj(parseJson(r.body)).products)
  },

  /**
   * GET /checkouts não tem filtro de data mínima (só since_id, created_at_max e updated_at_max) e só devolve os
   * últimos 30 dias; por isso lê todos os da janela e ignora `since` (o serviço grava por id, sem duplicar).
   */
  async carts(ctx, _since, page): Promise<Page<LojaCart>> {
    const { rows, more } = await list(ctx, '/checkouts', {}, page)
    return { items: rows.map(cartFromNuvemshop).filter((c): c is LojaCart => !!c), more }
  },

  async products(ctx, page): Promise<Page<LojaProduct>> {
    const { rows, more } = await list(ctx, '/products', {}, page)
    return { items: rows.flatMap(productsFromNuvemshop), more }
  },
}
