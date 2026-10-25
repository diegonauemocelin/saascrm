/**
 * Sistemas vendidos nos planos da plataforma: cada um libera um grupo de módulos do CRM. Os módulos da base valem para
 * toda empresa. Funções puras, testadas em test/plataforma.spec.ts.
 */
import { MODULE_KEYS, type PermissionSet } from '../common/permissions'

/** Sempre liberados (cadastro, usuários e administração da própria empresa). */
export const BASE_MODULES = ['dashboard', 'leads', 'cadastros', 'usuarios', 'perfis', 'configuracoes', 'sugestoes', 'auditoria'] as const

export const SYSTEMS = [
  { key: 'atendimento', label: 'Atendimento (Pré-Vendas e Pós-Vendas)', modules: ['pre_vendas', 'pos_vendas'] },
  { key: 'whatsapp', label: 'WhatsApp (chat, números e monitoramento)', modules: ['chat', 'monitoramento', 'whatsapp'] },
  { key: 'captura', label: 'Captura de leads (formulários, pop-ups e botões)', modules: ['captura'] },
  { key: 'email_marketing', label: 'E-mail marketing, landing pages e automações', modules: ['email_marketing', 'automacoes'] },
  { key: 'postagens', label: 'Postagens no Instagram e no Facebook', modules: ['postagens'] },
  { key: 'ecommerce', label: 'Integração com e-commerce (catálogo, carrinhos abandonados e SEO)', modules: ['carrinhos', 'catalogo', 'seo_ecommerce'], onRequest: true },
  { key: 'erp', label: 'Integração com ERP (consulta de produtos, estoque e preço)', modules: ['consulta_produtos'], onRequest: true },
  { key: 'relatorios', label: 'Relatórios e Google Ads', modules: ['relatorios', 'google_ads'] },
  { key: 'marketing_inteligente', label: 'Marketing Inteligente', modules: ['mi_executivo', 'mi_midia', 'mi_social', 'mi_seo', 'mi_comercial', 'mi_ia', 'mi_orcamento', 'mi_relatorios', 'mi_config'] },
  { key: 'marketplaces', label: 'Marketplaces (Mercado Livre Ads e assistente de perguntas)', modules: ['marketplaces', 'assist_atendimento', 'assist_conhecimento', 'assist_aplicacoes', 'assist_config'] },
] as const

export type SystemKey = (typeof SYSTEMS)[number]['key']
export const SYSTEM_KEYS = SYSTEMS.map((s) => s.key) as readonly string[]

/** Módulo só da empresa dona da plataforma (painel de empresas, planos e cobranças). */
export const PLATFORM_MODULE = 'plataforma'

/** Módulos que a empresa pode usar: a base, os dos sistemas do plano e, na empresa dona, todos. */
export function allowedModules(t: { isPlatform: boolean; systems: readonly string[] }): Set<string> {
  if (t.isPlatform) return new Set(MODULE_KEYS)
  const out = new Set<string>(BASE_MODULES)
  for (const s of SYSTEMS) if (t.systems.includes(s.key)) for (const m of s.modules) out.add(m)
  return out
}

/**
 * Sistemas sob consulta (integrações com e-commerce e ERP): ficam no menu de todas as empresas; quem não tem vê a tela
 * para falar com a SG Multiconecta. Devolve os módulos desses sistemas que a empresa ainda não tem.
 */
export function onRequestModules(allowed: Set<string>): string[] {
  return SYSTEMS.filter((s) => 'onRequest' in s && s.onRequest).flatMap((s) => s.modules).filter((m) => !allowed.has(m))
}

/** Permissões do usuário só nos módulos liberados para a empresa (o administrador recebe todos os liberados). */
export function filterPermissions(perms: PermissionSet, allowed: Set<string>): PermissionSet {
  return Object.fromEntries(Object.entries(perms).filter(([m]) => allowed.has(m)))
}

export const cleanSystems = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter((s): s is string => typeof s === 'string' && SYSTEM_KEYS.includes(s)))] : [])

// ---------- Venda: sistemas avulsos, kits e completo ----------

/** Sistemas que podem ser vendidos avulsos ou num kit (os sob consulta ficam fora). */
export const SELLABLE_KEYS = SYSTEMS.filter((s) => !('onRequest' in s && s.onRequest)).map((s) => s.key) as readonly string[]

