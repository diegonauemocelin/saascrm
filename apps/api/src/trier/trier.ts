/**
 * Trier Sistemas (SGF, ERP de farmácias): funções puras da integração. Aqui é o CRM que chama o servidor da farmácia
 * (diferente da Tcar, em que o ERP chama o CRM). Rotas e campos tirados da especificação OpenAPI oficial da Trier
 * ("API-SGF"): BASE_URL = http://<ip-ou-ddns>:4647/sgfpod1, métodos em <BASE_URL>/rest/integracao/..., autenticação
 * Bearer com o token fornecido pela Trier. A especificação não tem rota de fotos: a Trier não fornece imagens.
 * Testadas em test/trier.spec.ts.
 */

export const TRIER_KEY = 'trier'
export const TRIER_STATE_KEY = 'trier_state'

/** Registros por página nas consultas à Trier. */
export const TRIER_PAGE_SIZE = 500
/** Limite de páginas por consulta (500 × 400 = 200 mil produtos): defesa contra paginação que não termina. */
export const TRIER_MAX_PAGES = 400
/** Folga na consulta de alterados (o relógio do servidor da farmácia pode estar adiantado ou atrasado). */
export const TRIER_SLACK_MS = 5 * 60_000
/** Tempo máximo de cada chamada à Trier e tamanho máximo da resposta. */
export const TRIER_TIMEOUT_MS = 30_000
export const TRIER_MAX_BYTES = 30 * 1024 * 1024

/** Rotas da Trier que o CRM usa (somente leitura). Qualquer outra é recusada antes de sair. */
export const TRIER_ROUTES = ['produto/obter-todos-v1', 'produto/obter-alterados-v1', 'estoque/obter-todos-v1', 'estoque/obter-alterados-v1'] as const
export type TrierRoute = (typeof TRIER_ROUTES)[number]

export interface TrierSettings {
  enabled: boolean
  /** Endereço do servidor da Trier, já normalizado (ex.: http://farmacia.ddns.net:4647/sgfpod1). */
  baseUrl: string
  /** Token Bearer da Trier, criptografado. */
  tokenEnc: string | null
  /** Só os produtos marcados para e-commerce na Trier aparecem para publicar (padrão ligado). */
  ecommerceOnly: boolean
  /** Usa o preço e o estoque de e-commerce da Trier quando houver (padrão ligado). */
  useEcommerceValues: boolean
  /** Guarda o custo médio da Trier (Preços e promoções, origem "erp"). Desligado por padrão. */
  importCost: boolean
  fullEveryHours: number
  incrementalMinutes: number
}

export const DEFAULT_TRIER: TrierSettings = {
  enabled: false,
  baseUrl: '',
  tokenEnc: null,
  ecommerceOnly: true,
  useEcommerceValues: true,
  importCost: false,
  fullEveryHours: 6,
  incrementalMinutes: 15,
}

export interface TrierState {
  lastFullAt: string | null
  lastIncrementalAt: string | null
  running: 'full' | 'incremental' | null
  runningSince: string | null
  lastError: string | null
  lastErrorAt: string | null
  lastOkAt: string | null
  products: number
  /** Índice do primeiro registro aceito pela Trier (0 ou 1), descoberto no teste de conexão. */
  firstIndex: 0 | 1
}

export const DEFAULT_TRIER_STATE: TrierState = { lastFullAt: null, lastIncrementalAt: null, running: null, runningSince: null, lastError: null, lastErrorAt: null, lastOkAt: null, products: 0, firstIndex: 0 }

const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

/** Configuração gravada/recebida, com os limites (cópia completa de 1 a 48 h; alterados de 10 a 120 min). */
export function cleanTrier(raw: Partial<Record<keyof TrierSettings, unknown>>, base: TrierSettings = DEFAULT_TRIER): TrierSettings {
  const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    enabled: b(raw.enabled, base.enabled),
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : base.baseUrl,
    tokenEnc: typeof raw.tokenEnc === 'string' || raw.tokenEnc === null ? (raw.tokenEnc as string | null) : base.tokenEnc,
    ecommerceOnly: b(raw.ecommerceOnly, base.ecommerceOnly),
    useEcommerceValues: b(raw.useEcommerceValues, base.useEcommerceValues),
    importCost: b(raw.importCost, base.importCost),
    fullEveryHours: intIn(raw.fullEveryHours, 1, 48, base.fullEveryHours),
    incrementalMinutes: intIn(raw.incrementalMinutes, 10, 120, base.incrementalMinutes),
  }
}

