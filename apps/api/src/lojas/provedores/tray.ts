/**
 * Tray Commerce. Só leitura (GET). Documentação: developers.tray.com.br (Autorização, API de Clientes, Pedidos,
 * Carrinho de Compra, Produtos, Informações da loja).
 *
 * - OAuth: https://{dominio_da_loja}/auth.php?response_type=code&consumer_key=...&callback=... → a Tray acrescenta
 *   ?code=...&store=...&api_address=... ao callback (por isso o state vai no caminho do callback).
 * - POST {api_address}/auth (consumer_key, consumer_secret, code) → access_token, refresh_token,
 *   date_expiration_access_token, api_host, store_id. Renovação: GET {api_address}/auth?refresh_token=...
 * - access_token vai na query. Paginação limit (máx. 50) + page; resposta com paging.total. 404 = "No records found".
 * - Limite: 180 requisições por minuto (e 10 mil por dia por loja) → 400 ms entre chamadas.
 */
import { ext, email, https, money, num, parseDate, str, type LojaCart, type LojaOrder, type LojaProduct, type OrderGroup } from '../lojas'
import type { CartItem, CustomerData, OrderLine } from '../../integracoes/magazord'
import type { LojaAdapter, LojaCtx, Page } from './tipos'
import { arr, brDate, daysAgo, getWithRetry, httpError, obj, parseJson, rawId, yearsAgo } from './comum'

const KEY = 'tray' as const
const LIMIT = 50
const PAUSE = 400

// ---------- Endereços ----------

