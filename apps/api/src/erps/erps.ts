/**
 * Integrações com ERPs (Bling, Tiny, Omie, Linx e CIGAM), no mesmo padrão da Trier: o CRM consulta o ERP de tempos em
 * tempos, só lendo (produtos, preço, estoque e custo), e guarda a cópia em erp_products. Cada ERP tem o seu módulo
 * (permissão e plano) e o seu adaptador em ./provedores. Aqui ficam só regras puras (sem banco e sem rede), testadas
 * em test/erps.spec.ts.
 */

export const ERP_KEYS = ['bling', 'tiny', 'omie', 'linx_farma', 'linx_moda', 'cigam'] as const
export type ErpKey = (typeof ERP_KEYS)[number]

/** Campo da tela de configuração. secret: guardado criptografado e nunca devolvido para a tela. */
export interface ErpField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  help?: string
  /** Endereço do servidor do cliente (ERP instalado na empresa): passa pela proteção de rede interna. */
  url?: boolean
  optional?: boolean
}

export interface ErpDef {
  key: ErpKey
  /** Nome na tela e no site. */
  name: string
  /** Para quem é (texto curto). */
  segment: string
  module: string
  fields: ErpField[]
  /** Autorização OAuth (botão "Conectar" na tela). */
  oauth?: boolean
  /** Onde o cliente pega as credenciais (texto da tela). */
  howTo: string
}

/** Produto como o CRM guarda, igual para todos os ERPs. */
export interface ErpProductData {
  code: string
  name: string
  ean: string | null
  brand: string | null
  category: string | null
  ncm: string | null
  unit: string | null
  price: number | null
  stock: number | null
  cost: number | null
  active: boolean
  /** Id interno no ERP (para buscar o estoque, quando vem em outra consulta). */
  externalId: string | null
}

export interface ErpSettings {
  enabled: boolean
  /** Valores dos campos; os secretos criptografados (enc:...). */
  values: Record<string, string>
  /** Guarda o custo do ERP (Preços e promoções). Desligado por padrão. */
  importCost: boolean
  /** Cópia completa a cada N horas. */
  fullEveryHours: number
}

export const DEFAULT_ERP_SETTINGS: ErpSettings = { enabled: false, values: {}, importCost: false, fullEveryHours: 6 }

export interface ErpState {
  running: boolean
  runningSince: string | null
  lastFullAt: string | null
  lastOkAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  products: number
  /** OAuth: quando o acesso foi autorizado e até quando vale o token de acesso. */
  connectedAt: string | null
}

export const DEFAULT_ERP_STATE: ErpState = { running: false, runningSince: null, lastFullAt: null, lastOkAt: null, lastError: null, lastErrorAt: null, products: 0, connectedAt: null }

export const settingsKey = (k: ErpKey) => `erp_${k}`
export const stateKey = (k: ErpKey) => `erp_${k}_state`
export const moduleOf = (k: ErpKey) => `erp_${k}`

/** Limites de cada cópia: defesa contra paginação que não termina. */
export const ERP_MAX_PAGES = 2000
export const ERP_TIMEOUT_MS = 30_000
export const ERP_MAX_BYTES = 30 * 1024 * 1024

const str = (v: unknown, max = 200) => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
export const text = str
/** Número em formato brasileiro ou americano ("1.234,56", "1234.56", 12). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim()
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
export const money = (v: unknown) => {
  const n = num(v)
  return n === null || n < 0 ? null : Math.round(n * 100) / 100
}
export const digitsOrNull = (v: unknown, min = 1, max = 20) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length >= min && d.length <= max ? d : null
}

/** Limpa a configuração (horas entre 1 e 48). */
export function cleanErpSettings(raw: Partial<ErpSettings> | null | undefined, base: ErpSettings = DEFAULT_ERP_SETTINGS): ErpSettings {
  const r = raw ?? {}
  const hours = Number(r.fullEveryHours)
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(r.values && typeof r.values === 'object' ? r.values : base.values)) if (typeof v === 'string' && /^[a-zA-Z]{1,40}$/.test(k)) values[k] = v.slice(0, 8000)
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : base.enabled,
    values,
    importCost: typeof r.importCost === 'boolean' ? r.importCost : base.importCost,
    fullEveryHours: Number.isInteger(hours) && hours >= 1 && hours <= 48 ? hours : base.fullEveryHours,
  }
}

/** Hora da próxima cópia completa? */
export function fullDue(now: Date, st: ErpState, s: ErpSettings) {
  if (!st.lastFullAt) return true
  return now.getTime() - Date.parse(st.lastFullAt) >= s.fullEveryHours * 3_600_000
}

/** Texto de busca: sem acento, minúsculo (código, nome, EAN, marca). */
export function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
export function searchTextOf(p: Pick<ErpProductData, 'code' | 'name' | 'ean' | 'brand' | 'category'>) {
  return fold([p.code, p.name, p.ean, p.brand, p.category].filter(Boolean).join(' ')).slice(0, 1000)
}

/** Endereço do servidor do ERP (instalado na empresa): http(s), sem usuário/senha na URL, sem barra no fim. */
export function normalizeServerUrl(raw: string): string {
  let s = raw.trim()
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    throw new Error('Endereço inválido. Ex.: http://erp.suaempresa.com.br:8080')
  }
  if (u.username || u.password) throw new Error('Não coloque usuário e senha no endereço.')
  if (u.search || u.hash) throw new Error('Informe só o endereço do servidor, sem parâmetros.')
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
}

/** Mensagem para erro HTTP do ERP. */
export function httpErrorText(name: string, status: number) {
  if (status === 401 || status === 403) return `${name} recusou o acesso (${status}): confira as credenciais.`
  if (status === 404) return `${name} respondeu 404: confira o endereço.`
  if (status === 429) return `${name} pediu para esperar (limite de consultas). A próxima rodada tenta de novo.`
  if (status >= 500) return `${name} está com erro (${status}). A próxima rodada tenta de novo.`
  return `${name} respondeu ${status}.`
}