/**
 * Endereço do servidor da Trier digitado pela pessoa → endereço base (protocolo, host, porta e /sgfpod1). Aceita
 * "farmacia.ddns.net:4647", "http://1.2.3.4:4647/sgfpod1" ou com "/rest" no fim. Lança Error com a mensagem em português.
 */
export function normalizeBaseUrl(raw: string): string {
  let text = raw.trim()
  if (!text) throw new Error('Informe o endereço do servidor da Trier (ex.: http://farmacia.ddns.net:4647).')
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`
  let u: URL
  try {
    u = new URL(text)
  } catch {
    throw new Error('Endereço inválido. Use o formato http://<ip-ou-ddns>:4647.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('O endereço precisa começar com http:// ou https://.')
  if (u.username || u.password) throw new Error('Não coloque usuário ou senha no endereço: o acesso é pelo token.')
  if (u.search || u.hash) throw new Error('Informe só o endereço do servidor, sem "?" ou "#".')
  if (!u.hostname || u.hostname.length > 253) throw new Error('Endereço inválido.')
  let path = u.pathname.replace(/\/+$/, '')
  path = path.replace(/\/rest(\/integracao)?$/i, '')
  if (!path) path = '/sgfpod1'
  if (!/^\/[A-Za-z0-9_-]{1,40}$/.test(path)) throw new Error('Caminho inválido: o padrão da Trier é /sgfpod1.')
  return `${u.protocol}//${u.host}${path}`
}