/** Domínio da loja digitado pelo lojista ("https://www.minhaloja.com.br/" → "www.minhaloja.com.br"). */
export function trayStoreHost(input: string | null | undefined): string | null {
  const v = (input ?? '').trim().toLowerCase()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`)
    if (u.username || u.password || u.port) return null
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(u.hostname) ? u.hostname : null
  } catch {
    return null
  }
}

const sameHost = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '')

/**
 * Endereço da API devolvido pela Tray (api_address/api_host), sempre em https e sem barra no fim. Como as chaves do
 * aplicativo da SG são enviadas para ele, só vale se for o domínio da loja informado na tela ou um domínio
 * *.commercesuite.com.br (domínio da plataforma Tray nos exemplos da documentação).
 */
export function trayApiAddress(input: string | null | undefined, storeHost: string | null): string | null {
  const v = (input ?? '').trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (u.username || u.password || u.port || u.search || u.hash) return null
    const host = u.hostname.toLowerCase()
    const allowed = (storeHost && sameHost(host, storeHost)) || host.endsWith('.commercesuite.com.br')
    if (!allowed) return null
    return `https://${host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/** Filtro de período da Tray ("[start], [end]", formato aaaa-mm-dd): do dia de `since` até o fim de hoje. */
export function trayRange(since: Date, now = new Date()): string {
  return `${brDate(since)},${brDate(now)} 23:59:59`
}

// ---------- Mapeamento (funções puras) ----------

const isZero = (v: unknown) => v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '0'

/** Cliente (GET /customers ou /customers/:id). Não lê cpf, cnpj nem rg. */
export function customerFromTray(raw: Record<string, unknown>): CustomerData | null {
  const c = raw && 'Customer' in raw ? obj(raw.Customer) : obj(raw)
  const id = str(c.id, 40)
  if (!id || isZero(id)) return null
  return {
    externalId: ext(KEY, id),
    name: str(c.name, 160),
    email: email(c.email),
    phone: str(c.cellphone, 40) ?? str(c.phone, 40),
    company: str(c.company_name, 160),
    city: str(c.city, 80),
    state: str(c.state, 40),
    registeredAt: parseDate(c.created) ?? parseDate(c.registration_date),
  }
}

/** Situações padrão da Tray (tabela "Status de pedidos") que já indicam pagamento confirmado. */
const PAID_STATUSES = ['A ENVIAR', 'A ENVIAR YAPAY', 'A ENVIAR VINDI', 'ENVIADO', 'FINALIZADO']
const PENDING_STATUSES = ['AGUARDANDO PAGAMENTO', 'AGUARDANDO YAPAY', 'AGUARDANDO VINDI']

/**
 * Grupo da situação pela documentação: OrderStatus.type "open" (em andamento), "closed" (finalizado) e "canceled";
 * situações padrão da tabela de status; e has_payment ("1" = existe pagamento efetuado). O resto fica 'outro'.
 */
export function trayStatus(o: Record<string, unknown>): { name: string; group: OrderGroup } {
  const status = str(o.status, 80) ?? ''
  const os = obj(o.OrderStatus)
  const type = String(os.type ?? '').toLowerCase()
  const up = status.toUpperCase()
  const name = str(os.display_name, 80) ?? (status || 'Sem situação')
  if (type === 'canceled' || type === 'cancelled' || up === 'CANCELADO') return { name, group: 'cancelado' }
  if (type === 'closed' || PAID_STATUSES.includes(up)) return { name, group: 'pago' }
  if (String(o.has_payment ?? '') === '1') return { name, group: 'pago' }
  if (PENDING_STATUSES.includes(up)) return { name, group: 'pendente' }
  return { name, group: 'outro' }
}

/** Itens de /orders/:id/complete (ProductsSold[].ProductsSold). price é o preço unitário. */
export function orderLinesFromTray(productsSold: unknown): OrderLine[] {
  const out: OrderLine[] = []
  for (const raw of arr(productsSold)) {
    const r = obj(raw)
    const i = 'ProductsSold' in r ? obj(r.ProductsSold) : r
    const quantity = Math.round(num(i.quantity) ?? 0)
    if (quantity <= 0) continue
    const unit = money(i.price) ?? 0
    out.push({
      sku: str(i.reference, 60),
      name: str(i.original_name, 200) ?? str(i.name, 200) ?? 'Produto sem nome',
      brand: str(i.brand, 80),
      quantity,
      total: Math.round(unit * quantity * 100) / 100,
    })
  }
  return out
}

/** Pedido (GET /orders: Orders[].Order; ou /orders/:id/complete: Order, que já traz Customer e ProductsSold). */
export function orderFromTray(raw: Record<string, unknown>): LojaOrder | null {
  const o = raw && 'Order' in raw ? obj(raw.Order) : obj(raw)
  const id = str(o.id, 40)
  if (!id) return null
  const date = str(o.date, 10)
  const st = trayStatus(o)
  const cid = isZero(o.customer_id) ? null : str(o.customer_id, 40)
  const full = Object.keys(obj(o.Customer)).length ? customerFromTray(obj(o.Customer)) : null
  const sold = arr(o.ProductsSold)
  const hasItems = sold.some((s) => obj(s).ProductsSold !== undefined)
  return {
    externalId: ext(KEY, id),
    code: id,
    customerId: cid ? ext(KEY, cid) : null,
    customer: full,
    orderedAt: parseDate(date ? `${date} ${str(o.hour, 8) ?? '00:00:00'}` : null) ?? new Date(),
    total: money(o.total) ?? 0,
    statusName: st.name,
    statusGroup: st.group,
    payment: str(o.payment_form, 80) ?? str(o.payment_method, 80),
    channel: str(o.point_sale, 60),
    items: hasItems ? orderLinesFromTray(sold) : null,
  }
}

/** Linhas de GET /carts/:session_id (uma linha "Cart" por produto). Aceita lista, { Cart: [...] } ou { Cart: {...} }. */
export function trayCartRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.map((r) => obj(obj(r).Cart ?? r))
  const c = obj(body).Cart
  return Array.isArray(c) ? c.map(obj) : c ? [obj(c)] : []
}

/**
 * Carrinho a partir das linhas de GET /carts/:session_id. A Tray não tem link de recuperação nem marca de abandono
 * (checkoutUrl null, abandoned false: o serviço decide pelo tempo sem atividade).
 */
