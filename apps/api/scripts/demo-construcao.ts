/**
 * Empresa de DEMONSTRAÇÃO para apresentações ao vivo: Prime Construtora (Itapema/SC), construtora de edifícios
 * residenciais que vende apartamentos para moradia e para investidores de todo o Brasil. Mostra vendas e atendimento
 * (interessados e clientes), WhatsApp, leads e marketing (postagens, e-mail, automações, Web Push e anúncios).
 * Sem fretes (fica na demonstração da Pulso Sports, scripts/demo-fretes.ts) e sem loja virtual.
 *
 * Fica marcada como demonstração (isDemo): não entra na receita, não é cobrada, não publica no Instagram/Facebook e
 * não conecta WhatsApp.
 *
 *   Desenvolvimento:  cd apps/api && DEMO=sim npx tsx scripts/demo-construcao.ts
 *   Na VPS:           sudo bash deploy/demo.sh
 *
 * A senha dos usuários é gerada na hora e mostrada no fim (ou a de DEMO_PASSWORD). Se a empresa já existe, nada muda.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../src/auth/password'
import { type Lead, type Prisma, PrismaClient, type Unit, type User } from '../src/generated/prisma/client'
import { createDefaultRoles } from '../src/plataforma/perfis-padrao'
import { SYSTEM_KEYS } from '../src/plataforma/sistemas'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const PASSWORD = process.env.DEMO_PASSWORD || `Demo-${randomBytes(9).toString('base64url')}`
const SLUG = 'prime'
const NAME = 'Prime Construtora'
const SITE = 'https://www.prime.demo'
const DAY = 86_400_000
const now = Date.now()
let seed = 1931
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

// ---------- Equipe, unidades e empreendimentos ----------

const COLORS = { primary: '#0e7490', sidebar: '#0f172a' }
type Team = [name: string, role: 'admin' | 'Vendedor' | 'Pré-Vendas' | 'Pós-Vendas' | 'Marketing' | 'Suprimentos', unit: number, seller: boolean]
const TEAM: Team[] = [
  ['Ricardo Prado', 'admin', 0, true], // diretor comercial
  ['Juliana Sartori', 'Vendedor', 0, true], // corretora
  ['Marcelo Antunes', 'Vendedor', 0, true], // consultor de vendas
  ['Bianca Moretti', 'Vendedor', 1, true], // corretora (plantão de Porto Belo)
  ['Tatiane Moreira', 'Pré-Vendas', 0, false], // atendimento
  ['Paulo Henrique Dias', 'Pós-Vendas', 0, false], // relacionamento com clientes e assistência técnica
  ['Camila Rocha', 'Marketing', 0, false],
  ['Everton Kunz', 'Suprimentos', 0, false], // compras e suprimentos
]
const UNITS = [
  { name: 'Escritório e decorado Itapema', city: 'Itapema', hq: true },
  { name: 'Plantão de vendas Porto Belo', city: 'Porto Belo', hq: false },
]
const ORIGINS = ['Instagram', 'Google Ads', 'Meta Ads', 'Site', 'Plantão de vendas (decorado)', 'Indicação', 'Imobiliária parceira', 'WhatsApp']
const LOST = ['Preço', 'Financiamento não aprovado', 'Comprou com outra construtora', 'Desistiu', 'Sem retorno']
const CUSTOMER_TYPES = ['Investidor', 'Moradia', 'Permuta', 'Imobiliária parceira']
const TYPOLOGIES = ['2 suítes', '3 suítes', '4 suítes', 'Cobertura', 'Garden']

/** Empreendimentos fictícios: cidade, situação e % de obra. */
const PROJECTS = [
  { name: 'Prime Ocean Tower', tag: 'prime ocean tower', city: 'Itapema', place: 'Itapema (Meia Praia)', stage: 'em construção', pct: 62 },
  { name: 'Prime Garden Residence', tag: 'prime garden residence', city: 'Porto Belo', place: 'Porto Belo', stage: 'em construção', pct: 35 },
  { name: 'Prime Perequê Beach', tag: 'prime perequê beach', city: 'Porto Belo', place: 'Perequê (Porto Belo)', stage: 'na planta', pct: 0 },
  { name: 'Prime Ganchos Bay', tag: 'prime ganchos bay', city: 'Governador Celso Ramos', place: 'Governador Celso Ramos', stage: 'lançamento na planta', pct: 0 },
] as const
const label = (p: (typeof PROJECTS)[number]) => `${p.name} – ${p.place} – ${p.pct ? `${p.stage} ${p.pct}%` : p.stage}`