/** URL de uma rota da Trier com os parâmetros (só rotas da lista). */
export function trierUrl(baseUrl: string, route: TrierRoute, params: Record<string, string | number | boolean>): string {
  if (!(TRIER_ROUTES as readonly string[]).includes(route)) throw new Error('Rota da Trier não permitida.')
  const u = new URL(`${baseUrl}/rest/integracao/${route}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  return u.toString()
}

/** Parâmetros de uma página (o primeiro registro é 0 ou 1, conforme o servidor aceitou no teste). */
export function pageParams(page: number, firstIndex: 0 | 1, size = TRIER_PAGE_SIZE) {
  return { primeiroRegistro: firstIndex + page * size, quantidadeRegistros: size }
}

/** Data em ISO 8601 sem milissegundos (formato pedido pela Trier). */
export const isoNoMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** Janela da consulta de alterados: desde a última consulta (ou cópia completa), com 5 min de folga, até agora. */
export function changedWindow(st: Pick<TrierState, 'lastIncrementalAt' | 'lastFullAt'>, now: Date) {
  const base = st.lastIncrementalAt ?? st.lastFullAt
  const since = base ? new Date(Date.parse(base) - TRIER_SLACK_MS) : new Date(now.getTime() - 24 * 3_600_000)
  return { dataInicial: isoNoMs(since), dataFinal: isoNoMs(now) }
}

/** O que rodar agora: cópia completa, alterados ou nada. */
export function nextSync(now: Date, st: Pick<TrierState, 'lastFullAt' | 'lastIncrementalAt'>, s: Pick<TrierSettings, 'fullEveryHours' | 'incrementalMinutes'>): 'full' | 'incremental' | null {
  const t = now.getTime()
  if (!st.lastFullAt || t - Date.parse(st.lastFullAt) >= s.fullEveryHours * 3_600_000) return 'full'
  const last = st.lastIncrementalAt ?? st.lastFullAt
  if (t - Date.parse(last) >= s.incrementalMinutes * 60_000) return 'incremental'
  return null
}

/** Texto sem acentos, minúsculo (busca e regras). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const str = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.trunc(n)
}
const money = (v: unknown): number | null => {
  const n = num(v)
  return n === null || n < 0 || n > 10_000_000 ? null : Math.round(n * 100) / 100
}
const dim = (v: unknown): number | null => {
  const n = int(v)
  return n !== null && n > 0 && n < 10_000_000 ? n : null
}
const date = (v: unknown): Date | null => {
  if (typeof v !== 'string' || !v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t) : null
}

/** EAN/GTIN válido (8, 12, 13 ou 14 dígitos com dígito verificador certo). */
export function validGtin(code: string | null | undefined): boolean {
  if (!code || !/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export interface TrierProductData {
  code: string
  ean: string | null
  name: string
  ecommerceName: string | null
  description: string | null
  brand: string | null
  brandCode: number | null
  department: string | null
  groupName: string | null
  category: string | null
  classification: string | null
  ncm: string | null
  unit: string | null
  price: number | null
  ecommercePrice: number | null
  stock: number | null
  ecommerceStock: number | null
  cost: number | null
  active: boolean
  ecommerce: boolean
  widthMm: number | null
  heightMm: number | null
  depthMm: number | null
  weightG: number | null
  typeName: string | null
  typeCode: number | null
  activeIngredient: string | null
  activeIngredientCode: string | null
  compounded: boolean
  listType: string | null
  changedAt: Date | null
  searchText: string
}

/**
 * ProdutoIntegracaoDto da Trier → produto do CRM. O custo (valorCustoMedio, senão valorCusto) só entra com
 * "Importar custo do ERP" ligado. Sem código ou nome, devolve null.
 */
export function productFromTrier(row: Record<string, unknown>, opts: { importCost: boolean }): TrierProductData | null {
  const codeN = int(row.codigo)
  const name = str(row.nome, 300)
  if (codeN === null || codeN < 0 || !name) return null
  const code = String(codeN)
  const barcode = row.codigoBarras === null || row.codigoBarras === undefined ? '' : String(row.codigoBarras).replace(/\D/g, '')
  // O código de barras vem como número: um EAN-13 que começa com 0 chega com 12 dígitos.
  let ean = barcode.length >= 8 && barcode.length <= 14 ? barcode : null
  if (ean && !validGtin(ean) && ean.length < 13 && validGtin(ean.padStart(13, '0'))) ean = ean.padStart(13, '0')
  const tipo = row.tipo && typeof row.tipo === 'object' ? (row.tipo as Record<string, unknown>) : {}
  const ncmDigits = str(row.codClaFiscal, 20)?.replace(/\D/g, '') ?? ''
  const data: Omit<TrierProductData, 'searchText'> = {
    code,
    ean,
    name,
    ecommerceName: str(row.nomeEcommerce, 300),
    description: str(row.descricaoEcommerce, 5000),
    brand: str(row.nomeLaboratorio, 120),
    brandCode: int(row.codigoLaboratorio),
    department: str(row.nomeDepartamento ?? row.nomDepto, 120),
    groupName: str(row.nomeGrupo, 120),
    category: str(row.nomeCategoria, 120),
    classification: str(row.nomeClassificacao, 120),
    ncm: ncmDigits.length === 8 ? ncmDigits : null,
    unit: str(row.unidade, 10),
    price: money(row.valorVenda),
    ecommercePrice: money(row.valorVendaEcommerce),
    stock: int(row.quantidadeEstoque),
    ecommerceStock: int(row.quantidadeEstoqueEcommerce),
    cost: opts.importCost ? (money(row.valorCustoMedio) ?? money(row.valorCusto)) : null,
    active: row.ativo !== false,
    ecommerce: row.integracaoEcommerce === true,
    widthMm: dim(row.larguraEcommerce),
    heightMm: dim(row.alturaEcommerce),
    depthMm: dim(row.profundidadeEcommerce),
    weightG: dim(row.pesoEcommerce),
    typeName: str(tipo.nome ?? row.nomTipo, 120),
    typeCode: int(tipo.codigo ?? row.codTipo),
    activeIngredient: str(row.nomePrincipioAtivo, 200),
    activeIngredientCode: str(row.codigoPrincipioAtivo, 40),
    compounded: /^(s|sim|true|1)$/i.test(String(row.produtoManipulado ?? '').trim()),
    listType: str(row.tipoLista, 40),
    changedAt: date(row.dataAlteracao),
  }
  return { ...data, searchText: fold([code, ean, data.name, data.ecommerceName, data.brand, data.department, data.groupName, data.category, data.activeIngredient].filter(Boolean).join(' ')) }
}

/** EstoqueIntegracaoDto → { código, quantidade } (estoque geral da Trier). */
export function stockFromTrier(row: Record<string, unknown>): { code: string; stock: number } | null {
  const code = int(row.codigoProduto)
  const stock = int(row.quantidadeEstoque)
  if (code === null || code < 0 || stock === null) return null
  return { code: String(code), stock }
}

/** Resposta da Trier: lista de registros (qualquer outra coisa vira erro). */
export function rowsOf(body: unknown): Record<string, unknown>[] {
  if (!Array.isArray(body)) throw new Error('A Trier respondeu num formato inesperado (era esperada uma lista).')
  return body.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
}

/** Preço e estoque que valem: os de e-commerce quando a empresa usa e a Trier preenche; senão os gerais. */
export function effectiveValues(p: { price: number | null; ecommercePrice: number | null; stock: number | null; ecommerceStock: number | null }, useEcommerce: boolean) {
  const price = useEcommerce && p.ecommercePrice !== null && p.ecommercePrice > 0 ? p.ecommercePrice : p.price
  const stock = useEcommerce && p.ecommerceStock !== null ? p.ecommerceStock : p.stock
  return { price, stock: stock === null ? null : Math.max(0, stock) }
}

/** Mensagem em português para uma resposta de erro da Trier. */
export function trierHttpError(status: number): string {
  if (status === 401 || status === 403) return 'A Trier recusou o token (401/403). Confira o token fornecido pela Trier.'
  if (status === 404) return 'Rota não encontrada na Trier (404). Confira o endereço (o padrão termina em /sgfpod1) e a versão do SGF.'
  if (status === 400) return 'A Trier recusou a consulta (400).'
  if (status >= 500) return `O servidor da Trier respondeu com erro (${status}). Tente de novo mais tarde.`
  return `A Trier respondeu ${status}.`
}

// ---------- Acesso pela VPN (IP privado liberado pela plataforma) ----------

export const TRIER_VPN_KEY = 'trier_vpn'

/** Liberação do acesso pela VPN, gravada só pela empresa da plataforma: um IP privado e uma porta exatos. */
export interface TrierVpn {
  /** "ip:porta" (IPv6 entre colchetes), ou null. */
  allowed: string | null
  by: string | null
  at: string | null
}
export const DEFAULT_TRIER_VPN: TrierVpn = { allowed: null, by: null, at: null }

/** Host (sem colchetes) e porta (padrão do protocolo) do endereço base. */
export function hostPort(baseUrl: string): { host: string; port: number } {
  const u = new URL(baseUrl)
  return { host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80 }
}

const fmtHostPort = (host: string, port: number) => (host.includes(':') ? `[${host.toLowerCase()}]:${port}` : `${host}:${port}`)

/**
 * "ip:porta" digitado pela plataforma → forma canônica. Só IP privado de faixa aceita para VPN (nunca faixa inteira,
 * loopback, link-local ou metadados de nuvem). Lança Error com a mensagem.
 */
export function cleanVpnAddress(raw: string, isPrivateIp: (ip: string) => boolean, eligible: (ip: string) => boolean): string {
  const m = /^\s*(?:\[([0-9a-f:.]+)\]|(\d{1,3}(?:\.\d{1,3}){3})):(\d{1,5})\s*$/i.exec(raw)
  if (!m) throw new Error('Informe o IP e a porta exatos do servidor da Trier na VPN (ex.: 10.8.0.20:4647).')
  const ip = (m[1] ?? m[2])!
  const port = Number(m[3])
  if (!(port >= 1 && port <= 65535)) throw new Error('Porta inválida.')
  if (!isPrivateIp(ip)) throw new Error('Esse IP é público: não precisa de liberação.')
  if (!eligible(ip)) throw new Error('Esse IP não pode ser liberado (loopback, link-local, metadados de nuvem ou reservado). Use o IP do servidor da Trier na rede da VPN.')
  return fmtHostPort(ip, port)
}

export type TrierVpnStatus = 'publico' | 'liberado' | 'aguardando' | 'bloqueado'

/**
 * Situação do endereço: público (DDNS/IP público), privado já liberado pela plataforma (com a mesma porta), privado
 * aguardando a liberação, ou bloqueado (loopback, link-local, metadados). Nomes de host são conferidos na conexão.
 */
export function vpnStatus(baseUrl: string, vpn: Pick<TrierVpn, 'allowed'>, isPrivateIp: (ip: string) => boolean, eligible: (ip: string) => boolean, isIpLiteral: (s: string) => boolean): TrierVpnStatus {
  const { host, port } = hostPort(baseUrl)
  if (!isIpLiteral(host) || !isPrivateIp(host)) return 'publico'
  if (!eligible(host)) return 'bloqueado'
  return vpn.allowed === fmtHostPort(host, port) ? 'liberado' : 'aguardando'
}