/** Dias de teste aceitos (planos e venda avulsa). */
export const TRIAL_OPTIONS = [0, 3, 7, 14, 30] as const

/**
 * Como a plataforma vende (configuração da empresa dona, chave "venda"): preços à mostra ou sob consulta, e a venda de
 * sistemas avulsos (valor mensal de cada um, quais podem ser escolhidos, limites e dias de teste de quem monta o seu).
 */
export interface SaleSettings {
  showPrices: boolean
  avulso: boolean
  /** Valor mensal de cada sistema, em centavos. */
  prices: Record<string, number>
  sellable: string[]
  maxUsers: number
  maxWhatsapp: number
  trialDays: number
}

export const SALE_DEFAULTS: SaleSettings = { showPrices: false, avulso: false, prices: {}, sellable: [], maxUsers: 3, maxWhatsapp: 1, trialDays: 3 }

const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

export function cleanSale(raw: unknown): SaleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pricesRaw = (r.prices && typeof r.prices === 'object' ? r.prices : {}) as Record<string, unknown>
  const prices: Record<string, number> = {}
  for (const k of SELLABLE_KEYS) {
    const v = intIn(pricesRaw[k], 0, 10_000_000, -1)
    if (v >= 0) prices[k] = v
  }
  return {
    showPrices: r.showPrices === true,
    avulso: r.avulso === true,
    prices,
    sellable: cleanSystems(r.sellable).filter((k) => SELLABLE_KEYS.includes(k)),
    maxUsers: intIn(r.maxUsers, 1, 10_000, SALE_DEFAULTS.maxUsers),
    maxWhatsapp: intIn(r.maxWhatsapp, 0, 10_000, SALE_DEFAULTS.maxWhatsapp),
    trialDays: (TRIAL_OPTIONS as readonly number[]).includes(Number(r.trialDays)) ? Number(r.trialDays) : SALE_DEFAULTS.trialDays,
  }
}

/** Mensalidade de quem montou o seu: soma do valor mensal de cada sistema escolhido. */
export const avulsoTotal = (systems: readonly string[], s: Pick<SaleSettings, 'prices'>) => systems.reduce((sum, k) => sum + (s.prices[k] ?? 0), 0)

/** Sistemas escolhidos no "monte o seu": só os liberados para venda avulsa, sem repetir. */
export function chosenSystems(list: unknown, s: Pick<SaleSettings, 'sellable'>): string[] {
  return cleanSystems(list).filter((k) => s.sellable.includes(k))
}

/** Kit "completo": tem todos os sistemas vendidos (os sob consulta não contam). */
export const isComplete = (systems: readonly string[]) => SELLABLE_KEYS.every((k) => systems.includes(k))

// ---------- Situação da assinatura ----------

export const TENANT_STATUSES = ['TESTE', 'AGUARDANDO_PAGAMENTO', 'ATIVA', 'ATRASADA', 'SUSPENSA', 'CANCELADA'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]
export const STATUS_LABEL: Record<TenantStatus, string> = {
  TESTE: 'Em teste',
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  ATIVA: 'Ativa',
  ATRASADA: 'Pagamento atrasado',
  SUSPENSA: 'Suspensa',
  CANCELADA: 'Cancelada',
}

/** Dias depois do vencimento em que o acesso ainda funciona (com aviso). */
export const GRACE_DAYS = 5
const DAY = 86_400_000

export interface Access {
  blocked: boolean
  /** Motivo do bloqueio (aparece na tela). */
  reason: string | null
  /** Aviso sem bloquear (teste acabando, mensalidade vencida dentro da tolerância). */
  warning: string | null
}