/** Compradores de todo o Brasil: cidade, UF e DDD. Os 6 primeiros são de SC. */
const CITIES: [city: string, uf: string, ddd: string][] = [
  ['Itapema', 'SC', '47'], ['Balneário Camboriú', 'SC', '47'], ['Blumenau', 'SC', '47'], ['Joinville', 'SC', '47'], ['Chapecó', 'SC', '49'], ['Florianópolis', 'SC', '48'],
  ['São Paulo', 'SP', '11'], ['Campinas', 'SP', '19'], ['Ribeirão Preto', 'SP', '16'], ['Curitiba', 'PR', '41'], ['Maringá', 'PR', '44'], ['Cascavel', 'PR', '45'],
  ['Porto Alegre', 'RS', '51'], ['Caxias do Sul', 'RS', '54'], ['Belo Horizonte', 'MG', '31'], ['Uberlândia', 'MG', '34'], ['Goiânia', 'GO', '62'], ['Brasília', 'DF', '61'],
  ['Cuiabá', 'MT', '65'], ['Sinop', 'MT', '66'], ['Rio de Janeiro', 'RJ', '21'],
]
const FIRST = ['Lucas', 'Juliana', 'Rafael', 'Fernanda', 'Gustavo', 'Patrícia', 'Thiago', 'Camila', 'Rodrigo', 'Aline', 'Marcelo', 'Beatriz', 'Felipe', 'Larissa', 'André', 'Vanessa', 'Renata', 'Eduardo', 'Simone', 'Leandro', 'Priscila', 'Sérgio', 'Adriano', 'Mariana', 'Carlos', 'Daniela']
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Ferreira', 'Gomes', 'Machado', 'Martins', 'Nunes', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Teixeira', 'Vieira', 'Zanatta', 'Schmitz', 'Bortolini', 'Fagundes', 'Campos', 'Moura']
const AGENCIES: [name: string, city: string, uf: string, ddd: string][] = [['Litoral Imóveis', 'Itapema', 'SC', '47'], ['Meia Praia Negócios Imobiliários', 'Itapema', 'SC', '47'], ['Costa Esmeralda Imóveis', 'Porto Belo', 'SC', '47'], ['Capital Invest Imóveis', 'São Paulo', 'SP', '11'], ['Sul Patrimônio Imobiliária', 'Curitiba', 'PR', '41'], ['Cerrado Prime Negócios', 'Goiânia', 'GO', '62']]

type Kind = 'investidor' | 'moradia' | 'permuta' | 'imobiliaria'
const TYPE_OF: Record<Kind, string> = { investidor: 'Investidor', moradia: 'Moradia', permuta: 'Permuta', imobiliaria: 'Imobiliária parceira' }
const TAGS: Record<Kind, string[]> = { investidor: ['investidor', 'na planta', 'temporada'], moradia: ['moradia', 'pronto para morar', 'visita ao decorado'], permuta: ['permuta', 'moradia'], imobiliaria: ['imobiliária parceira', 'investidor'] }
const NOTES: Record<Kind, string[]> = {
  investidor: [
    'Investidor de fora de SC: quer comprar na planta e revender na entrega (valorização).',
    'Pediu a tabela de lançamento com as condições direto com a construtora.',
    'Quer renda com aluguel de temporada: pediu estudo de rentabilidade.',
    'Comparando 2 suítes no Prime Perequê Beach com 3 suítes no Prime Garden Residence.',
    'Já tem um apartamento em Itapema, quer a segunda unidade para temporada.',
  ],
  moradia: ['Família procura 3 suítes pronto para morar ou com entrega próxima.', 'Agendou visita ao decorado no sábado.', 'Pediu simulação de financiamento com entrada de 30%.', 'Quer vista para o mar e 2 vagas de garagem.'],
  permuta: ['Oferece apartamento em Blumenau como parte do pagamento (permuta).', 'Quer avaliar permuta de casa em Brusque mais saldo financiado.', 'Permuta de terreno em Porto Belo por unidade na planta.'],
  imobiliaria: ['Imobiliária parceira com cliente investidor interessado em cobertura.', 'Pediu material de divulgação do lançamento.', 'Corretor parceiro agendou visita ao decorado com cliente de fora do estado.'],
}
const SALE: Record<Kind, [number, number]> = { investidor: [650_000, 2_400_000], moradia: [900_000, 3_200_000], permuta: [1_200_000, 4_500_000], imobiliaria: [800_000, 4_500_000] }

/** Campanhas de anúncio (Google Ads e Meta Ads); as do Google também ficam nos leads e atendimentos vindos de anúncio. */
const GADS = [['21100001', 'Investidores Brasil – Na Planta', 180], ['21100002', 'Itapema Frente Mar', 140]] as const
const META = [['23850001', 'Lançamento Prime Ganchos Bay', 150], ['23850002', 'Rentabilidade – Aluguel de Temporada', 90]] as const

