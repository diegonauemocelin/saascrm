/**
 * Integrações com plataformas de loja virtual (Tray, Nuvemshop e Loja Integrada), no padrão da Magazord: clientes
 * viram leads (origem "Ecommerce"), pedidos marcam a venda, carrinhos vão para Carrinhos abandonados e produtos para o
 * Catálogo. Só leitura na loja. Cada plataforma é liberada pela plataforma SG para a empresa que a usa. Ids externos
 * levam o prefixo da plataforma ("tray:123") para nunca misturar com outra loja. Regras puras (test/lojas.spec.ts).
 */
import type { CartItem, CustomerData, OrderLine } from '../integracoes/magazord'

export const LOJA_KEYS = ['tray', 'nuvemshop', 'loja_integrada'] as const
export type LojaKey = (typeof LOJA_KEYS)[number]

export const lojaModule = (k: LojaKey) => `loja_${k}`
export const lojaSettingsKey = (k: LojaKey) => `loja_${k}`
export const lojaStateKey = (k: LojaKey) => `loja_${k}_state`
/** Id externo com o prefixo da plataforma. */
export const ext = (k: LojaKey, id: string | number) => `${k}:${id}`

export type OrderGroup = 'pago' | 'pendente' | 'cancelado' | 'outro'

export interface LojaOrder {
  externalId: string
  code: string
  customerId: string | null
  customer: CustomerData | null
  orderedAt: Date
  total: number
  statusName: string
  statusGroup: OrderGroup
  payment: string | null
  channel: string | null
  /** null = os itens não vieram nesta consulta (não mexe nos itens já gravados). */
  items: OrderLine[] | null
}

export interface LojaCart {
  externalId: string
  customerId: string | null
  customer: CustomerData | null
  items: CartItem[]
  value: number | null
  startedAt: Date | null
  lastActivityAt: Date | null
  /** Link para o cliente retomar a compra (só https). */
  checkoutUrl: string | null
  /** A plataforma já considera abandonado. */
  abandoned: boolean
  /** Virou pedido (código do pedido). */
  orderCode: string | null
}

export interface LojaProduct {
  externalId: string
  code: string
  name: string
  brand: string | null
  price: number | null
  priceFrom: number | null
  stock: number | null
  image: string | null
  url: string | null
  active: boolean
}

export interface LojaSettings {
  enabled: boolean
  /** Campos da tela e tokens; os secretos criptografados (enc:...). */
  values: Record<string, string>
  importCustomers: boolean
  importOrders: boolean
  importCarts: boolean
  importProducts: boolean
  /** Horas sem atividade para o carrinho aberto contar como abandonado. */
  abandonHours: number
  tags: string[]
}

export const DEFAULT_LOJA: LojaSettings = { enabled: false, values: {}, importCustomers: true, importOrders: true, importCarts: true, importProducts: true, abandonHours: 2, tags: ['ecommerce'] }

export interface LojaState {
  running: boolean
  lastRunAt: string | null
  lastOkAt: string | null
  lastError: string | null
  connectedAt: string | null
  customersCursor: string | null
  ordersCursor: string | null
  cartsCursor: string | null
  productsAt: string | null
  totals: { customers: number; leadsCreated: number; orders: number; carts: number; products: number }
}

export const DEFAULT_LOJA_STATE: LojaState = {
  running: false,
  lastRunAt: null,
  lastOkAt: null,
  lastError: null,
  connectedAt: null,
  customersCursor: null,
  ordersCursor: null,
  cartsCursor: null,
  productsAt: null,
  totals: { customers: 0, leadsCreated: 0, orders: 0, carts: 0, products: 0 },
}

export function cleanLoja(raw: Partial<LojaSettings> | null | undefined, base: LojaSettings = DEFAULT_LOJA): LojaSettings {
  const r = raw ?? {}
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(r.values && typeof r.values === 'object' ? r.values : base.values)) if (typeof v === 'string' && /^[a-zA-Z]{1,40}$/.test(k)) values[k] = v.slice(0, 8000)
  const hours = Number(r.abandonHours)
  return {
    enabled: b(r.enabled, base.enabled),
    values,
    importCustomers: b(r.importCustomers, base.importCustomers),
    importOrders: b(r.importOrders, base.importOrders),
    importCarts: b(r.importCarts, base.importCarts),
    importProducts: b(r.importProducts, base.importProducts),
    abandonHours: Number.isFinite(hours) && hours >= 1 && hours <= 72 ? Math.round(hours) : base.abandonHours,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 10) : base.tags,
  }
}

// ---------- Leitura comum ----------

export const str = (v: unknown, max = 200) => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
export const money = (v: unknown) => {
  const n = num(v)
  return n === null || n < 0 ? null : Math.round(n * 100) / 100
}
/** Só links https (vão para e-mail e WhatsApp). */
export const https = (v: unknown, max = 500) => {
  const s = str(v, 2000)
  return s && /^https:\/\/[^\s]+$/i.test(s) ? s.slice(0, max) : null
}
/** Data ISO ou "AAAA-MM-DD hh:mm:ss" (sem fuso = horário de Brasília). */
export function parseDate(v: unknown): Date | null {
  const s = str(v, 40)
  if (!s || /^0{4}-/.test(s)) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (!m) return null
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
export const email = (v: unknown) => {
  const s = str(v, 200)?.toLowerCase() ?? null
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}