export function cartFromTray(sessionId: string, rows: Record<string, unknown>[]): LojaCart | null {
  const sid = str(sessionId, 80)
  if (!sid || !rows.length) return null
  const items: CartItem[] = rows.slice(0, 50).map((r) => {
    const code = (str(r.product_id, 60) ?? '').slice(0, 60)
    return {
      code,
      name: (str(r.product_name, 160) ?? code) || 'Produto',
      qty: Math.max(1, Math.round(num(r.quantity) ?? 1)),
      image: https(obj(r.product_image).https),
      url: https(obj(r.product_url).https),
    }
  })
  const times = rows.map((r) => parseDate(r.date ? `${r.date} ${str(r.hour, 8) ?? '00:00:00'}` : null)).filter((d): d is Date => !!d).map((d) => d.getTime())
  const value = rows.reduce((s, r) => s + (money(r.price) ?? 0) * Math.max(1, num(r.quantity) ?? 1), 0)
  const cidRaw = rows.map((r) => r.customer_id).find((v) => !isZero(v))
  const cid = cidRaw !== undefined ? str(cidRaw, 40) : null
  const mail = rows.map((r) => email(r.email)).find(Boolean) ?? null
  return {
    externalId: ext(KEY, sid),
    customerId: cid ? ext(KEY, cid) : null,
    customer: cid ? { externalId: ext(KEY, cid), name: null, email: mail, phone: null, company: null, city: null, state: null, registeredAt: null } : null,
    items,
    value: Math.round(value * 100) / 100,
    startedAt: times.length ? new Date(Math.min(...times)) : null,
    lastActivityAt: times.length ? new Date(Math.max(...times)) : null,
    checkoutUrl: null,
    abandoned: false,
    orderCode: null,
  }
}

/** Produto (GET /products: Products[].Product). Promoção vale se promotional_price > 0, menor que price e dentro do período. */
export function productFromTray(raw: Record<string, unknown>, now = new Date()): LojaProduct | null {
  const p = raw && 'Product' in raw ? obj(raw.Product) : obj(raw)
  const id = str(p.id, 40)
  const name = str(p.name, 200)
  if (!id || !name) return null
  const full = money(p.price)
  const promo = money(p.promotional_price)
  const start = parseDate(p.start_promotion)
  const end = parseDate(p.end_promotion)
  const inPeriod = (!start || start.getTime() <= now.getTime()) && (!end || end.getTime() + 86_400_000 > now.getTime())
  const onSale = promo !== null && promo > 0 && full !== null && promo < full && inPeriod
  const stock = num(p.stock)
  const img = obj(arr(p.ProductImage)[0])
  return {
    externalId: ext(KEY, id),
    code: (str(p.reference, 60) ?? id).slice(0, 60),
    name,
    brand: str(p.brand, 80),
    price: onSale ? promo : full,
    priceFrom: onSale ? full : null,
    stock: stock === null ? null : Math.trunc(stock),
    image: https(img.https),
    url: https(obj(p.url).https),
    active: String(p.available ?? '1') === '1',
  }
}

/** Há mais páginas pelo bloco paging ({ total, page, limit }). */
export function trayHasMore(paging: unknown): boolean {
  const p = obj(paging)
  const total = num(p.total) ?? 0
  const page = num(p.page) ?? 1
  const limit = num(p.limit) ?? LIMIT
  return page * limit < total
}

// ---------- Chamadas ----------

/** Token válido (renova com o refresh_token quando vence em menos de 5 minutos). */
async function session(ctx: LojaCtx, force = false): Promise<{ api: string; token: string }> {
  const api = trayApiAddress(ctx.values.apiAddress, trayStoreHost(ctx.values.storeDomain))
  let token = (ctx.values.accessToken ?? '').trim()
  if (!api || !token) throw new Error('Tray: loja não conectada. Clique em Conectar.')
  const exp = parseDate(ctx.values.expiresAt)
  if (force || (exp && exp.getTime() - 5 * 60_000 < Date.now())) {
    const refresh = (ctx.values.refreshToken ?? '').trim()
    if (!refresh) throw new Error('Tray: a chave de acesso venceu. Conecte de novo.')
    const r = await getWithRetry(ctx, `${api}/auth?refresh_token=${encodeURIComponent(refresh)}`, { Accept: 'application/json' }, PAUSE)
    const j = obj(parseJson(r.body))
    const t = str(j.access_token, 400)
    if ((r.status !== 200 && r.status !== 201) || !t) throw httpError('Tray (renovar chave)', r)
    token = t
    const patch = tokenPatch(j)
    Object.assign(ctx.values, patch)
    await ctx.save(patch)
  }
  return { api, token }
}

