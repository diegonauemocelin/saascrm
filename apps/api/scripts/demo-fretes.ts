/**
 * Empresa de DEMONSTRAÇÃO só do sistema de Fretes: Pulso Sports – Indústria de Roupas Esportivas (Brusque/SC), que
 * envia leggings, tops, camisetas dry-fit, agasalhos e uniformes de times para lojistas e academias de todo o Brasil.
 * Dados fictícios: fábrica e centro de distribuição, transportadoras com tabelas publicadas (origem SC para todas as
 * regiões), cotações, pedidos dos últimos 60 dias em todas as situações, NF-e (CIF e FOB, com o representante), CT-e
 * conciliados e divergentes, faturas, coletas (horários do painel de TV e agendadas), campanha de frete e poupança de
 * frete dos representantes.
 *
 * Fica marcada como demonstração (isDemo): não entra na receita, não é cobrada e não conecta nada.
 *
 *   Desenvolvimento:  cd apps/api && DEMO=sim npx tsx scripts/demo-fretes.ts
 *   Na VPS:           sudo bash deploy/demo.sh
 *
 * A senha dos usuários é gerada na hora e mostrada no fim (ou a de DEMO_PASSWORD). Se a empresa já existe, nada muda.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from '../src/auth/password'
import { type FreightCarrier, type Prisma, PrismaClient, type Unit, type User } from '../src/generated/prisma/client'
import { createDefaultRoles } from '../src/plataforma/perfis-padrao'
import { bestCampaign, CAMPAIGNS_KEY, type FreightCampaign } from '../src/fretes/campanhas'
import { type CalcSettings, DEFAULT_COMPONENTS, DEFAULT_SETTINGS } from '../src/fretes/catalogo'
import { reconcile } from '../src/fretes/conciliacao'
import { addBusinessDays, calculate, matchRule, measure, type RuleLike, type Volume, weights } from '../src/fretes/motor'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const PASSWORD = process.env.DEMO_PASSWORD || `Demo-${randomBytes(9).toString('base64url')}`
const SLUG = 'pulso'
const NAME = 'Pulso Sports – Indústria de Roupas Esportivas'
const SHORT = 'Pulso Sports'
const DAY = 86_400_000
const now = Date.now()
let seed = 4021
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a))
const ago = (days: number) => new Date(now - days * DAY - rnd() * 8 * 3_600_000)
const r2 = (v: number) => Math.round(v * 100) / 100
const json = (v: unknown) => v as Prisma.InputJsonValue
/** Data (AAAA-MM-DD) em Brasília, com dias a somar. */
const spDay = (plus = 0) => new Date(now + plus * DAY).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const utcDay = (s: string) => new Date(`${s}T00:00:00Z`)
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '.')

// ---------- Documentos fictícios com dígitos verificadores válidos ----------