type Talk = [name: string, kind: Kind, city: number, msgs: [fromMe: boolean, text: string][], labels: string[]]
const TALKS: Talk[] = [
  ['Gustavo Teixeira', 'investidor', 9, [[false, 'Boa tarde! Vi o anúncio "Investidores Brasil – Na Planta". Como funciona a tabela de lançamento do Prime Ganchos Bay?'], [true, 'Boa tarde, Gustavo! No lançamento a entrada é facilitada e o saldo é parcelado direto com a construtora até as chaves. Te mando a tabela e as plantas?'], [false, 'Manda sim. Tenho interesse em 2 suítes para aluguel de temporada.'], [true, 'Perfeito! Mando junto o estudo de rentabilidade de temporada da região. 🌊'], [false, 'Aguardo, obrigado']], ['Investidor', 'Lançamento']],
  ['Renata Zanatta', 'moradia', 4, [[false, 'Oi! Queremos agendar uma visita ao decorado do Prime Garden Residence no sábado.'], [true, 'Oi, Renata! Temos horários às 10h e às 15h. Qual fica melhor?'], [false, '10h, vamos em 4 pessoas.'], [true, 'Agendado! Te espero no plantão de vendas do Perequê. Até sábado! 🏡']], ['Visita ao decorado']],
  ['Marcelo Bortolini', 'investidor', 6, [[false, 'Qual o valor do m² no Prime Ocean Tower? Quero andar alto com vista para o mar.'], [true, 'Olá, Marcelo! O valor muda conforme o andar e a posição. Te mando a tabela com as unidades de frente mar disponíveis.'], [false, 'Manda. E a obra está em que fase?'], [true, 'Está com 62% da obra concluída. Te mando o relatório de evolução com fotos. 🏗️']], ['Investidor', 'Proposta']],
  ['Litoral Imóveis', 'imobiliaria', 0, [[false, 'Temos um cliente de São Paulo querendo cobertura frente mar. Ainda tem no Ocean Tower?'], [true, 'Temos uma cobertura disponível. Posso reservar uma visita para vocês?'], [false, 'Pode, quinta à tarde.']], ['Imobiliária parceira']],
  ['Aline Ferreira', 'moradia', 1, [[false, 'A vaga de garagem é coberta? Precisamos de duas no Prime Garden.']], ['Proposta']],
  ['Rodrigo Schmitz', 'permuta', 2, [[false, 'Vocês aceitam permuta? Tenho um apartamento em Blumenau.'], [true, 'Aceitamos sim, conforme a avaliação. Pode me mandar fotos e a matrícula?'], [false, 'Mando hoje à noite.']], ['Permuta']],
  ['Fernanda Martins', 'moradia', 12, [[false, 'Qual a entrega prevista do Prime Garden Residence?'], [true, 'A data de entrega está no contrato e no cronograma da obra, que hoje está com 35%. Te mando o último relatório com fotos.']], ['Lançamento']],
  ['Eduardo Nunes', 'moradia', 0, [[false, 'Recebi as chaves, tudo perfeito! Como agendo a assistência técnica para ajustar a porta da varanda?'], [true, 'Parabéns pelo apê novo! 🎉 A assistência técnica agenda por aqui mesmo. Qual dia fica bom para você?']], ['Pós-venda']],
  ['Patrícia Gomes', 'investidor', 16, [[false, 'O Prime Perequê Beach ainda está na planta? Quero entrar no começo para valorizar.']], ['Investidor', 'Lançamento']],
  ['Thiago Almeida', 'moradia', 14, [[false, 'Consigo usar o FGTS na entrada?'], [true, 'Consegue na parte financiada pelo banco. Quer que nosso correspondente bancário faça a simulação de financiamento?'], [false, 'Quero sim!']], ['Financiamento']],
  ['Carlos Campos', 'investidor', 18, [[false, 'Sou de Cuiabá e quero investir em Itapema. Quais empreendimentos têm melhor rentabilidade de temporada?']], ['Investidor']],
]

const POSTS: [title: string, caption: string, days: number, format: 'FEED' | 'STORIES' | 'REELS', status: 'RASCUNHO' | 'EM_APROVACAO' | 'APROVADO' | 'PUBLICADO'][] = [
  ['Lançamento Prime Ganchos Bay', 'Prime Ganchos Bay, em Governador Celso Ramos: lançamento na planta com tabela especial para os primeiros compradores. Cadastre-se pelo link da bio.', 1, 'FEED', 'APROVADO'],
  ['Tour pelo decorado – Prime Garden Residence', 'Venha com a gente pelo decorado do Prime Garden Residence, em Porto Belo: living integrado, varanda gourmet e suíte master. 🎥', 2, 'REELS', 'APROVADO'],
  ['Obra evoluindo – Prime Ocean Tower', 'Prime Ocean Tower, Meia Praia: 62% da obra concluída. 🏗️', 3, 'REELS', 'EM_APROVACAO'],
  ['Investir na planta em Itapema', 'Comprar na planta é entrar com condição de lançamento e acompanhar a valorização até a entrega. Fale com um consultor.', 5, 'FEED', 'APROVADO'],
  ['Rentabilidade com aluguel de temporada', 'Apartamento na praia que trabalha por você: veja como funciona o aluguel de temporada no Litoral Norte de SC.', 6, 'REELS', 'RASCUNHO'],
  ['Vista do Prime Ocean Tower', 'É essa a vista que você quer ter todos os dias? 🌊', 8, 'STORIES', 'APROVADO'],
  ['Prime Perequê Beach na planta', 'Pé na areia no Perequê, em Porto Belo. Pré-lançamento: entre na lista de interessados.', 10, 'FEED', 'RASCUNHO'],
  ['Obra evoluindo – Prime Garden Residence', 'Prime Garden Residence com 35% da obra concluída.', -3, 'REELS', 'PUBLICADO'],
  ['Decorado aberto no fim de semana', 'Decorado do Prime Garden aberto no sábado e no domingo. Agende pelo WhatsApp.', -6, 'STORIES', 'PUBLICADO'],
  ['Evento de lançamento', 'Obrigado a todos que vieram ao evento de lançamento do Prime Ganchos Bay!', -12, 'FEED', 'PUBLICADO'],
]