/** Valores a guardar da resposta de /auth. */
export function tokenPatch(j: Record<string, unknown>): Record<string, string> {
  const patch: Record<string, string> = {}
  const t = str(j.access_token, 400)
  const rt = str(j.refresh_token, 400)
  const exp = parseDate(j.date_expiration_access_token)
  if (t) patch.accessToken = t
  if (rt) patch.refreshToken = rt
  if (exp) patch.expiresAt = exp.toISOString()
  return patch
}

/** GET com access_token na query; em 401 renova a chave uma vez e repete. */
async function get(ctx: LojaCtx, path: string, params: Record<string, string> = {}): Promise<{ status: number; json: unknown; raw: { status: number; body: string; headers: Record<string, string> } }> {
  let s = await session(ctx)
  const call = () => getWithRetry(ctx, `${s.api}${path}?${new URLSearchParams({ ...params, access_token: s.token })}`, { Accept: 'application/json' }, PAUSE)
  let r = await call()
  if (r.status === 401 && (ctx.values.refreshToken ?? '').trim()) {
    s = await session(ctx, true)
    r = await call()
  }
  return { status: r.status, json: parseJson(r.body), raw: r }
}

async function list(ctx: LojaCtx, path: string, root: string, params: Record<string, string>, page: number) {
  const r = await get(ctx, path, { ...params, limit: String(LIMIT), page: String(Math.max(1, page)) })
  if (r.status === 404) return { rows: [] as Record<string, unknown>[], more: false }
  if (r.status !== 200) throw httpError('Tray', r.raw)
  const j = obj(r.json)
  const rows = arr(j[root]).map(obj)
  return { rows, more: rows.length > 0 && trayHasMore(j.paging) }
}

const CUSTOMER_ATTRS = 'id,name,email,phone,cellphone,company_name,city,state,created,registration_date,modified'

