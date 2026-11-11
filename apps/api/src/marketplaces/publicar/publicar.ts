/**
 * Marketplaces › Publicar do ERP: funções puras (regra de medicamentos, filtro do que pode ser publicado, título,
 * preço, atributos e o corpo do anúncio do Mercado Livre). Testadas em test/marketplace-publicar.spec.ts.
 *
 * Documentação oficial usada (developers.mercadolivre.com.br/pt_br):
 * - publicacao-de-produtos: POST /items (title, category_id, price, currency_id, available_quantity, buying_mode,
 *   condition, listing_type_id, pictures, attributes); descrição em POST /items/{id}/description depois de criar;
 *   max_title_length da categoria (60 no exemplo); available_quantity 0 cria o anúncio pausado (out_of_stock).
 * - publicacao-no-catalogo / buscador-de-produtos: GET /products/search?status=active&site_id=MLB&product_identifier=<GTIN>
 *   e POST /items com catalog_product_id + catalog_listing: true (o vendedor confirma que o produto é o mesmo da ficha).
 * - categorizacao-de-produtos: GET /sites/MLB/domain_discovery/search?q=&limit=3 e
 *   GET /catalog_domains/{domain_id}/categories (domínio → categoria).
 * - atributos: GET /categories/{id}/attributes (tags required / catalog_required / conditional_required) e
 *   SELLER_PACKAGE_HEIGHT/LENGTH/WIDTH (cm, inteiros) e SELLER_PACKAGE_WEIGHT (g, inteiro).
 * - trabalhar-com-imagens: POST /pictures/items/upload (multipart, campo file; JPG/PNG até 10 MB) → pictures: [{ id }].
 * - user-products: vendedor com a tag "user_product_seller" (GET /users/{id}) publica com family_name no lugar de title.
 *
 * Medicamentos: os Termos do Mercado Livre (anexo "Produtos proibidos") não permitem anunciar medicamentos de uso
 * humano: https://www.mercadolivre.com.br/ajuda/produtos-proibidos_1028 e
 * https://www.mercadolivre.com.br/ajuda/Medicamentos-e-produtos-de-saude_1046 . A venda de medicamentos no ML fica
 * restrita ao fluxo Pharma da própria plataforma; aqui medicamento nunca é publicado (decisão do dono do SaaS: a
 * farmácia só anuncia higiene, perfumaria e correlatos).
 */

import { fold, validGtin } from '../../trier/trier'

export const PUBLICAR_CONFIG_KEY = 'ml_publicar'
export const ML_SITE = 'MLB'
export const LISTING_TYPES = ['gold_special', 'gold_pro'] as const
export type ListingType = (typeof LISTING_TYPES)[number]
export const LISTING_LABEL: Record<ListingType, string> = { gold_special: 'Clássico', gold_pro: 'Premium' }
export const DEFAULT_MAX_TITLE = 60
export const MAX_PICTURES = 10

/** Palavras que indicam medicamento no tipo, classificação, grupo, departamento ou categoria da Trier. */
export const DEFAULT_MEDICINE_WORDS = [
  'medicamento',
  'remedio',
  'farmaco',
  'generico',
  'similar',
  'etico',
  'referencia',
  'controlado',
  'psicotropico',
  'portaria 344',
  'tarja',
  'receita',
  'antibiotico',
  'otc',
  'mip',
  'isento de prescricao',
  'fitoterapico',
  'homeopatico',
  'manipulado',
  'injetavel',
  'vacina',
]

export interface PublicarConfig {
  /** Preço e estoque do anúncio seguem o ERP (padrão ligado). */
  keepSynced: boolean
  /** Acréscimo (%) sobre o preço do ERP no anúncio (0 = mesmo preço; pode ser negativo até -50). */
  markupPct: number
  /** Palavras de medicamento (configuráveis; padrão acima). */
  medicineWords: string[]
  /** O que pode ser publicado: departamentos, grupos e categorias da Trier escolhidos (nada escolhido = nada aparece). */
  allowedDepartments: string[]
  allowedGroups: string[]
  allowedCategories: string[]
  /** Tipo de anúncio padrão. */
  listingType: ListingType
}

export const DEFAULT_PUBLICAR: PublicarConfig = {
  keepSynced: true,
  markupPct: 0,
  medicineWords: DEFAULT_MEDICINE_WORDS,
  allowedDepartments: [],
  allowedGroups: [],
  allowedCategories: [],
  listingType: 'gold_special',
}

const cleanList = (v: unknown, max: number, len: number): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean))].slice(0, max) : null