async function main() {
  if (process.env.DEMO !== 'sim') throw new Error('Confirme com DEMO=sim (cria uma empresa fictícia neste banco).')
  if (await prisma.tenant.findUnique({ where: { slug: SLUG } })) {
    console.log(`${SLUG}: já existe, nada alterado.`)
    return
  }
  const counts: Record<string, number> = {}
  const add = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

  // ---------- Empresa, marca e perfis (todos os sistemas, menos fretes) ----------
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: NAME, isDemo: true, notes: 'Empresa fictícia para apresentação a clientes (construtora de edifícios em Itapema/SC).', status: 'ATIVA', planId: null, paidUntil: new Date(now + 365 * DAY), extraSystems: SYSTEM_KEYS.filter((k) => k !== 'fretes'), extraUsers: 20, extraWhatsapp: 5 },
  })
  const t = tenant.id
  const setting = (key: string, value: unknown) => prisma.tenantSetting.create({ data: { tenantId: t, key, value: json(value) } })
  await setting('branding', { appName: NAME, shortName: NAME, primaryColor: COLORS.primary, brandColor: COLORS.primary, sidebarColor: COLORS.sidebar, defaultLayout: 'SISTEMAS', defaultScreens: 'NOVO' })
  await setting('postagens_contas', { accounts: [{ id: 'ig-oficial', network: 'instagram', externalId: '17841400000000031', name: '@primeconstrutora', group: 'Oficial' }, { id: 'fb-pagina', network: 'facebook', externalId: '100000000000031', name: NAME, group: 'Oficial' }] })
  const adminRoleId = await createDefaultRoles(prisma, t)
  const supplies = await prisma.role.create({ data: { tenantId: t, name: 'Suprimentos', description: 'Compras das obras: consulta de leads e chat com fornecedores.', permissions: { create: [{ module: 'dashboard', canView: true }, { module: 'chat', canView: true, canCreate: true, canEdit: true }] } } })
  await prisma.role.updateMany({ where: { tenantId: t }, data: { require2fa: false } })
  const roleByName = new Map((await prisma.role.findMany({ where: { tenantId: t } })).map((r) => [r.name, r.id]))

  const units: Unit[] = []
  for (const u of UNITS) units.push(await prisma.unit.create({ data: { tenantId: t, name: u.name, city: u.city, state: 'SC', isHeadquarters: u.hq } }))
  add('unidades', units.length)

  const hash = await hashPassword(PASSWORD)
  const users: User[] = []
  for (const [name, role, unit] of TEAM) {
    const roleId = role === 'admin' ? adminRoleId : role === 'Suprimentos' ? supplies.id : roleByName.get(role)!
    users.push(await prisma.user.create({ data: { tenantId: t, roleId, unitId: units[unit]!.id, name, email: `${slugify(name.split(' ')[0]!)}@${SLUG}.demo`, passwordHash: hash, trailDone: ['*'] } }))
  }
  add('usuários', users.length)
  const admin = users[0]!
  const marketing = users.find((u) => u.name === 'Camila Rocha')!
  const sellers = []
  for (const [i, u] of users.entries()) if (TEAM[i]![3]) sellers.push(await prisma.seller.create({ data: { tenantId: t, name: u.name, email: u.email, userId: u.id, unitId: u.unitId, gender: ['Juliana Sartori', 'Bianca Moretti'].includes(u.name) ? 'F' : 'M' } }))
  add('corretores e consultores (vendedores)', sellers.length)
  const lookups = async (type: 'ORIGEM' | 'MOTIVO_PERDA' | 'TIPO_CLIENTE' | 'MARCA' | 'TIPO_PECA', names: readonly string[]) => Promise.all(names.map((name) => prisma.lookupItem.create({ data: { tenantId: t, type, name } })))
  const origins = await lookups('ORIGEM', ORIGINS)
  const lost = await lookups('MOTIVO_PERDA', LOST)
  const customerTypes = await lookups('TIPO_CLIENTE', CUSTOMER_TYPES)
  // "Marcas" e "Tipos de produto" dos atendimentos: os empreendimentos e as plantas.
  const projectItems = await lookups('MARCA', PROJECTS.map((p) => p.name))
  const typologies = await lookups('TIPO_PECA', TYPOLOGIES)
  add('listas (origens, motivos, tipos de cliente, empreendimentos, plantas)', origins.length + lost.length + customerTypes.length + projectItems.length + typologies.length)
  const origin = (n: string) => origins.find((o) => o.name === n)!

  // ---------- Leads: compradores de todo o Brasil ----------
  const people: { name: string; kind: Kind; city: [string, string, string]; company: string | null }[] = []
  for (const [name, kind, city] of TALKS) {
    const ag = AGENCIES.find((a) => a[0] === name)
    people.push({ name, kind, city: ag ? [ag[1], ag[2], ag[3]] : CITIES[city]!, company: ag ? name : null })
  }
  const used = new Set(people.map((p) => p.name))
  for (const [name, city, uf, ddd] of AGENCIES) if (!used.has(name)) (people.push({ name, kind: 'imobiliaria', city: [city, uf, ddd], company: name }), used.add(name))
  while (people.length < 84) {
    const name = `${pick(FIRST)} ${pick(LAST)}`
    if (used.has(name)) continue
    used.add(name)
    const kind: Kind = rnd() < 0.58 ? 'investidor' : rnd() < 0.85 ? 'moradia' : 'permuta'
    // Moradia: mais de SC; investidores: de todo o Brasil.
    const city = kind === 'investidor' ? pick(rnd() < 0.25 ? CITIES.slice(0, 6) : CITIES.slice(6)) : pick(rnd() < 0.65 ? CITIES.slice(0, 6) : CITIES)
    people.push({ name, kind, city, company: null })
  }
  const leads: (Lead & { kind: Kind })[] = []
  for (const [i, p] of people.entries()) {
    const [city, state, ddd] = p.city
    const created = ago(between(1, 88))
    const project = p.kind === 'investidor' ? pick([PROJECTS[0], PROJECTS[2], PROJECTS[3], PROJECTS[3]]) : pick(PROJECTS)
    const via = p.kind === 'imobiliaria' ? 'Imobiliária parceira' : p.kind === 'investidor' ? pick(['Google Ads', 'Google Ads', 'Meta Ads', 'Meta Ads', 'Instagram', 'Site', 'Indicação']) : pick(ORIGINS)
    // Campanha do Google Ads só para quem veio de anúncio (origem Google Ads com clique antes do contato).
    const ad = via === 'Google Ads' ? pick(GADS) : null
    const unit = project.city === 'Porto Belo' && rnd() < 0.6 ? units[1]! : units[0]!
    const owner = sellers.find((s) => s.unitId === unit.id && rnd() < 0.5) ?? pick(sellers)
    const tags = [...new Set([pick(TAGS[p.kind]), ...(rnd() > 0.4 ? [pick(TAGS[p.kind])] : []), project.tag])]
    const lead = await prisma.lead.create({
      data: {
        tenantId: t, name: p.name, company: p.company, jobTitle: p.kind === 'imobiliaria' ? 'Corretor(a) parceiro(a)' : p.kind === 'investidor' ? pick(['Empresário(a)', 'Médico(a)', 'Produtor(a) rural', 'Engenheiro(a)', null]) : null,
        email: `${slugify(p.name)}${i}@exemplo.com.br`, phone: `55${ddd}9${String(81000000 + i * 7919).slice(0, 8)}`, city, state, unitId: unit.id,
        stage: pick(['LEAD', 'LEAD', 'QUALIFICADO', 'QUALIFICADO', 'OPORTUNIDADE'] as const),
        ownerId: owner.id, originId: origin(via).id, emailOptIn: rnd() > 0.25, scoreProfile: between(10, 100), scoreInterest: between(0, 100), scoreGrade: pick(['A', 'B', 'B', 'C', 'C', 'D']), scoreUpdatedAt: ago(1),
        createdAt: created, firstConversionAt: created, lastConversionAt: created, lastActivityAt: ago(between(0, 12)), tags,
        ...(ad ? { adsFirstCampaignId: ad[0], adsFirstCampaign: ad[1], adsFirstAt: created, adsLastCampaignId: ad[0], adsLastCampaign: ad[1], adsLastAt: created, adsCheckedAt: created } : {}),
      },
    })
    leads.push({ ...lead, kind: p.kind })
  }
  add('leads', leads.length)
  const leadByName = (n: string) => leads.find((l) => l.name === n)!

  // ---------- Pré-vendas (interessados: visitas e propostas) e pós-vendas (clientes que compraram) ----------
  const pres = []
  for (let i = 0; i < 60; i++) {
    const l = pick(leads)
    const status = pick(['NEGOCIACAO', 'NEGOCIACAO', 'NEGOCIACAO', 'SIM', 'SIM', 'NAO'] as const)
    const at = ago(between(0, 80))
    const seller = sellers.find((s) => s.id === l.ownerId)!
    const project = PROJECTS.find((x) => l.tags.includes(x.tag)) ?? pick(PROJECTS)
    const ad = l.adsLastCampaignId ? { adsVia: 'ANUNCIO', adsCampaignId: l.adsLastCampaignId, adsCampaign: l.adsLastCampaign, adsTouchAt: l.adsLastAt, adsCheckedAt: at } : {}
    pres.push(
      await prisma.serviceRecord.create({
        data: {
          tenantId: t, kind: 'PRE_VENDAS', leadAt: at, name: l.name!, phone: l.phone, email: l.email, sellerId: seller.id, unitId: seller.unitId, leadId: l.id, originId: l.originId, state: l.state, city: l.city,
          customerTypeId: customerTypes.find((c) => c.name === TYPE_OF[l.kind])!.id, brandIds: [projectItems.find((x) => x.name === project.name)!.id], partTypeIds: [pick(typologies).id],
          forwarded: true, forwardedAt: new Date(at.getTime() + 300_000), saleStatus: status, saleValue: status === 'SIM' ? Math.round(between(SALE[l.kind][0], SALE[l.kind][1]) / 1000) * 1000 : null, lostReasonId: status === 'NAO' ? pick(lost).id : null,
          resultAt: status === 'NEGOCIACAO' ? null : new Date(Math.min(now, at.getTime() + between(3, 20) * DAY)), invoiceNumber: status === 'SIM' ? `CT-2026-${String(100 + i).padStart(4, '0')}` : null, callDueAt: status === 'NEGOCIACAO' ? new Date(at.getTime() + DAY) : null,
          notes: `${label(project)}. ${pick(NOTES[l.kind])}`, firstActionAt: new Date(at.getTime() + 600_000 + rnd() * 3_000_000), createdAt: at, createdById: users[4]!.id, ...ad,
        },
      }),
    )
  }
  add('pré-vendas (interessados)', pres.length)
  const FOLLOW = ['PENDENTE', 'CONTATADO', 'ANALISANDO', 'RESOLVIDO', 'RESOLVIDO'] as const
  const FOLLOW_NOTES = ['Contrato assinado; boas-vindas enviadas com o cronograma da obra.', 'Vistoria de entrega agendada com o cliente.', 'Entrega das chaves realizada.', 'Assistência técnica: ajuste na porta da varanda.', 'Cliente pediu o manual do proprietário.', 'Personalização da planta aprovada pela engenharia.']
  let posVendas = 0
  for (const p of pres.filter((r) => r.saleStatus === 'SIM')) {
    const at = new Date(Math.min(now - 3_600_000, (p.resultAt ?? p.leadAt).getTime() + 2 * DAY))
    const follow = at.getTime() > now - 3 * DAY ? 'PENDENTE' : pick(FOLLOW)
    await prisma.serviceRecord.create({
      data: {
        tenantId: t, kind: 'POS_VENDAS', leadAt: at, name: p.name, phone: p.phone, email: p.email, sellerId: p.sellerId, unitId: p.unitId, leadId: p.leadId, originId: p.originId, customerTypeId: p.customerTypeId, state: p.state, city: p.city,
        brandIds: p.brandIds, partTypeIds: p.partTypeIds, parentId: p.id, saleStatus: 'SIM', saleValue: p.saleValue, invoiceNumber: p.invoiceNumber, followStatus: follow, followNote: follow === 'PENDENTE' ? null : pick(FOLLOW_NOTES), dueAt: new Date(at.getTime() + DAY),
        firstActionAt: follow === 'PENDENTE' ? null : new Date(at.getTime() + between(1, 20) * 3_600_000), createdAt: at, createdById: users[5]!.id,
      },
    })
    await prisma.lead.update({ where: { id: p.leadId! }, data: { stage: 'CLIENTE', lastSaleAt: p.resultAt, lastSaleValue: p.saleValue } })
    posVendas++
  }
  add('pós-vendas (clientes)', posVendas)

  // ---------- WhatsApp ----------
  const number = await prisma.whatsappNumber.create({ data: { tenantId: t, name: 'Vendas', instanceName: `demo-${SLUG}-${randomBytes(3).toString('hex')}`, phone: '554733680800', profileName: NAME, status: 'CONECTADO', connectedAt: ago(40), userIds: users.map((u) => u.id), sellerIds: sellers.map((x) => x.id) } })
  const LABELS: [string, string][] = [['Investidor', 'azul'], ['Lançamento', 'laranja'], ['Visita ao decorado', 'verde'], ['Proposta', 'vermelho'], ['Financiamento', 'amarelo'], ['Permuta', 'roxo'], ['Imobiliária parceira', 'rosa'], ['Pós-venda', 'cinza']]
  const labels = new Map<string, string>()
  for (const [name, color] of LABELS) labels.set(name, (await prisma.whatsappLabel.create({ data: { tenantId: t, name, color } })).id)
  add('etiquetas do chat', labels.size)
  const QUICK: [string, string][] = [
    ['Agendar visita ao decorado', 'Que bom que você quer conhecer o decorado! Me diga o melhor dia e horário que eu reservo a visita.'],
    ['Tabela de lançamento', 'Segue a tabela de lançamento com as unidades disponíveis. As condições são direto com a construtora até a entrega das chaves.'],
    ['Simulação de financiamento', 'Para a simulação de financiamento preciso da sua renda aproximada, do valor de entrada e se vai usar o FGTS.'],
  ]
  for (const [title, text] of QUICK) await prisma.whatsappQuickReply.create({ data: { tenantId: t, title, text } })
  add('respostas rápidas', QUICK.length)
  for (const [k, [name, , , msgs, tags]] of TALKS.entries()) {
    const lead = leadByName(name)
    const seller = sellers.find((s) => s.id === lead.ownerId)!
    const who = users.find((u) => u.id === seller.userId)!
    const t0 = now - (k * 53 + 15) * 60_000 - msgs.length * 120_000
    const last = msgs[msgs.length - 1]!
    const conv = await prisma.whatsappConversation.create({
      data: {
        tenantId: t, numberId: number.id, jid: `${lead.phone}@s.whatsapp.net`, phone: lead.phone, name, leadId: lead.id,
        assignedUserId: who.id, assignedSellerId: seller.id, unread: last[0] ? 0 : 1 + (k % 3), category: 'CLIENTE', status: 'ABERTA',
        lastMessageAt: new Date(t0 + msgs.length * 120_000), lastPreview: last[1], lastFromMe: last[0], lastInboundAt: new Date(t0 + msgs.length * 120_000 - (last[0] ? 120_000 : 0)),
      },
    })
    for (const [j, [fromMe, text]] of msgs.entries()) {
      await prisma.whatsappMessage.create({ data: { tenantId: t, conversationId: conv.id, waId: `DEMOPR${k}_${j}`, fromMe, type: 'text', text, sentAt: new Date(t0 + j * 120_000), status: fromMe ? 'READ' : null, sentByName: fromMe ? who.name : null, sentById: fromMe ? who.id : null } })
      add('mensagens do WhatsApp')
    }
    for (const l of tags) await prisma.whatsappConversationLabel.create({ data: { conversationId: conv.id, labelId: labels.get(l)! } })
    add('conversas do WhatsApp')
  }

  // ---------- Postagens ----------
  for (const [title, caption, d, format, status] of POSTS) {
    const when = new Date(now + d * DAY)
    when.setUTCHours(21, 30, 0, 0)
    const ok = status === 'APROVADO' || status === 'PUBLICADO'
    await prisma.socialPost.create({ data: { tenantId: t, title, caption, networks: ['instagram', 'facebook'], accountIds: ['ig-oficial', 'fb-pagina'], format, scheduledAt: when, status, publicToken: randomBytes(16).toString('hex'), createdById: marketing.id, createdByName: marketing.name, publishedAt: status === 'PUBLICADO' ? when : null, approvedById: ok ? admin.id : null, approvedByName: ok ? admin.name : null, approvedAt: ok ? ago(Math.max(0, -d) + 1) : null } })
  }
  add('postagens', POSTS.length)

  // ---------- E-mail marketing e automações ----------
  const segments = await Promise.all([
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Investidores de todo o Brasil', filters: json({ tag: 'investidor' }) } }),
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Aluguel de temporada', filters: json({ tag: 'temporada' }) } }),
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Moradia em Santa Catarina', filters: json({ tag: 'moradia', state: 'SC' }) } }),
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Região Sul', filters: json({ region: 'SUL' }) } }),
  ])
  add('segmentos de e-mail', segments.length)
  const optIn = leads.filter((l) => l.emailOptIn)
  const CAMPAIGNS: [name: string, subject: string, text: string, days: number, seg: number, links: string[]][] = [
    ['Investir na planta em Itapema', 'Investir na planta em Itapema: entre na fase de lançamento', 'Comprar na planta é entrar com condição de lançamento, pagar direto com a construtora e acompanhar a valorização até a entrega.', 30, 0, [`${SITE}/investir-na-planta`, `${SITE}/simulador`]],
    ['Tabela de lançamento Prime Ganchos Bay', 'Chegou a tabela de lançamento do Prime Ganchos Bay', 'Prime Ganchos Bay, em Governador Celso Ramos: lançamento na planta. Veja as plantas de 2 a 4 suítes e as condições direto com a construtora.', 16, 0, [`${SITE}/prime-ganchos-bay`, `${SITE}/prime-ganchos-bay/tabela`]],
    ['Rentabilidade com aluguel de temporada', 'Seu apartamento na praia trabalhando por você', 'Entenda como funciona o aluguel de temporada no Litoral Norte de SC e o que considerar para estimar a rentabilidade.', 9, 1, [`${SITE}/temporada`]],
    ['Convite: pré-lançamento Prime Perequê Beach', 'Você é nosso convidado: pré-lançamento Prime Perequê Beach', 'Pé na areia no Perequê, em Porto Belo. Venha conhecer o projeto no plantão de vendas antes da abertura ao público.', 3, 3, [`${SITE}/prime-pereque-beach`, `${SITE}/agendar-visita`]],
  ]
  for (const [name, subject, text, d, seg, links] of CAMPAIGNS) {
    const started = ago(d)
    const blocks = [{ type: 'titulo', html: subject, align: 'center' }, { type: 'texto', html: `<p>Olá, {nome}! ${text}</p>` }, { type: 'botao', text: 'Quero saber mais', url: links[0], color: COLORS.primary }]
    const c = await prisma.emailCampaign.create({ data: { tenantId: t, name, subject, preheader: `${NAME} · Itapema/SC`, fromName: NAME, blocks: json(blocks), links, segmentId: segments[seg]!.id, status: 'ENVIADA', startedAt: started, finishedAt: new Date(started.getTime() + 1_200_000), createdById: marketing.id, createdAt: new Date(started.getTime() - DAY) } })
    let opens = 0
    let clicks = 0
    const audience = optIn.filter((_, k) => (k + d) % 4 !== 0)
    for (const l of audience) {
      const opened = rnd() < 0.45
      const clicked = opened && rnd() < 0.32
      const r = await prisma.emailRecipient.create({ data: { campaignId: c.id, leadId: l.id, email: l.email!, status: 'ENVIADO', sentAt: started, openedAt: opened ? new Date(started.getTime() + between(1, 48) * 3_600_000) : null, opens: opened ? between(1, 3) : 0, clickedAt: clicked ? new Date(started.getTime() + between(2, 50) * 3_600_000) : null, clicks: clicked ? 1 : 0 } })
      if (clicked) await prisma.emailClick.create({ data: { recipientId: r.id, campaignId: c.id, linkIndex: between(0, links.length - 1), createdAt: r.clickedAt! } })
      opens += opened ? 1 : 0
      clicks += clicked ? 1 : 0
    }
    await prisma.emailCampaign.update({ where: { id: c.id }, data: { total: audience.length, sent: audience.length, opens, clicks, unsubscribes: d > 10 ? 1 : 0 } })
    add('campanhas de e-mail enviadas')
    add('destinatários de e-mail', audience.length)
  }
  await prisma.emailCampaign.create({ data: { tenantId: t, name: 'Obras evoluindo – dezembro', subject: 'Veja como estão as obras do Prime Ocean Tower e do Prime Garden', status: 'RASCUNHO', segmentId: segments[3]!.id, blocks: json([{ type: 'titulo', html: 'Obras evoluindo', align: 'center' }]), createdById: marketing.id } })
  const tpl = (name: string, subject: string, text: string) =>
    prisma.emailCampaign.create({ data: { tenantId: t, name, subject, kind: 'MODELO', status: 'RASCUNHO', blocks: json([{ type: 'titulo', html: subject, align: 'center' }, { type: 'texto', html: `<p>Olá, {nome}! ${text}</p>` }, { type: 'botao', text: 'Falar com um consultor', url: `${SITE}/contato`, color: COLORS.primary }]), createdById: marketing.id } })
  const tpl1 = await tpl('Investidor 1 – Por que investir na planta', 'Por que investir na planta em Itapema', 'Na planta você entra com a tabela de lançamento e condições direto com a construtora.')
  const tpl2 = await tpl('Investidor 2 – Rentabilidade de temporada', 'Rentabilidade com aluguel de temporada', 'Veja como o aluguel de temporada pode gerar renda com o seu apartamento no Litoral Norte de SC.')
  add('campanhas de e-mail (rascunho e modelos)', 3)
  const nurture = await prisma.automation.create({
    data: {
      tenantId: t, name: 'Nutrição de investidores', description: 'Lead novo recebe o e-mail sobre investir na planta; quem abriu vira lead quente e o diretor é avisado, quem não abriu recebe o de rentabilidade.', active: true, activatedAt: ago(60), createdById: marketing.id,
      trigger: json({ type: 'lead_novo', originId: null, includeImported: false }),
      steps: json([
        { id: 'n1', type: 'enviar_email', templateId: tpl1.id },
        { id: 'n2', type: 'esperar', amount: 3, unit: 'dias' },
        { id: 'n3', type: 'condicao', match: 'todas', rules: [{ type: 'abriu_email', negate: false, scope: 'ultimo' }], yes: [{ id: 'n4', type: 'adicionar_tag', tags: ['lead quente'] }, { id: 'n5', type: 'notificar', userIds: [admin.id], message: 'Lead de investidor abriu o e-mail: chame no WhatsApp.' }], no: [{ id: 'n6', type: 'enviar_email', templateId: tpl2.id }] },
      ]),
    },
  })
  const regional = await prisma.automation.create({
    data: {
      tenantId: t, name: 'Lançamento regional – Prime Perequê Beach', description: 'Quem se cadastra no formulário do Perequê recebe o convite para o plantão de vendas.', active: true, activatedAt: ago(20), createdById: marketing.id,
      trigger: json({ type: 'formulario', text: 'Perequê' }),
      steps: json([{ id: 'r1', type: 'enviar_whatsapp', numberId: number.id, text: 'Olá, {nome}! Obrigado pelo interesse no Prime Perequê Beach. Quer agendar uma visita ao plantão de vendas no Perequê?', openRecord: true }, { id: 'r2', type: 'esperar', amount: 2, unit: 'dias' }, { id: 'r3', type: 'adicionar_tag', tags: ['prime perequê beach'] }]),
    },
  })
  await prisma.automation.create({
    data: {
      tenantId: t, name: 'Pós-visita ao decorado', description: 'Lead que virou oportunidade recebe a mensagem do consultor no dia seguinte.', active: false, createdById: marketing.id,
      trigger: json({ type: 'etapa', stage: 'OPORTUNIDADE' }),
      steps: json([{ id: 'v1', type: 'esperar', amount: 1, unit: 'dias' }, { id: 'v2', type: 'enviar_whatsapp', numberId: number.id, text: 'Olá, {nome}! Obrigado pela visita ao decorado. Ficou alguma dúvida sobre as plantas ou a simulação?', openRecord: false }]),
    },
  })
  add('automações', 3)
  for (const [i, l] of leads.slice(-14).entries()) {
    const a = i < 10 ? nurture : regional
    const done = i % 3 !== 0
    const started = ago(between(1, 20))
    const run = await prisma.automationRun.create({ data: { tenantId: t, automationId: a.id, leadId: l.id, status: done ? 'CONCLUIDO' : 'ATIVO', stepId: done ? null : a === nurture ? 'n2' : 'r2', nextRunAt: done ? null : new Date(now + DAY), startedAt: started, finishedAt: done ? new Date(started.getTime() + 3 * DAY) : null } })
    await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, kind: 'entrou', message: 'Entrou no fluxo.', createdAt: started } })
    if (a === nurture) await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, stepId: 'n1', kind: 'email', message: `E-mail "${tpl1.name}" enviado.`, createdAt: started } })
    if (done) await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, kind: 'concluiu', message: 'Concluiu o fluxo.', createdAt: new Date(started.getTime() + 3 * DAY) } })
    add('passagens pelas automações')
  }

  // ---------- Web Push (só campanhas com os números; inscritos precisam de navegador de verdade) ----------
  for (const [name, title, message, d, targets] of [
    ['Lançamento Prime Ganchos Bay', 'Prime Ganchos Bay: lançamento na planta', 'Plantas de 2 a 4 suítes em Governador Celso Ramos. Veja a tabela de lançamento.', 15, 612],
    ['Decorado aberto', 'Decorado aberto neste fim de semana', 'Agende a sua visita ao decorado do Prime Garden Residence.', 5, 655],
  ] as const) {
    const sent = targets - between(5, 20)
    const delivered = sent - between(10, 30)
    await prisma.webPushCampaign.create({ data: { tenantId: t, name, title, message, url: `${SITE}/empreendimentos`, buttonLabel: 'Ver empreendimento', status: 'ENVIADO', sentAt: ago(d), finishedAt: ago(d), targets, sent, failed: targets - sent, delivered, clicks: Math.round(delivered * (0.05 + rnd() * 0.06)), createdById: marketing.id, createdByName: marketing.name } })
  }
  add('campanhas de Web Push', 2)

  // ---------- Anúncios (Marketing Inteligente) ----------
  for (let d = 1; d <= 90; d++) {
    const date = utcDay(spDay(-d))
    for (const [campaignId, campaignName, budget] of GADS) {
      const cost = r2(budget * (0.7 + rnd() * 0.5))
      const clicks = Math.round(cost / (1.8 + rnd() * 1.6))
      await prisma.googleAdsCampaignDay.create({ data: { tenantId: t, date, campaignId, campaignName, cost, clicks, impressions: clicks * between(14, 30), conversions: r2(clicks * (0.02 + rnd() * 0.04)) } })
    }
    for (const [campaignId, campaignName, budget] of META) {
      const spend = r2(budget * (0.7 + rnd() * 0.5))
      const impressions = Math.round(spend * between(55, 90))
      await prisma.mktAdDay.create({ data: { tenantId: t, platform: 'meta', level: 'campaign', entityId: campaignId, name: campaignName, campaignId, campaignName, objective: campaignName.startsWith('Lançamento') ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC', date, spend, impressions, reach: Math.round(impressions * 0.7), clicks: Math.round(impressions * (0.009 + rnd() * 0.01)), leads: campaignName.startsWith('Lançamento') ? between(1, 7) : between(0, 2), conversations: between(0, 4) } })
    }
  }
  add('dias de Google Ads e Meta Ads (por campanha)', 90 * 4)

  console.log(`${SLUG}: criada (${admin.email})`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  console.log(`Senha dos usuários: ${PASSWORD}`)
}

main().finally(() => prisma.$disconnect())