const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** A empresa pode usar o sistema agora? Sem pagamento confirmado, não libera; no teste, até o fim do teste. */
export function accessOf(t: { isPlatform: boolean; status: string; trialEndsAt: Date | null; paidUntil: Date | null }, now = Date.now(), graceDays = GRACE_DAYS): Access {
  if (t.isPlatform) return { blocked: false, reason: null, warning: null }
  if (t.status === 'CANCELADA') return { blocked: true, reason: 'A assinatura foi cancelada. Fale com a SG Multiconecta para reativar.', warning: null }
  if (t.status === 'SUSPENSA') return { blocked: true, reason: 'O acesso está suspenso por falta de pagamento. Pague a mensalidade para liberar na hora.', warning: null }
  if (t.status === 'AGUARDANDO_PAGAMENTO') return { blocked: true, reason: 'Aguardando a confirmação do pagamento da primeira mensalidade. Assim que o pagamento for confirmado, o acesso é liberado.', warning: null }
  if (t.status === 'TESTE') {
    if (!t.trialEndsAt || t.trialEndsAt.getTime() <= now) return { blocked: true, reason: 'O período de teste terminou. Pague a primeira mensalidade para continuar usando (seus dados continuam guardados).', warning: null }
    const days = Math.ceil((t.trialEndsAt.getTime() - now) / DAY)
    return { blocked: false, reason: null, warning: `Teste grátis: ${days === 1 ? 'termina amanhã' : `faltam ${days} dias`} (até ${fmt(t.trialEndsAt)}). Pague a primeira mensalidade para não perder o acesso.` }
  }
  // ATIVA ou ATRASADA: vale o "pago até", com a tolerância.
  if (t.paidUntil && now > t.paidUntil.getTime()) {
    const limit = new Date(t.paidUntil.getTime() + graceDays * DAY)
    if (now > limit.getTime()) return { blocked: true, reason: `A mensalidade venceu em ${fmt(t.paidUntil)} e não foi paga. Pague para liberar o acesso na hora.`, warning: null }
    return { blocked: false, reason: null, warning: `A mensalidade venceu em ${fmt(t.paidUntil)}. Pague até ${fmt(limit)} para não ter o acesso bloqueado.` }
  }
  return { blocked: false, reason: null, warning: null }
}

/** Situação que a rotina diária grava (ATIVA → ATRASADA → SUSPENSA), conforme o vencimento. */
export function nextStatus(t: { isPlatform: boolean; status: string; paidUntil: Date | null }, now = Date.now(), graceDays = GRACE_DAYS): string {
  if (t.isPlatform || !t.paidUntil || !['ATIVA', 'ATRASADA'].includes(t.status)) return t.status
  if (now <= t.paidUntil.getTime()) return 'ATIVA'
  return now > t.paidUntil.getTime() + graceDays * DAY ? 'SUSPENSA' : 'ATRASADA'
}

/** Slug do endereço da empresa: letras minúsculas, números e hífen (3 a 30), sem nomes reservados. */
export const RESERVED_SLUGS = new Set(['admin', 'www', 'api', 'app', 'painel', 'cadastro', 'login', 'mail', 'smtp', 'ftp', 'lp', 'suporte', 'status', 'blog', 'cdn', 'static', 'plataforma', 'sgmulticonecta'])
export function cleanSlug(input: string): string | null {
  const s = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '')
  return s.length >= 3 && !RESERVED_SLUGS.has(s) ? s : null
}

/** Endereço acessado → empresa: subdomínio da plataforma, painel da plataforma ou domínio próprio. */
export function hostKind(host: string, platformDomain: string | null, adminHost: string | null): { kind: 'admin' } | { kind: 'slug'; slug: string } | { kind: 'custom'; host: string } | { kind: 'none' } {
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return { kind: 'none' }
  if (adminHost && h === adminHost) return { kind: 'admin' }
  if (platformDomain && h.endsWith(`.${platformDomain}`)) {
    const sub = h.slice(0, -platformDomain.length - 1)
    if (/^[a-z0-9-]{3,30}$/.test(sub)) return { kind: 'slug', slug: sub }
    return { kind: 'none' }
  }
  if (platformDomain && h === platformDomain) return { kind: 'none' }
  return { kind: 'custom', host: h }
}

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos. */
export function validDocument(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (/^(\d)\1+$/.test(d)) return false
  const digit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((s, c, i) => s + Number(c) * weights[i]!, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  if (d.length === 11) {
    const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
    const w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
    // CPF: dígito = 11 - resto (resto < 2 → 0), com os pesos 10..2 e 11..2.
    return digit(d.slice(0, 9), w1) === Number(d[9]) && digit(d.slice(0, 10), w2) === Number(d[10])
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return digit(d.slice(0, 12), w1) === Number(d[12]) && digit(d.slice(0, 13), w2) === Number(d[13])
  }
  return false
}