export function cleanPublicar(raw: Partial<Record<keyof PublicarConfig, unknown>>, base: PublicarConfig = DEFAULT_PUBLICAR): PublicarConfig {
  const markup = Number(raw.markupPct)
  const words = cleanList(raw.medicineWords, 100, 60)
  return {
    keepSynced: typeof raw.keepSynced === 'boolean' ? raw.keepSynced : base.keepSynced,
    markupPct: raw.markupPct !== undefined && Number.isFinite(markup) && markup >= -50 && markup <= 300 ? Math.round(markup * 100) / 100 : base.markupPct,
    // Lista vazia volta para o padrão: a regra de medicamento nunca fica sem palavras.
    medicineWords: words ? (words.length ? words.map(fold) : DEFAULT_MEDICINE_WORDS) : base.medicineWords,
    allowedDepartments: cleanList(raw.allowedDepartments, 500, 120) ?? base.allowedDepartments,
    allowedGroups: cleanList(raw.allowedGroups, 500, 120) ?? base.allowedGroups,
    allowedCategories: cleanList(raw.allowedCategories, 500, 120) ?? base.allowedCategories,
    listingType: (LISTING_TYPES as readonly string[]).includes(raw.listingType as string) ? (raw.listingType as ListingType) : base.listingType,
  }
}