export const tray: LojaAdapter = {
  def: {
    key: KEY,
    name: 'Tray',
    oauth: true,
    fields: [
      {
        key: 'storeDomain',
        label: 'Endereço da loja',
        placeholder: 'www.minhaloja.com.br',
        help: 'O endereço da sua loja Tray (o mesmo que abre a loja no navegador).',
      },
    ],
    appFields: [
      { key: 'consumerKey', label: 'Consumer Key' },
      { key: 'consumerSecret', label: 'Consumer Secret', secret: true },
    ],
    supports: { customers: true, orders: true, carts: true, cartLink: false, products: true },
    howTo:
      'Informe o endereço da sua loja Tray, salve e clique em Conectar: a Tray abre a tela para autorizar o aplicativo da SG Multiconecta. ' +
      'Depois disso o CRM passa a ler clientes, pedidos, carrinhos com cliente identificado e produtos. ' +
      'A Tray não fornece link para o cliente retomar o carrinho. O CRM só lê dados: nada é alterado na sua loja.',
  },

  authorizeUrl(ctx, redirectUri, state) {
    const host = trayStoreHost(ctx.values.storeDomain)
    if (!host) throw new Error('Tray: informe o endereço da loja antes de conectar.')
    const key = (ctx.app.consumerKey ?? '').trim()
    if (!key) throw new Error('Tray: a Consumer Key do aplicativo da SG não está configurada.')
    // A Tray acrescenta ?code=...&store=...&api_address=... ao callback: o state vai no caminho.
    const callback = `${redirectUri.replace(/\/+$/, '')}/${encodeURIComponent(state)}`
    return `https://${host}/auth.php?${new URLSearchParams({ response_type: 'code', consumer_key: key, callback })}`
  },

  async exchange(ctx, params) {
    const code = (params.code ?? '').trim()
    if (!code) throw new Error('Tray: a autorização voltou sem o código.')
    const storeHost = trayStoreHost(ctx.values.storeDomain)
    const api = trayApiAddress(params.api_address, storeHost)
    if (!api) throw new Error('Tray: o endereço da API devolvido não confere com o endereço da loja informado.')
    const key = (ctx.app.consumerKey ?? '').trim()
    const secret = (ctx.app.consumerSecret ?? '').trim()
    if (!key || !secret) throw new Error('Tray: as chaves do aplicativo da SG não estão configuradas.')
    const r = await ctx.request(`${api}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ consumer_key: key, consumer_secret: secret, code }).toString(),
    })
    const j = obj(parseJson(r.body))
    const patch = tokenPatch(j)
    if ((r.status !== 200 && r.status !== 201) || !patch.accessToken) throw httpError('Tray', r)
    const host = trayApiAddress(str(j.api_host), storeHost) ?? api
    const storeId = str(j.store_id ?? params.store, 20)
    await ctx.save({ ...patch, apiAddress: host, ...(storeId && /^\d+$/.test(storeId) ? { storeId } : {}) })
  },

  async test(ctx) {
    const r = await get(ctx, '/info')
    if (r.status !== 200) throw httpError('Tray', r.raw)
    const j = obj(r.json)
    const name = str(j.name, 120)
    return name ? `Conectado à loja ${name} (Tray).` : 'Conectado à Tray.'
  },

  /** Listagem com o filtro "modified" (está em availableFilters). attrs pede só os campos usados (sem CPF/CNPJ); se a loja recusar, lê sem attrs. */
  async customers(ctx, since, page): Promise<Page<CustomerData>> {
    const params: Record<string, string> = { attrs: CUSTOMER_ATTRS }
    if (since) params.modified = trayRange(since)
    let res = await list(ctx, '/customers', 'Customers', params, page).catch(() => null)
    if (!res) {
      delete params.attrs
      res = await list(ctx, '/customers', 'Customers', params, page)
    }
    return { items: res.rows.map(customerFromTray).filter((c): c is CustomerData => !!c), more: res.more }
  },

  /** A listagem não traz itens nem dados do cliente (só customer_id): itens em orderItems (/orders/:id/complete). */
  async orders(ctx, since, page): Promise<Page<LojaOrder>> {
    const { rows, more } = await list(ctx, '/orders', 'Orders', { modified: trayRange(since ?? yearsAgo(2)) }, page)
    return { items: rows.map(orderFromTray).filter((o): o is LojaOrder => !!o), more }
  },

  async orderItems(ctx, externalId) {
    const id = rawId(externalId)
    if (!/^\d{1,20}$/.test(id)) return null
    const r = await get(ctx, `/orders/${id}/complete`)
    if (r.status !== 200) return null
    return orderLinesFromTray(obj(obj(r.json).Order).ProductsSold)
  },

  /** Carrinhos com comprador vinculado (has_customer=1) no período (date_time); itens e datas de GET /carts/:session_id. */
  async carts(ctx, since, page): Promise<Page<LojaCart>> {
    const { rows, more } = await list(ctx, '/carts', 'Carts', { has_customer: '1', date_time: trayRange(since ?? daysAgo(30)) }, page)
    const items: LojaCart[] = []
    for (const row of rows) {
      const sid = str(obj(row.Cart ?? row).session_id, 80)
      if (!sid || !/^[A-Za-z0-9_-]+$/.test(sid)) continue
      const r = await get(ctx, `/carts/${sid}`)
      if (r.status !== 200) continue
      const cart = cartFromTray(sid, trayCartRows(r.json))
      if (cart) items.push(cart)
    }
    return { items, more }
  },

  async products(ctx, page): Promise<Page<LojaProduct>> {
    const { rows, more } = await list(ctx, '/products', 'Products', {}, page)
    return { items: rows.map((p) => productFromTray(p)).filter((p): p is LojaProduct => !!p), more }
  },
}