function cnpj(base12: string) {
  const dv = (s: string) => {
    const w = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = [...s].reduce((sum, d, i) => sum + Number(d) * w[i]!, 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const a = `${base12}${dv(base12)}`
  return `${a}${dv(a)}`
}
/** Chave de 44 dígitos (NF-e modelo 55, CT-e modelo 57) com o dígito verificador no módulo 11. */
function accessKey(uf: string, at: Date, emit: string, model: '55' | '57', number: number) {
  const cuf = { SC: '42', RS: '43' }[uf] ?? '42'
  const aamm = `${String(at.getUTCFullYear()).slice(2)}${String(at.getUTCMonth() + 1).padStart(2, '0')}`
  const k43 = `${cuf}${aamm}${emit}${model}001${String(number).padStart(9, '0')}1${String(between(10_000_000, 99_999_999))}`
  let sum = 0
  let w = 2
  for (let i = k43.length - 1; i >= 0; i--) {
    sum += Number(k43[i]) * w
    w = w === 9 ? 2 : w + 1
  }
  const r = sum % 11
  return `${k43}${r < 2 ? 0 : 11 - r}`
}

// ---------- Empresa ----------

const COLORS = { primary: '#dc2626', sidebar: '#18181b' }
type Team = [name: string, role: 'admin' | 'Expedição' | 'Faturamento' | 'Representante']
const TEAM: Team[] = [
  ['Márcia Hoffmann', 'admin'], // gerente de logística
  ['Everton Kunz', 'Expedição'],
  ['Luana Krieger', 'Faturamento'],
  ['Rafael Moser', 'Representante'], // Sudeste e Centro-Oeste
  ['Patrícia Lenzi', 'Representante'], // Sul
]
const UNITS = [
  { name: 'Fábrica Brusque', city: 'Brusque', zip: '88350000', address: 'Rua dos Tecelões, 1500 - Centro', cnpj: cnpj('612847390001'), hq: true },
  { name: 'Centro de distribuição Itajaí', city: 'Itajaí', zip: '88316000', address: 'Rodovia das Malhas, 800 - Itaipava', cnpj: cnpj('612847390002'), hq: false },
]

/** Destinos (lojistas e academias): cidade, UF, CEP e região. */
const DESTS: [city: string, uf: string, zip: string][] = [
  ['Florianópolis', 'SC', '88010000'], ['Joinville', 'SC', '89201000'], ['Chapecó', 'SC', '89802000'], ['Curitiba', 'PR', '80010000'], ['Londrina', 'PR', '86010000'], ['Porto Alegre', 'RS', '90010000'], ['Caxias do Sul', 'RS', '95020000'],
  ['São Paulo', 'SP', '01310000'], ['Campinas', 'SP', '13010000'], ['Ribeirão Preto', 'SP', '14010000'], ['Rio de Janeiro', 'RJ', '20010000'], ['Niterói', 'RJ', '24020000'], ['Belo Horizonte', 'MG', '30110000'], ['Uberlândia', 'MG', '38400000'], ['Vitória', 'ES', '29010000'],
  ['Goiânia', 'GO', '74010000'], ['Brasília', 'DF', '70040000'], ['Cuiabá', 'MT', '78005000'], ['Campo Grande', 'MS', '79002000'],
  ['Salvador', 'BA', '40010000'], ['Recife', 'PE', '50010000'], ['Fortaleza', 'CE', '60010000'], ['Natal', 'RN', '59010000'],
  ['Belém', 'PA', '66010000'], ['Manaus', 'AM', '69005000'], ['Palmas', 'TO', '77001000'],
]
const REGION: Record<string, 'SC' | 'SUL' | 'SE' | 'CO' | 'NE' | 'N'> = { SC: 'SC', PR: 'SUL', RS: 'SUL', SP: 'SE', RJ: 'SE', MG: 'SE', ES: 'SE', GO: 'CO', DF: 'CO', MT: 'CO', MS: 'CO', BA: 'NE', PE: 'NE', CE: 'NE', RN: 'NE', PA: 'N', AM: 'N', TO: 'N' }
/** Preço da primeira faixa (até 5 kg) e prazo base, por região de destino. */
const REGION_PRICE = { SC: 28, SUL: 36, SE: 45, CO: 58, NE: 72, N: 88 }
const REGION_DAYS = { SC: 1, SUL: 2, SE: 3, CO: 5, NE: 7, N: 9 }

const STORES = ['Academia Corpo em Movimento', 'Fit Zone Artigos Esportivos', 'Studio Pilates Equilíbrio', 'Arena Cross Training', 'Esporte Total Comércio', 'Movimente-se Moda Fitness', 'Academia Força Máxima', 'Run & Fit Store', 'Clube Atlético Horizonte', 'Box Funcional Raiz', 'Ativa Moda Esportiva', 'Academia Viva Bem', 'Liga Amadora Vale do Sol', 'Yoga Lótus Studio', 'Planeta Esporte Distribuidora', 'Escolinha de Futebol Craque']
const PRODUCTS = ['leggings', 'tops', 'camisetas dry-fit', 'agasalhos', 'uniformes de time', 'shorts de corrida', 'bermudas de ciclismo']

/** Transportadoras fictícias: CNPJ (base), cidade, UF, regiões atendidas, fator de preço, ajuste de prazo e taxas. */
const CARRIERS = [
  { name: 'TransSul Cargas', legal: 'TransSul Cargas e Encomendas Ltda', base: '519874320001', city: 'Itajaí', uf: 'SC', zip: '88311000', regions: ['SC', 'SUL', 'SE'], factor: 1, days: 0, adv: 0.3, gris: 0.15, toll: 4.9, schedule: false },
  { name: 'Rápido Oeste', legal: 'Rápido Oeste Transportes Rodoviários Ltda', base: '627301450001', city: 'Chapecó', uf: 'SC', zip: '89809000', regions: ['SC', 'SUL', 'CO'], factor: 0.95, days: 1, adv: 0.25, gris: 0.2, toll: 5.5, schedule: false },
  { name: 'Expresso Serra', legal: 'Expresso Serra Gaúcha Logística Ltda', base: '734512980001', city: 'Caxias do Sul', uf: 'RS', zip: '95032000', regions: ['SC', 'SUL'], factor: 0.88, days: 0, adv: 0.35, gris: 0.12, toll: 6.2, schedule: false },
  { name: 'Rodo Litoral', legal: 'Rodo Litoral Transportes Ltda', base: '815236740001', city: 'Navegantes', uf: 'SC', zip: '88370000', regions: ['SC', 'SUL', 'SE', 'NE'], factor: 1.05, days: 0, adv: 0.28, gris: 0.18, toll: 5.1, schedule: false },
  { name: 'Fluxo Express', legal: 'Fluxo Express Entregas Rápidas Ltda', base: '908172630001', city: 'Joinville', uf: 'SC', zip: '89219000', regions: ['SC', 'SUL', 'SE', 'CO', 'NE', 'N'], factor: 1.35, days: -1, adv: 0.4, gris: 0.22, toll: 4.5, schedule: false },
  { name: 'Norte Brasil Cargas', legal: 'Norte Brasil Cargas e Logística Ltda', base: '357924680001', city: 'Itajaí', uf: 'SC', zip: '88303000', regions: ['CO', 'NE', 'N'], factor: 0.92, days: 1, adv: 0.3, gris: 0.25, toll: 6.8, schedule: false },
  { name: 'Brusque Entregas Rápidas', legal: 'Brusque Entregas Rápidas Ltda', base: '468135790001', city: 'Brusque', uf: 'SC', zip: '88352000', regions: ['SC'], factor: 0.9, days: 0, adv: 0.2, gris: 0.1, toll: 0, schedule: true },
] as const

/** Faixas de peso (kg) e o fator sobre a primeira faixa. Acima de 100 kg: excedente por kg. */
const BANDS: [min: number, max: number, factor: number][] = [
  [0, 5, 1],
  [5, 10, 1.25],
  [10, 20, 1.6],
  [20, 30, 2],
  [30, 50, 2.7],
  [50, 100, 4.2],
]

/** Situação dos pedidos, do mais antigo para o mais recente (60 pedidos nos últimos 60 dias). */
function statusFor(i: number): string {
  const old = ['CONCILIADO', 'CONCILIADO', 'CONCILIADO', 'AGUARDANDO_CONCILIACAO', 'CONCILIADO', 'ENTREGUE', 'CONCILIADO', 'AGUARDANDO_CTE', 'CONCILIADO', 'COM_OCORRENCIA']
  const mid = ['ENTREGUE', 'EM_TRANSITO', 'AGUARDANDO_CTE', 'EM_TRANSITO', 'CONCILIADO', 'DESPACHADO', 'ENTREGUE', 'AGUARDANDO_CONCILIACAO']
  const recent = ['AGUARDANDO_COLETA', 'APROVADO', 'AGUARDANDO_APROVACAO', 'COTADO', 'AGUARDANDO_COLETA', 'DESPACHADO', 'EM_TRANSITO']
  if (i === 17 || i === 46) return 'CANCELADO'
  if (i === 58 || i === 59) return 'AGUARDANDO_COTACAO'
  return i < 32 ? old[i % old.length]! : i < 46 ? mid[(i - 32) % mid.length]! : recent[(i - 46) % recent.length]!
}
/** Caminho de situações até a atual (histórico do pedido). */
function pathTo(status: string): string[] {
  const base = ['COTADO', 'APROVADO', 'AGUARDANDO_COLETA', 'DESPACHADO', 'EM_TRANSITO', 'ENTREGUE']
  if (status === 'AGUARDANDO_COTACAO') return ['AGUARDANDO_COTACAO']
  if (status === 'AGUARDANDO_APROVACAO') return ['COTADO', 'AGUARDANDO_APROVACAO']
  if (status === 'CANCELADO') return ['COTADO', 'CANCELADO']
  if (status === 'COM_OCORRENCIA') return [...base.slice(0, 5), 'COM_OCORRENCIA']
  if (status === 'AGUARDANDO_CTE') return [...base, 'AGUARDANDO_CTE']
  if (status === 'AGUARDANDO_CONCILIACAO') return [...base, 'AGUARDANDO_CONCILIACAO']
  if (status === 'CONCILIADO') return [...base, 'AGUARDANDO_CONCILIACAO', 'CONCILIADO']
  return base.slice(0, base.indexOf(status) + 1)
}

async function main() {
  if (process.env.DEMO !== 'sim') throw new Error('Confirme com DEMO=sim (cria uma empresa fictícia neste banco).')
  if (await prisma.tenant.findUnique({ where: { slug: SLUG } })) {
    console.log(`${SLUG}: já existe, nada alterado.`)
    return
  }
  const counts: Record<string, number> = {}
  const add = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

  // ---------- Empresa (só o sistema de Fretes, além dos módulos da base), marca e perfis ----------
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: NAME, isDemo: true, notes: 'Empresa fictícia para apresentar o sistema de Fretes (indústria de roupas esportivas em Brusque/SC).', status: 'ATIVA', planId: null, paidUntil: new Date(now + 365 * DAY), extraSystems: ['fretes'], extraUsers: 10 },
  })
  const t = tenant.id
  const setting = (key: string, value: unknown) => prisma.tenantSetting.create({ data: { tenantId: t, key, value: json(value) } })
  await setting('branding', { appName: SHORT, shortName: SHORT, primaryColor: COLORS.primary, brandColor: COLORS.primary, sidebarColor: COLORS.sidebar, defaultLayout: 'SISTEMAS', defaultScreens: 'NOVO' })
  const adminRoleId = await createDefaultRoles(prisma, t)
  const ALL = { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true }
  const WORK = { canView: true, canCreate: true, canEdit: true, canExport: true }
  const VIEW = { canView: true, canExport: true }
  const role = (name: string, description: string, perms: [string, object][]) => prisma.role.create({ data: { tenantId: t, name, description, permissions: { create: perms.map(([module, p]) => ({ module, ...p })) } } })
  const roles = {
    Expedição: await role('Expedição', 'Cotação, pedidos, coletas e CT-e.', [['dashboard', VIEW], ['fretes_painel', VIEW], ['fretes_coletas', ALL], ['fretes_cotacao', WORK], ['fretes_pedidos', WORK], ['fretes_cte', WORK], ['fretes_transportadoras', VIEW], ['fretes_tabelas', VIEW]]),
    Faturamento: await role('Faturamento', 'NF-e, CT-e, faturas e conferência de frete.', [['dashboard', VIEW], ['fretes_painel', VIEW], ['fretes_pedidos', WORK], ['fretes_cte', ALL], ['fretes_financeiro', ALL], ['fretes_transportadoras', VIEW]]),
    Representante: await role('Representante', 'Cota o frete para os clientes e acompanha os próprios pedidos e a poupança de frete.', [['dashboard', VIEW], ['fretes_cotacao', WORK], ['fretes_pedidos', VIEW]]),
  }
  await prisma.role.updateMany({ where: { tenantId: t }, data: { require2fa: false } })
  add('perfis próprios (Expedição, Faturamento, Representante)', 3)

  const units: Unit[] = []
  for (const u of UNITS) units.push(await prisma.unit.create({ data: { tenantId: t, name: u.name, city: u.city, state: 'SC', isHeadquarters: u.hq, cnpj: u.cnpj, legalName: 'Pulso Sports Indústria e Comércio de Roupas Esportivas Ltda', zip: u.zip, address: u.address } }))
  add('filiais (fábrica e centro de distribuição)', units.length)
  const [factory, cd] = units as [Unit, Unit]

  const hash = await hashPassword(PASSWORD)
  const users: User[] = []
  for (const [name, r] of TEAM) users.push(await prisma.user.create({ data: { tenantId: t, roleId: r === 'admin' ? adminRoleId : roles[r].id, unitId: name === 'Everton Kunz' ? cd.id : factory.id, name, email: `${slugify(name.split(' ')[0]!)}@${SLUG}.demo`, passwordHash: hash, trailDone: ['*'] } }))
  add('usuários', users.length)
  const [admin, exp, fat] = users as [User, User, User]
  const reps = users.filter((_, i) => TEAM[i]![1] === 'Representante')
  for (const u of reps) await prisma.seller.create({ data: { tenantId: t, name: u.name, email: u.email, userId: u.id, unitId: u.unitId, gender: u.name.startsWith('Patrícia') ? 'F' : 'M' } })
  add('representantes (vendedores)', reps.length)
  /** Representante do cliente: Sul com a Patrícia, o resto do Brasil com o Rafael. */
  const repFor = (uf: string) => (['SC', 'PR', 'RS'].includes(uf) ? reps[1]! : reps[0]!)

  // ---------- Transportadoras, tabelas publicadas e regras ----------
  const settings: CalcSettings = { ...DEFAULT_SETTINGS, icmsRateIntra: 12 }
  const carriers: (FreightCarrier & { def: (typeof CARRIERS)[number] })[] = []
  const tables: { table: { id: string; name: string; quoteName: string | null; validTo: Date; dispatchDays: number | null }; carrier: FreightCarrier; version: { id: string; number: number }; rules: RuleLike[] }[] = []
  const validFrom = utcDay(spDay(-150))
  const validTo = utcDay(spDay(215))
  for (const [ci, c] of CARRIERS.entries()) {
    const mail = `comercial@${slugify(c.name).replace(/\./g, '')}.demo`
    // Horários de coleta (painel de TV): na fábrica e no CD, em dias e horários diferentes.
    const pickups = c.schedule
      ? []
      : [
          { unitId: cd.id, days: [1, 2, 3, 4, 5], cutoff: ['14:00', '15:00', '15:30', '16:00'][ci % 4]!, pickup: ['15:30', '16:30', '17:00', '17:30'][ci % 4]!, minutes: 30, note: null },
          ...(ci % 2 === 0 ? [{ unitId: factory.id, days: [1, 3, 5], cutoff: '10:30', pickup: '11:30', minutes: 30, note: 'Coleta de uniformes direto da fábrica.' }] : []),
        ]
    const carrier = await prisma.freightCarrier.create({
      data: {
        tenantId: t, cnpj: cnpj(c.base), legalName: c.legal, name: c.name, zip: c.zip, city: c.city, state: c.uf, phone: `55${c.uf === 'RS' ? '54' : '47'}3${String(3300000 + ci * 1111)}`, email: mail,
        contacts: json([{ name: `${pick(['Jéssica', 'Anderson', 'Cláudia', 'Rogério', 'Fabiana', 'Marcos'])} ${pick(['Schmitt', 'Kraus', 'Silveira', 'Bauer', 'Costa'])}`, role: 'Comercial', phone: null, email: mail }]), modes: ['RODOVIARIO'],
        pickups: json(pickups), pickupBySchedule: c.schedule, notes: c.schedule ? 'Só vem coletar quando a expedição agenda.' : null,
      },
    })
    carriers.push({ ...carrier, def: c })
    const table = await prisma.freightTable.create({ data: { tenantId: t, carrierId: carrier.id, name: `${c.name} ${new Date(now).getUTCFullYear()}`, status: 'ATIVA', validFrom, validTo, goodsTypes: [], notes: 'Tabela negociada (fictícia): roupas esportivas em caixas.' } })
    // A TransSul tem a versão 1 substituída pela 2 (reajuste): mostra o histórico de versões.
    const versions = ci === 0 ? [1, 2] : [1]
    for (const n of versions) {
      const factor = c.factor * (n === 1 && versions.length > 1 ? 0.93 : 1)
      const rules: (RuleLike & { id: string })[] = []
      for (const uf of Object.keys(REGION)) {
        const region = REGION[uf]!
        if (!(c.regions as readonly string[]).includes(region)) continue
        const base = REGION_PRICE[region] * factor
        for (const [bi, [min, max, f]] of BANDS.entries()) {
          const values: Record<string, number> = { freight: r2(base * f), advalorem: c.adv, gris: c.gris, gris_min: 2.5, toll: c.toll, fraction: 100 }
          if (bi === BANDS.length - 1) values.over_weight = r2((base * f) / 140)
          if (uf !== 'SC') values.tas = 2.9
          if (region === 'N') values.tda = 25
          rules.push({ id: randomUUID(), cepStart: null, cepEnd: null, uf, city: null, weightMin: min, weightMax: max, deadlineDays: Math.max(1, REGION_DAYS[region] + c.days), restricted: false, values })
        }
      }
      const status = n === versions.length ? 'PUBLICADA' : 'SUBSTITUIDA'
      const pubAt = n === 1 ? ago(150) : ago(40)
      const v = await prisma.freightTableVersion.create({ data: { tenantId: t, tableId: table.id, number: n, status, components: json(DEFAULT_COMPONENTS), settings: json(settings), source: 'MANUAL', note: n === 2 ? 'Reajuste de 7% negociado.' : 'Tabela inicial.', rulesCount: rules.length, createdById: admin.id, createdByName: admin.name, publishedAt: pubAt, publishedById: admin.id, publishedByName: admin.name, createdAt: pubAt } })
      await prisma.freightRule.createMany({ data: rules.map((r) => ({ id: r.id, versionId: v.id, uf: r.uf, weightMin: r.weightMin, weightMax: r.weightMax, deadlineDays: r.deadlineDays, values: json(r.values) })) })
      add('regras de frete', rules.length)
      add('versões de tabela')
      if (status === 'PUBLICADA') {
        await prisma.freightTable.update({ where: { id: table.id }, data: { publishedVersionId: v.id } })
        tables.push({ table, carrier: carriers[ci]!, version: v, rules })
      }
    }
  }
  add('transportadoras', carriers.length)
  add('tabelas de frete publicadas', tables.length)

  // ---------- Campanha de frete e poupança de frete dos representantes ----------
  const freightCampaigns: FreightCampaign[] = [
    { id: randomUUID(), name: 'Frete grátis acima de R$ 1.500 – Sul', active: true, mode: 'GRATIS', value: 0, carrierIds: [], ufs: ['SC', 'PR', 'RS'], cities: [], minCargoValue: 1500, tableAbove: null, startsOn: spDay(-20), endsOn: spDay(40) },
    { id: randomUUID(), name: 'Nordeste: 15% de desconto no frete', active: true, mode: 'DESCONTO', value: 15, carrierIds: [], ufs: ['BA', 'PE', 'CE', 'RN'], cities: [], minCargoValue: 2500, tableAbove: null, startsOn: spDay(-45), endsOn: spDay(45) },
  ]
  await setting(CAMPAIGNS_KEY, freightCampaigns)
  add('campanhas de frete', freightCampaigns.length)
  const walletStart = spDay(-60)
  const [wy, wm, wd] = walletStart.split('-').map(Number) as [number, number, number]
  const walletEnd = new Date(Date.UTC(wy, wm - 1 + 3, wd) - DAY).toISOString().slice(0, 10)
  const wallet = { id: randomUUID(), name: 'Poupança de frete dos representantes – trimestre', active: true, pct: 12, sellerPcts: [{ seller: reps[0]!.name, pct: 15 }], period: 'TRIMESTRAL', start: walletStart, end: walletEnd }
  await setting('fretes_poupanca_campanhas', [wallet])
  add('campanhas da poupança de frete', 1)

  type Dest = (typeof DESTS)[number]
  function quoteOne(entry: (typeof tables)[number], unit: Unit, dest: Dest, cargoValue: number, volumes: Volume[], date: Date) {
    const { table, carrier, version, rules } = entry
    const m = measure(volumes, null)
    const base = {
      tableId: table.id, tableName: table.name, quoteName: table.quoteName || carrier.quoteName || carrier.name, carrierId: carrier.id, carrierName: carrier.name,
      pickups: ((carrier.pickups as unknown as { unitId: string | null; days: number[]; cutoff: string; pickup: string; note: string | null }[]) ?? []).filter((p) => (!p.unitId || p.unitId === unit.id) && p.days.includes(date.getUTCDay())).map((p) => ({ cutoff: p.cutoff, pickup: p.pickup, note: p.note })),
      pickupMode: 'COLETA' as const, versionId: version.id, versionNumber: version.number, status: 'OK' as string, reason: null as string | null,
      total: null as number | null, subtotal: null as number | null, icms: null as unknown, components: [] as unknown[], weights: null as unknown, deadlineDays: null as number | null, deliveryDate: null as string | null,
      validUntil: table.validTo.toISOString().slice(0, 10), rule: null as { id: string | null; by: string; label: string } | null, warnings: [] as string[], expiredUsed: false, campaign: null as ReturnType<typeof bestCampaign>,
    }
    const match = matchRule(rules, { zip: Number(dest[2]), uf: dest[1], city: dest[0] }, weights(m, settings).taxed)
    if (!match.rule) return { ...base, status: 'SEM_COBERTURA', reason: `${match.reason} Destino: ${dest[0]}/${dest[1]}, CEP ${dest[2].slice(0, 5)}-${dest[2].slice(5)}.` }
    const r = match.rule
    base.rule = { id: r.id ?? null, by: match.by, label: `UF ${r.uf}, ${r.weightMin} a ${r.weightMax ?? '∞'} kg` }
    const res = calculate(DEFAULT_COMPONENTS, settings, match, { cargoValue, personType: 'PJ', measures: m, sameState: dest[1] === 'SC', originUf: 'SC', destUf: dest[1] })
    if (!res.ok) return { ...base, status: 'ERRO', reason: res.error, weights: res.weights, components: res.components, warnings: res.warnings }
    const deadline = r.deadlineDays! + (table.dispatchDays ?? 0)
    const campaign = bestCampaign(freightCampaigns, { carrierId: carrier.id, destUf: dest[1], destCity: dest[0], cargoValue, date: date.toISOString().slice(0, 10) }, res.total)
    return { ...base, total: res.total, subtotal: res.subtotal, icms: res.icms, components: res.components, weights: res.weights, warnings: res.warnings, deadlineDays: deadline, deliveryDate: addBusinessDays(date, deadline).toISOString().slice(0, 10), campaign }
  }

  // ---------- Clientes (lojistas e academias), cotações e pedidos ----------
  const customers = DESTS.map((d, i) => ({ name: `${STORES[i % STORES.length]} – ${d[0]}`, doc: cnpj(`${30_100_200 + i * 7}0001`), dest: d }))
  async function makeQuote(i: number, createdAt: Date, select: boolean, cancelled = false) {
    const c = i % 3 === 0 ? pick(customers.slice(0, 7)) : pick(customers)
    const unit = c.dest[1] === 'SC' || i % 4 === 0 ? factory : cd
    const boxes = between(1, 9)
    const products = [pick(PRODUCTS), pick(PRODUCTS)].filter((p, k, a) => a.indexOf(p) === k)
    const volumes: Volume[] = [{ quantity: boxes, weight: between(8, 14), length: 60, width: 40, height: 40 }]
    const cargoValue = r2(boxes * between(900, 2200))
    const quoteDate = utcDay(createdAt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    const results = tables.map((e) => quoteOne(e, unit, c.dest, cargoValue, volumes, quoteDate))
    results.sort((a, b) => (a.status === 'OK' ? 0 : 1) - (b.status === 'OK' ? 0 : 1) || (a.total ?? 0) - (b.total ?? 0))
    const ok = results.filter((r) => r.status === 'OK')
    const m = measure(volumes, null)
    const rep = repFor(c.dest[1])
    const who = i % 3 === 0 ? exp : rep
    const chosen = select ? (i % 5 === 0 && ok[1] ? ok[1] : ok[0]) : undefined
    const reference = `${boxes} caixa(s): ${products.join(' e ')}`
    const input = { unitId: unit.id, originZip: unit.zip, destZip: c.dest[2], destCity: c.dest[0], destUf: c.dest[1], personType: 'PJ', customerName: c.name, customerDoc: c.doc, cargoValue, volumes, goodsType: null, quoteDate: quoteDate.toISOString().slice(0, 10), reference, notes: null }
    const q = await prisma.freightQuote.create({
      data: {
        tenantId: t, unitId: unit.id, reference, customerName: c.name, customerDoc: c.doc, personType: 'PJ', originZip: unit.zip!, destZip: c.dest[2], destCity: c.dest[0], destUf: c.dest[1], cargoValue, realWeight: m.realWeight, cubicMeters: m.cubicMeters, volumes: json(volumes), quoteDate,
        input: json(input), results: json(results), bestTotal: ok[0]?.total ?? null, status: cancelled ? 'CANCELADA' : chosen ? 'SELECIONADA' : 'CALCULADA',
        selectedTableId: chosen?.tableId ?? null, selectedVersionId: chosen?.versionId ?? null, selectedCarrierId: chosen?.carrierId ?? null, selectedTotal: chosen?.total ?? null, selectedAt: chosen ? new Date(createdAt.getTime() + 900_000) : null, selectedByName: chosen ? who.name : null,
        selectionNote: chosen && chosen !== ok[0] ? 'Cliente pediu a transportadora com o menor prazo.' : null, createdById: who.id, createdByName: who.name, createdAt,
      },
    })
    add('cotações de frete')
    return { q, chosen, unit, c, volumes, cargoValue, m, rep, who, createdAt }
  }
  // Cotações sem pedido (ainda decidindo ou canceladas).
  for (let i = 0; i < 10; i++) await makeQuote(100 + i, ago(between(0, 25)), false, i >= 8)

  let nfeNumber = 52_300
  let cteSeq = 0
  const ctes: { id: string; carrierId: string; total: number; issuedAt: Date }[] = []
  for (let i = 0; i < 60; i++) {
    const status = statusFor(i)
    const createdAt = ago(60 - i + rnd() * 0.5)
    const path = pathTo(status)
    if (status === 'AGUARDANDO_COTACAO') {
      const c = pick(customers)
      await prisma.freightShipment.create({ data: { tenantId: t, unitId: cd.id, orderNumber: `PV-${8800 + i}`, customerName: c.name, customerDoc: c.doc, personType: 'PJ', destZip: c.dest[2], destCity: c.dest[0], destUf: c.dest[1], cargoValue: between(2000, 9000), weight: between(20, 80), volumesCount: between(2, 7), status, createdById: exp.id, createdByName: exp.name, createdAt } })
      add('pedidos de frete')
      continue
    }
    const x = await makeQuote(i, createdAt, true)
    const chosen = x.chosen!
    const carrier = carriers.find((c) => c.id === chosen.carrierId)!
    const reached = (s: string) => path.includes(s)
    const step = (k: number) => new Date(Math.min(now - (8 - k) * 600_000, createdAt.getTime() + 1_800_000 + k * 0.6 * DAY))
    const shipped = reached('DESPACHADO') ? step(3) : null
    const delivered = reached('ENTREGUE') ? new Date(Math.min(now - 3_600_000, shipped!.getTime() + Math.max(1, chosen.deadlineDays ?? 2) * DAY)) : null
    const issued = reached('AGUARDANDO_COLETA') ? step(2) : null
    const fob = !!issued && i % 4 === 1 && !['CONCILIADO', 'AGUARDANDO_CONCILIACAO'].includes(status)
    const nfeKey = issued ? accessKey('SC', issued, x.unit.cnpj!, '55', ++nfeNumber) : null
    const sh = await prisma.freightShipment.create({
      data: {
        tenantId: t, unitId: x.unit.id, orderNumber: `PV-${8800 + i}`, invoiceNumber: nfeKey ? String(nfeNumber) : null, invoiceKey: nfeKey, customerName: x.c.name, customerDoc: x.c.doc, personType: 'PJ',
        destZip: x.c.dest[2], destCity: x.c.dest[0], destUf: x.c.dest[1], cargoValue: x.cargoValue, weight: x.m.realWeight, volumesCount: x.m.quantity, carrierId: carrier.id, quoteId: x.q.id,
        expected: json({ ...chosen, quoteCode: x.q.code }), expectedTotal: chosen.total, status, collectedAt: shipped, shippedAt: shipped,
        expectedDeliveryAt: chosen.deliveryDate ? utcDay(chosen.deliveryDate) : null, deliveredAt: delivered, trackingCode: shipped ? `${carrier.name.slice(0, 2).toUpperCase()}${between(1_000_000, 9_999_999)}` : null,
        trackingAt: shipped ? ago(0) : null, trackingLast: status === 'COM_OCORRENCIA' ? 'Destinatário ausente: nova tentativa de entrega no próximo dia útil.' : delivered ? 'Mercadoria entregue' : shipped ? 'Em trânsito para a unidade de destino' : null,
        notes: status === 'COM_OCORRENCIA' ? 'Loja fechada no horário da entrega.' : status === 'CANCELADO' ? 'Cliente cancelou o pedido antes da coleta.' : fob ? 'Frete FOB: transportadora escolhida pelo cliente.' : null,
        createdById: x.who.id, createdByName: x.who.name, createdAt,
      },
    })
    for (const [k, s] of path.entries()) await prisma.freightShipmentEvent.create({ data: { shipmentId: sh.id, status: s, note: s === 'COM_OCORRENCIA' ? 'Destinatário ausente.' : s === 'CANCELADO' ? 'Pedido cancelado pelo cliente.' : null, userName: k < 2 ? x.who.name : s === 'CONCILIADO' ? 'Conciliação automática' : s === 'AGUARDANDO_CONCILIACAO' ? fat.name : exp.name, createdAt: step(k) } })
    add('pedidos de frete')
    add('histórico dos pedidos', path.length)
    if (!nfeKey || !issued) continue

    // NF-e com o representante nos dados adicionais. CIF: o frete cobrado do cliente (cotação + % da poupança, ou zero
    // na campanha de frete grátis, pedido do portal B2B sem representante). FOB: o cliente paga a transportadora.
    const pct = x.rep.name === wallet.sellerPcts[0]!.seller ? 15 : 12
    const free = chosen.campaign?.customerPrice === 0
    const charged = fob ? null : free ? 0 : r2((chosen.campaign?.customerPrice ?? chosen.total!) * (1 + pct / 100) + (rnd() - 0.3) * 40)
    await prisma.freightNfe.create({
      data: {
        tenantId: t, key: nfeKey, number: nfeNumber, series: '1', issuedAt: issued, emitCnpj: x.unit.cnpj, unitId: x.unit.id, value: x.cargoValue, freightValue: charged, seller: free ? null : x.rep.name, freightMode: fob ? '1' : '0',
        carrierCnpj: carrier.cnpj, carrierId: carrier.id, volumes: x.m.quantity, grossWeight: x.m.realWeight, netWeight: r2(x.m.realWeight * 0.95), destCnpj: x.c.doc, destZip: x.c.dest[2], destCity: x.c.dest[0], destUf: x.c.dest[1], shipmentId: sh.id, status: 'PEDIDO', createdAt: issued,
      },
    })
    add(fob ? 'NF-e FOB' : 'NF-e CIF')
    if (fob || !['CONCILIADO', 'AGUARDANDO_CONCILIACAO'].includes(status)) continue

    // CT-e: o conciliado bate com a cotação; o divergente vem com taxa não prevista ou peso/valor a mais.
    const divergent = status === 'AGUARDANDO_CONCILIACAO'
    const seq = ++cteSeq
    const comps = (chosen.components as { name: string; cteName: string | null; value: number; skipped: boolean }[]).filter((c) => !c.skipped && c.value > 0).map((c) => ({ name: c.cteName ?? c.name, value: c.value }))
    if (divergent && seq % 2 === 0) comps.push({ name: 'TDE', value: 38.5 })
    if (divergent && seq % 2 === 1) comps[0] = { name: comps[0]!.name, value: r2(comps[0]!.value * 1.2) }
    const icms = chosen.icms as { mode: 'SOMADO' | 'NAO_INCIDE' | 'INFORMATIVO'; rate: number | null; base: number; value: number }
    const sub = r2(comps.reduce((s, c) => s + c.value, 0))
    const icmsValue = icms.rate ? r2(sub / (1 - icms.rate / 100) - sub) : 0
    const total = r2(sub + icmsValue)
    const cteAt = new Date(Math.min(now - 7_200_000, shipped!.getTime() + 3_600_000))
    const weight = divergent && seq % 2 === 1 ? r2(x.m.realWeight * 1.15) : x.m.realWeight
    const charged2 = { total, components: [...comps, { name: 'ICMS', value: icmsValue }], icms: { rate: icms.rate, value: icmsValue }, weight }
    const rec = reconcile({ total: chosen.total!, components: chosen.components as { code: string; name: string; cteName?: string | null; value: number; skipped?: boolean }[], icms, weight: (chosen.weights as { taxed: number }).taxed }, charged2, { value: 1, percent: 1 })
    const recAt = new Date(cteAt.getTime() + 600_000)
    const cte = await prisma.freightCte.create({
      data: {
        tenantId: t, key: accessKey(carrier.state!, cteAt, carrier.cnpj, '57', 71_000 + seq), number: String(71_000 + seq), series: '1', issuedAt: cteAt, emitCnpj: carrier.cnpj, emitName: carrier.legalName, carrierId: carrier.id, unitId: x.unit.id, tomadorDoc: x.unit.cnpj, senderDoc: x.unit.cnpj,
        recipientDoc: x.c.doc, recipientName: x.c.name, ufIni: 'SC', ufFim: x.c.dest[1], cityIni: x.unit.city, cityFim: x.c.dest[0], destZip: x.c.dest[2], cfop: x.c.dest[1] === 'SC' ? '5352' : '6352',
        total, cargoValue: x.cargoValue, weight, volumes: x.m.quantity, components: json(charged2.components), icms: json({ cst: '00', base: r2(sub + icmsValue), rate: icms.rate, value: icmsValue }), nfeKeys: [nfeKey],
        protocol: `14${between(100_000_000, 999_999_999)}`, protocolStatus: '100', shipmentId: sh.id, companyRoles: ['REMETENTE', 'TOMADOR'], source: seq % 3 === 0 ? 'MANUAL' : 'SEFAZ', importedByName: seq % 3 === 0 ? fat.name : 'Captura automática (SEFAZ)', createdAt: cteAt,
        recStatus: rec.status, recTypes: rec.types, recSource: 'COTACAO', expectedTotal: rec.expectedTotal, difference: rec.difference, recDetail: json({ ...rec, reference: `Cotação nº ${x.q.code} (${chosen.tableName} v${chosen.versionNumber})` }), recAt,
        ...(rec.status === 'CONCILIADO' ? { decision: 'APROVADO', approvedValue: total, decidedByName: 'Conciliação automática', decidedAt: recAt } : seq % 2 === 0 ? { decision: 'CONTESTADO', contestStatus: 'ABERTA', contestNote: 'TDE não combinada na tabela: pedido de crédito enviado à transportadora.', decidedByName: fat.name, decidedAt: ago(1) } : {}),
      },
    })
    ctes.push({ id: cte.id, carrierId: carrier.id, total, issuedAt: cteAt })
    add(`CT-e ${rec.status === 'CONCILIADO' ? 'conciliados' : 'divergentes'}`)
  }
  // Notas sem frete (cliente retirou na fábrica) e uma cancelada: aparecem na lista de NF-e.
  for (let i = 0; i < 3; i++) {
    const issued = ago(between(1, 30))
    const c = customers[i]!
    await prisma.freightNfe.create({ data: { tenantId: t, key: accessKey('SC', issued, factory.cnpj!, '55', ++nfeNumber), number: nfeNumber, series: '1', issuedAt: issued, emitCnpj: factory.cnpj, unitId: factory.id, value: between(1500, 6000), freightValue: 0, seller: repFor(c.dest[1]).name, freightMode: i === 2 ? '0' : '9', destCnpj: c.doc, destCity: c.dest[0], destUf: c.dest[1], destZip: c.dest[2], status: i === 2 ? 'CANCELADA' : 'SEM_FRETE', cancelledAt: i === 2 ? issued : null } })
    add('NF-e sem frete ou cancelada')
  }

  // ---------- Faturas: uma em aberto por transportadora (CT-es recentes) e uma paga (os mais antigos da primeira) ----------
  const byCarrier = new Map<string, typeof ctes>()
  for (const c of ctes) byCarrier.set(c.carrierId, [...(byCarrier.get(c.carrierId) ?? []), c])
  let invoices = 0
  for (const [ci, [carrierId, list]] of [...byCarrier].entries()) {
    list.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
    const groups: [typeof list, boolean][] = ci === 0 && list.length > 1 ? [[list.slice(0, Math.ceil(list.length / 2)), true], [list.slice(Math.ceil(list.length / 2)), false]] : [[list, false]]
    for (const [part, paid] of groups) {
      const total = r2(part.reduce((s, c) => s + c.total, 0))
      const inv = await prisma.freightInvoice.create({ data: { tenantId: t, carrierId, unitId: cd.id, number: `FAT-${3100 + invoices}`, issuedAt: utcDay(spDay(paid ? -25 : -4)), dueAt: utcDay(spDay(paid ? -10 : 11)), total, status: paid ? 'PAGA' : 'ABERTA', paidAt: paid ? utcDay(spDay(-10)) : null, paidValue: paid ? total : null, createdByName: fat.name } })
      await prisma.freightCte.updateMany({ where: { id: { in: part.map((c) => c.id) } }, data: { invoiceId: inv.id } })
      invoices++
      add(paid ? 'faturas pagas' : 'faturas em aberto')
    }
  }

  // ---------- Poupança: um uso do saldo; coletas agendadas da transportadora local ----------
  await prisma.freightWalletMove.create({ data: { tenantId: t, campaignId: wallet.id, seller: reps[1]!.name, kind: 'USO', value: -45, note: 'Desconto no frete do pedido PV-8840 (academia nova em Curitiba).', createdByName: admin.name, createdAt: ago(5) } })
  add('movimentos da poupança de frete')
  const local = carriers.find((c) => c.def.schedule)!
  for (const [d, period, status, note] of [[-1, 'TARDE', 'COLETADA', null], [0, 'MANHA', 'COLETANDO', '8 caixas de uniformes para Florianópolis.'], [0, 'TARDE', 'AGENDADA', null], [1, 'MANHA', 'AGENDADA', 'Pedido grande de leggings para Joinville.']] as const) {
    await prisma.freightPickupSchedule.create({ data: { tenantId: t, unitId: factory.id, carrierId: local.id, date: utcDay(spDay(d)), period, status, note, createdByName: exp.name, statusByName: status === 'AGENDADA' ? null : exp.name, statusAt: status === 'AGENDADA' ? null : ago(0) } })
  }
  add('coletas agendadas', 4)

  console.log(`${SLUG}: criada (${admin.email})`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  console.log(`Senha dos usuários: ${PASSWORD}`)
}

main().finally(() => prisma.$disconnect())