export interface ErpProductLike {
  code: string
  name: string
  ean: string | null
  brand: string | null
  department: string | null
  groupName: string | null
  category: string | null
  classification: string | null
  typeName: string | null
  activeIngredient: string | null
  compounded: boolean
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Motivo para o produto ser tratado como medicamento (ou null): princípio ativo preenchido, manipulado, ou uma palavra
 * de medicamento no início de uma palavra do tipo, classificação, grupo, departamento ou categoria.
 */
export function medicineReason(p: ErpProductLike, words: readonly string[] = DEFAULT_MEDICINE_WORDS): string | null {
  if (p.activeIngredient && p.activeIngredient.trim()) return `tem princípio ativo (${p.activeIngredient.trim()})`
  if (p.compounded) return 'produto manipulado'
  const fields: [string, string | null][] = [
    ['tipo', p.typeName],
    ['classificação', p.classification],
    ['grupo', p.groupName],
    ['departamento', p.department],
    ['categoria', p.category],
  ]
  for (const [label, value] of fields) {
    if (!value) continue
    const text = fold(value)
    for (const w of words) {
      const word = fold(w).trim()
      if (word && new RegExp(`(^|[^a-z0-9])${escapeRe(word)}`).test(text)) return `${label} "${value}"`
    }
  }
  return null
}

export const MEDICINE_BLOCK = 'Não pode ser anunciado no Mercado Livre: medicamento'

/** Está na lista do que a empresa escolheu publicar (departamento, grupo ou categoria; comparação sem acentos)? */
export function allowedByFilter(p: Pick<ErpProductLike, 'department' | 'groupName' | 'category'>, c: Pick<PublicarConfig, 'allowedDepartments' | 'allowedGroups' | 'allowedCategories'>): boolean {
  const has = (list: string[], v: string | null) => !!v && list.some((x) => fold(x) === fold(v))
  return has(c.allowedDepartments, p.department) || has(c.allowedGroups, p.groupName) || has(c.allowedCategories, p.category)
}

/** Pode aparecer para publicar? Bloqueio de medicamento primeiro, depois o filtro da empresa. */
export function publishEligibility(p: ErpProductLike, c: PublicarConfig): { ok: true } | { ok: false; reason: string; medicine: boolean } {
  const med = medicineReason(p, c.medicineWords)
  if (med) return { ok: false, reason: `${MEDICINE_BLOCK} (${med}).`, medicine: true }
  if (!allowedByFilter(p, c)) return { ok: false, reason: 'Fora do que a empresa liberou para publicar (departamento, grupo ou categoria).', medicine: false }
  return { ok: true }
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o', 'p/', 'c/'])

/** Nome em maiúsculas do ERP → "Shampoo Anticaspa 200ml" (medidas em minúsculas, palavras curtas minúsculas). */
export function niceCase(text: string): string {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length
  if (!letters.length || upper / letters.length < 0.7) return text
  return text
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (/\d/.test(w)) return w
      if (i > 0 && SMALL.has(w)) return w
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

/**
 * Título do anúncio: espaços normalizados, sem a palavra "estoque" (o ML modera), sem caixa alta e cortado na última
 * palavra inteira dentro do limite da categoria (60 caracteres por padrão).
 */
export function mlTitle(name: string, max = DEFAULT_MAX_TITLE): string {
  let t = name.replace(/\s+/g, ' ').trim()
  t = t.replace(/\bestoques?\b/gi, '').replace(/\s+/g, ' ').trim()
  t = niceCase(t)
  if (t.length <= max) return t
  const cut = t.slice(0, max + 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.5 ? cut.slice(0, sp) : t.slice(0, max)).replace(/[\s,;:\-–/]+$/, '')
}

/** Preço do anúncio: preço do ERP com o acréscimo (%) da empresa, em centavos. */
export function listingPrice(erpPrice: number | null, markupPct: number): number | null {
  if (erpPrice === null || !(erpPrice > 0)) return null
  return Math.round(erpPrice * (1 + markupPct / 100) * 100) / 100
}

/** Quantidade do anúncio: estoque inteiro, nunca negativo (0 pausa o anúncio no ML). */
export const listingQuantity = (stock: number | null) => (stock === null ? 0 : Math.max(0, Math.floor(stock)))

/** Atributo da categoria (GET /categories/{id}/attributes), só o que o CRM usa. */
export interface CategoryAttribute {
  id: string
  name: string
  value_type?: string
  tags?: Record<string, boolean | undefined>
  values?: { id: string; name: string }[]
  allowed_units?: { id: string; name: string }[]
}

export interface AttrValue {
  id: string
  value_id?: string
  value_name?: string
}

/** Obrigatórios para o anúncio: tag required (tradicional) ou catalog_required; read_only/hidden não. */
export function requiredAttributes(list: CategoryAttribute[], mode: 'catalogo' | 'tradicional'): CategoryAttribute[] {
  return list.filter((a) => {
    const t = a.tags ?? {}
    if (t.read_only || t.hidden) return false
    return !!t.required || (mode === 'tradicional' && !!t.catalog_required)
  })
}

const IGNORE_FILLED = new Set(['SELLER_SKU'])

/** Atributos preenchidos com o que o ERP tem: marca (laboratório), GTIN (EAN válido), SKU do vendedor e pacote. */
export function prefillAttributes(p: ErpProductLike & { widthMm: number | null; heightMm: number | null; depthMm: number | null; weightG: number | null }, category: CategoryAttribute[]): AttrValue[] {
  const out: AttrValue[] = []
  const byId = new Map(category.map((a) => [a.id, a]))
  const withValue = (id: string, name: string) => {
    const a = byId.get(id)
    const match = a?.values?.find((v) => fold(v.name) === fold(name))
    out.push(match ? { id, value_id: match.id, value_name: match.name } : { id, value_name: name })
  }
  if (p.brand) withValue('BRAND', p.brand)
  if (validGtin(p.ean)) out.push({ id: 'GTIN', value_name: p.ean! })
  out.push({ id: 'SELLER_SKU', value_name: p.code })
  // Pacote: a Trier informa em mm e g; o ML aceita só inteiros em cm e g.
  const cm = (mm: number | null) => (mm && mm > 0 ? Math.max(1, Math.ceil(mm / 10)) : null)
  const h = cm(p.heightMm)
  const w = cm(p.widthMm)
  const l = cm(p.depthMm)
  if (h && w && l && p.weightG && p.weightG > 0) {
    out.push({ id: 'SELLER_PACKAGE_HEIGHT', value_name: `${h} cm` }, { id: 'SELLER_PACKAGE_WIDTH', value_name: `${w} cm` }, { id: 'SELLER_PACKAGE_LENGTH', value_name: `${l} cm` }, { id: 'SELLER_PACKAGE_WEIGHT', value_name: `${Math.ceil(p.weightG)} g` })
  }
  return out
}

/** Junta atributos (os da pessoa por cima dos do ERP), sem vazios e sem repetir. */
export function mergeAttributes(base: AttrValue[], over: AttrValue[]): AttrValue[] {
  const map = new Map<string, AttrValue>()
  for (const a of [...base, ...over]) {
    if (!a?.id || !/^[A-Z0-9_]{2,60}$/.test(a.id)) continue
    const value_name = a.value_name?.toString().trim().slice(0, 255)
    const value_id = a.value_id?.toString().trim().slice(0, 60)
    if (!value_name && !value_id) {
      map.delete(a.id)
      continue
    }
    map.set(a.id, { id: a.id, ...(value_id ? { value_id } : {}), ...(value_name ? { value_name } : {}) })
  }
  return [...map.values()]
}

/** Obrigatórios ainda sem valor (nomes para a tela). */
export function missingAttributes(required: CategoryAttribute[], filled: AttrValue[]): CategoryAttribute[] {
  const ok = new Set(filled.filter((a) => a.value_id || a.value_name).map((a) => a.id))
  return required.filter((a) => !IGNORE_FILLED.has(a.id) && !ok.has(a.id))
}

export interface DraftLike {
  mode: 'catalogo' | 'tradicional'
  title: string
  categoryId: string | null
  catalogProductId: string | null
  listingType: ListingType
  price: number | null
  quantity: number | null
  freeShipping: boolean
  attributes: AttrValue[]
  pictures: { id: string }[]
}

/** O que falta para publicar (lista em português; vazia = pode enviar). */
export function draftProblems(d: DraftLike, missing: CategoryAttribute[]): string[] {
  const out: string[] = []
  if (!d.categoryId) out.push('Escolha a categoria do Mercado Livre.')
  if (d.mode === 'catalogo' && !d.catalogProductId) out.push('Anúncio de catálogo sem o produto do catálogo.')
  if (!d.title.trim()) out.push('Informe o título.')
  if (d.price === null || !(d.price > 0)) out.push('Produto sem preço de venda no ERP.')
  if (d.mode === 'tradicional' && !d.pictures.length) out.push('Envie pelo menos uma foto (a Trier não fornece fotos).')
  if (missing.length) out.push(`Preencha os atributos obrigatórios: ${missing.map((m) => m.name).join(', ')}.`)
  return out
}

/** Corpo do POST /items. Vendedor no modelo User Products manda family_name no lugar de title. */
export function buildItemBody(d: DraftLike, opts: { userProductSeller: boolean }): Record<string, unknown> {
  const body: Record<string, unknown> = {
    site_id: ML_SITE,
    category_id: d.categoryId,
    price: d.price,
    currency_id: 'BRL',
    available_quantity: listingQuantity(d.quantity),
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: d.listingType,
    attributes: d.attributes,
    pictures: d.mode === 'catalogo' ? [] : d.pictures.slice(0, MAX_PICTURES).map((p) => ({ id: p.id })),
  }
  if (opts.userProductSeller) body.family_name = d.title
  else body.title = d.title
  if (d.mode === 'catalogo') {
    body.catalog_product_id = d.catalogProductId
    body.catalog_listing = true
  }
  if (d.freeShipping) body.shipping = { mode: 'me2', free_shipping: true }
  return body
}

/** Dicas em português para os códigos de erro mais comuns do Mercado Livre na publicação. */
const HINTS: [RegExp, string][] = [
  [/seller\.package\.dimensions|seller_package/i, 'Informe as medidas do pacote (altura, largura e comprimento em cm inteiros e peso em g).'],
  [/attributes?\.missing|missing_required|required.*attribute/i, 'Faltam atributos obrigatórios da categoria.'],
  [/title.*(length|long)|max_title/i, 'Título maior que o permitido pela categoria.'],
  [/picture|image/i, 'Problema com as fotos: use JPG ou PNG, de 500 a 1920 px, até 10 MB.'],
  [/catalog_listing\.not_eligible|not_eligible/i, 'Este produto não é elegível ao catálogo: publique como anúncio tradicional.'],
  [/price/i, 'O preço não foi aceito pela categoria ou pelo tipo de anúncio.'],
  [/shipping|me2|mercadoenvios/i, 'Frete não aceito: confira o Mercado Envios da conta ou desligue o frete grátis.'],
  [/forbidden|prohibited|restricted|moderat/i, 'O Mercado Livre bloqueou o anúncio por política (produto restrito ou proibido).'],
  [/gtin/i, 'O código de barras (GTIN) não foi aceito.'],
]

export function explainMlError(message: string): string {
  const hint = HINTS.find(([re]) => re.test(message))?.[1]
  const clean = message.slice(0, 600)
  return hint ? `${hint} (${clean})` : clean
}

/** Repetir a chamada? POST de criação só em 429 (o ML não criou nada); atualização também em erro do servidor. */
export function retryDelayFor(kind: 'create' | 'update') {
  return (status: number, attempt: number): number | null => {
    if (attempt >= 3) return null
    if (status === 429) return 2000 * 2 ** attempt
    if (kind === 'update' && status >= 500) return 1500 * 2 ** attempt
    return null
  }
}

/** O anúncio precisa ser atualizado (preço ou estoque diferentes do último enviado)? */
export function needsUpdate(p: { desiredPrice: number | null; desiredQuantity: number | null; sentPrice: number | null; sentQuantity: number | null }) {
  const priceDiff = p.desiredPrice !== null && (p.sentPrice === null || Math.abs(p.desiredPrice - p.sentPrice) >= 0.005)
  const qtyDiff = p.desiredQuantity !== null && p.desiredQuantity !== p.sentQuantity
  return { price: priceDiff, quantity: qtyDiff, any: priceDiff || qtyDiff }
}
