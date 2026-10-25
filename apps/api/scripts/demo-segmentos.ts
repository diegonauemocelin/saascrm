/**
 * Empresas de DEMONSTRAÇÃO, com dados fictícios, para as telas e os vídeos do site de apresentação
 * (apps/site). Uma por segmento: autopeças, loja de roupas e fábrica de roupas para padel.
 *
 *   cd apps/api && npx tsx scripts/demo-segmentos.ts          (usa o DATABASE_URL do .env)
 *
 * Só para um banco de desenvolvimento: nunca rode em produção. Senha de todos os usuários: Demo-Segmentos-2026!
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../src/auth/password'
import { PrismaClient } from '../src/generated/prisma/client'
import { createDefaultRoles } from '../src/plataforma/perfis-padrao'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const PASSWORD = 'Demo-Segmentos-2026!'
const DAY = 86_400_000
const now = Date.now()
let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!
const ago = (days: number) => new Date(now - days * DAY - rnd() * 8 * 3_600_000)

type Talk = [string, [boolean, string][]]
type Post = [title: string, caption: string, days: number, format: 'FEED' | 'STORIES' | 'REELS', status: 'RASCUNHO' | 'EM_APROVACAO' | 'APROVADO' | 'PUBLICADO']

interface Segment {
  slug: string
  name: string
  short: string
  colors: { primary: string; sidebar: string }
  team: string[]
  origins: string[]
  lost: string[]
  companies: string[] | null
  tags: string[]
  notes: string[]
  sale: [number, number]
  instagram: string
  talks: Talk[]
  posts: Post[]
}

const FIRST = ['Lucas', 'Juliana', 'Rafael', 'Fernanda', 'Gustavo', 'Patrícia', 'Thiago', 'Camila', 'Rodrigo', 'Aline', 'Marcelo', 'Beatriz', 'Felipe', 'Larissa', 'André', 'Vanessa', 'Renata', 'Eduardo', 'Simone', 'Tatiane', 'Leandro', 'Priscila']
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Ferreira', 'Gomes', 'Machado', 'Martins', 'Nunes', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Teixeira', 'Vieira']
const CITIES: [string, string][] = [['Chapecó', 'SC'], ['Florianópolis', 'SC'], ['Joinville', 'SC'], ['Curitiba', 'PR'], ['Cascavel', 'PR'], ['Porto Alegre', 'RS'], ['Caxias do Sul', 'RS'], ['São Paulo', 'SP'], ['Campinas', 'SP']]

const SEGMENTS: Segment[] = [
  {
    slug: 'autopecas',
    name: 'Rota Autopeças',
    short: 'Rota Autopeças',
    colors: { primary: '#c2410c', sidebar: '#1c1917' },
    team: ['Roberta Lima', 'Anderson Silva', 'Júlio Pires', 'Sandra Reis'],
    origins: ['WhatsApp', 'Google Ads', 'Balcão', 'Instagram', 'Indicação'],
    lost: ['Preço', 'Não tinha a peça', 'Prazo de entrega', 'Sem retorno'],
    companies: ['Oficina do Zé', 'Auto Center Avenida', 'Paulo Mecânica', 'Frota Sul Transportes', 'Mecânica Boa Viagem', 'Centro Automotivo Norte', ''],
    tags: ['oficina', 'balcão', 'orçamento', 'frota'],
    notes: ['Pediu orçamento de pastilha e disco.', 'Oficina parceira, compra toda semana.', 'Quer parcelar em 3x no cartão.', 'Aguardando confirmar o ano do carro.', 'Veio pelo anúncio do Google.'],
    sale: [120, 4800],
    instagram: 'rotaautopecas',
    talks: [
      ['Carlos Henrique', [[false, 'Bom dia! Tem pastilha de freio dianteira para Onix 2019 1.0?'], [true, 'Bom dia, Carlos! Temos sim, de duas marcas. Quer o valor das duas opções?'], [false, 'Quero sim. E se tiver o disco também.'], [true, 'Mando agora o orçamento do jogo de pastilhas e do par de discos.'], [false, 'Fechado, aguardo 👍']]],
      ['Oficina do Zé', [[false, 'Preciso de 4 filtros de óleo para Gol G5 e 2 para HB20.'], [true, 'Separado! Entregamos hoje à tarde na oficina?'], [false, 'Pode ser, depois das 14h.']]],
      ['Mariana Lopes', [[false, 'Vocês têm amortecedor traseiro para Fiat Argo?'], [true, 'Temos sim. Para qual ano?'], [false, '2021']]],
      ['Auto Center Avenida', [[false, 'Chegou a bateria 60Ah que pedimos?'], [true, 'Chegou sim! Já está separada no balcão.']]],
      ['Ricardo Souza', [[false, 'Qual o prazo do kit de embreagem do Corolla 2018?']]],
      ['Juliana Prado', [[false, 'Obrigada, a peça serviu certinho!'], [true, 'Que ótimo, Juliana! Qualquer coisa estamos aqui.']]],
      ['Paulo Mecânica', [[false, 'Faz condição especial para oficina cadastrada?'], [true, 'Fazemos sim, Paulo. Me passa o CNPJ que eu cadastro agora.'], [false, 'Te mando já']]],
      ['Fernando Alves', [[false, 'Tem lâmpada H4 para farol?']]],
    ],
    posts: [
      ['Revisão antes da viagem', 'Antes de pegar a estrada, confira freios, pneus e óleo. Chame a gente no WhatsApp! 🚗', 1, 'FEED', 'APROVADO'],
      ['Pastilhas em oferta', 'Semana do freio: pastilhas com condição especial. Só até sábado!', 2, 'STORIES', 'APROVADO'],
      ['Hora de trocar o amortecedor?', 'Três sinais de que o amortecedor do seu carro está pedindo troca.', 4, 'REELS', 'EM_APROVACAO'],
      ['Chegou estoque de baterias', 'Baterias de 45 a 100Ah com instalação no balcão.', 7, 'FEED', 'APROVADO'],
      ['Dica: calibragem dos pneus', 'Pneu calibrado economiza combustível e dura mais. Confira a cada 15 dias.', 9, 'FEED', 'RASCUNHO'],
      ['Oficinas parceiras', 'Sua oficina com entrega no mesmo dia. Cadastre o CNPJ!', 12, 'FEED', 'APROVADO'],
      ['Semana do freio', 'Obrigado a todos que passaram na Semana do Freio!', -3, 'FEED', 'PUBLICADO'],
      ['Horário de sábado', 'Agora abrimos aos sábados até as 13h.', -8, 'STORIES', 'PUBLICADO'],
    ],
  },
  {
    slug: 'vitrinemoda',
    name: 'Vitrine Moda',
    short: 'Vitrine Moda',
    colors: { primary: '#be185d', sidebar: '#2a1020' },
    team: ['Carolina Duarte', 'Bianca Rocha', 'Mel Antunes', 'Sofia Ramos'],
    origins: ['Instagram', 'WhatsApp', 'Loja física', 'Site', 'Indicação'],
    lost: ['Preço', 'Não tinha o tamanho', 'Frete', 'Sem retorno'],
    companies: null,
    tags: ['cliente VIP', 'troca', 'lista VIP', 'provador'],
    notes: ['Quer separar para provar na loja.', 'Cliente VIP, compra todo mês.', 'Pediu troca de tamanho.', 'Veio pelo Instagram.', 'Quer parcelar no cartão.'],
    sale: [90, 980],
    instagram: 'vitrinemoda',
    talks: [
      ['Bruna Carvalho', [[false, 'Oi! O vestido midi floral ainda tem no M?'], [true, 'Oi, Bruna! Tem sim, no M e no G. Quer que eu separe para você provar?'], [false, 'Quero! Passo aí amanhã depois das 18h.'], [true, 'Separado no seu nome 😊 Até amanhã!']]],
      ['Letícia Moraes', [[false, 'Vocês enviam pelos Correios?'], [true, 'Enviamos para todo o Brasil. Me passa o CEP que eu calculo o frete.'], [false, '89800-000']]],
      ['Amanda Ribeiro', [[false, 'Comprei uma calça e ficou grande, consigo trocar?'], [true, 'Consegue sim, com a etiqueta. Qual tamanho você quer?']]],
      ['Camila Freitas', [[false, 'Quando chega a coleção de verão?'], [true, 'Chega na sexta! Quer entrar na lista VIP para ver antes?'], [false, 'Quero sim!']]],
      ['Daniela Costa', [[false, 'Tem essa blusa em outras cores?']]],
      ['Rafaela Nunes', [[false, 'Amei o look do Instagram, quanto custa o conjunto?'], [true, 'Que bom que gostou! Te mando as fotos com os valores e os tamanhos disponíveis.']]],
      ['Patrícia Melo', [[false, 'Chegou meu pedido, ficou perfeito! 💕'], [true, 'Que alegria, Patrícia! Manda uma foto usando pra gente postar? 😍']]],
      ['Gabriela Torres', [[false, 'Vocês abrem domingo?']]],
    ],
    posts: [
      ['Nova coleção de verão', 'A coleção de verão chegou! Tecidos leves e cores que são a cara da estação. ☀️', 1, 'FEED', 'APROVADO'],
      ['Look do dia', 'Vestido midi floral + sandália nude: o look perfeito para o fim de semana.', 2, 'STORIES', 'APROVADO'],
      ['3 jeitos de usar a camisa de linho', 'Uma peça, três produções. Qual é a sua favorita?', 4, 'REELS', 'EM_APROVACAO'],
      ['Liquida de inverno', 'Últimas peças de inverno com preço especial. Corre!', 6, 'STORIES', 'APROVADO'],
      ['Bastidores da vitrine', 'Montando a vitrine nova para vocês. 👗', 9, 'REELS', 'RASCUNHO'],
      ['Cliente do mês', 'Obrigada pelo carinho! Marque a gente nas suas fotos.', 12, 'FEED', 'APROVADO'],
      ['Dia das mães', 'Obrigada a todas que escolheram a Vitrine para presentear.', -5, 'FEED', 'PUBLICADO'],
      ['Chegou jeans', 'Jeans novos em todas as numerações.', -10, 'FEED', 'PUBLICADO'],
    ],
  },
  {
    slug: 'smashpadel',
    name: 'Smash Padel Wear',
    short: 'Smash Padel',
    colors: { primary: '#15803d', sidebar: '#0f1f17' },
    team: ['Diego Martins', 'Natália Brum', 'Igor Matos', 'Paula Sartori'],
    origins: ['Instagram', 'WhatsApp', 'Feira', 'Site', 'Indicação'],
    lost: ['Preço', 'Prazo de produção', 'Pedido mínimo', 'Sem retorno'],
    companies: ['Arena Padel Club', 'Loja Ponto do Padel', 'Escola Padel Pro', 'Clube Atlântico', 'Padel Indoor Sul', 'Academia Smash Point'],
    tags: ['uniforme personalizado', 'revenda', 'torneio', 'amostra'],
    notes: ['Uniformes personalizados com o logo do clube.', 'Revenda: reposição mensal.', 'Aguardando a arte do logo.', 'Pedido para torneio, prazo curto.', 'Pediu amostra do tecido.'],
    sale: [1800, 24000],
    instagram: 'smashpadelwear',
    talks: [
      ['Arena Padel Club', [[false, 'Bom dia! Queremos uniformes para a equipe do torneio, 24 camisetas com o nosso logo.'], [true, 'Bom dia! Fazemos sim, em tecido dry-fit. Pode me mandar o logo em alta e a grade de tamanhos?'], [false, 'Mando hoje. Qual o prazo?'], [true, 'Com a arte aprovada, te passo o prazo de produção junto com o orçamento e o modelo.'], [false, 'Perfeito 👌']]],
      ['Loja Ponto do Padel', [[false, 'Quero repor saias e regatas femininas, mesma grade do último pedido.'], [true, 'Combinado! Grade P ao GG, 10 de cada cor?'], [false, 'Isso, e acrescenta 10 bonés.']]],
      ['Marcos Vinícius', [[false, 'Vocês vendem no varejo ou só atacado?'], [true, 'Trabalhamos com atacado e uniformes personalizados. No varejo, nossas peças estão nas lojas parceiras.']]],
      ['Escola Padel Pro', [[false, 'Precisamos de 40 kits para os alunos (camiseta + short).'], [true, 'Ótimo! Personalizado com o nome de cada aluno?'], [false, 'Sim, nome nas costas.']]],
      ['Clube Atlântico', [[false, 'O tecido é respirável? Jogamos muito no calor.']]],
      ['Juliana Padel Team', [[false, 'Recebemos as camisetas, ficaram lindas!'], [true, 'Que bom! Marca a gente nas fotos do torneio 🎾']]],
      ['Roberto Andrade', [[false, 'Qual o pedido mínimo para revenda?'], [true, 'Te mando agora a tabela de revenda com o pedido mínimo por modelo.']]],
      ['Padel Indoor Sul', [[false, 'Conseguem entregar antes do dia 15?']]],
    ],
    posts: [
      ['Nova linha dry-fit', 'Leveza e conforto para jogar no calor. Conheça a nova linha dry-fit. 🎾', 1, 'FEED', 'APROVADO'],
      ['Bastidores da costura', 'Do corte à costura: como nascem os uniformes do seu clube.', 3, 'REELS', 'APROVADO'],
      ['Uniforme do seu clube', 'Camisetas, regatas e shorts com o logo do seu clube. Peça o orçamento!', 5, 'FEED', 'EM_APROVACAO'],
      ['Grade de tamanhos', 'Do PP ao XGG, masculino e feminino.', 6, 'STORIES', 'APROVADO'],
      ['Torneio regional', 'Estaremos no torneio regional com a coleção nova.', 10, 'FEED', 'RASCUNHO'],
      ['Saia plissada', 'Lançamento: saia plissada com short interno.', 13, 'FEED', 'APROVADO'],
      ['Equipe campeã', 'Parabéns à equipe campeã, jogando com Smash Padel Wear!', -4, 'FEED', 'PUBLICADO'],
      ['Coleção outono', 'Manga longa e corta-vento para os jogos de fim de tarde.', -11, 'STORIES', 'PUBLICADO'],
    ],
  },
]

async function create(s: Segment) {
  const plan = await prisma.plan.findFirst({ where: { name: 'Profissional' } })
  if (await prisma.tenant.findUnique({ where: { slug: s.slug } })) return console.log(`${s.slug}: já existe, nada alterado.`)
  const tenant = await prisma.tenant.create({
    data: { slug: s.slug, name: s.name, status: 'ATIVA', planId: plan?.id ?? null, paidUntil: new Date(now + 365 * DAY), extraSystems: ['atendimento', 'whatsapp', 'captura', 'email_marketing', 'postagens', 'relatorios', 'marketing_inteligente'], extraUsers: 20, extraWhatsapp: 5 },
  })
  const t = tenant.id
  await prisma.tenantSetting.create({ data: { tenantId: t, key: 'branding', value: { appName: s.name, shortName: s.short, primaryColor: s.colors.primary, brandColor: s.colors.primary, sidebarColor: s.colors.sidebar } } })
  await prisma.tenantSetting.create({
    data: { tenantId: t, key: 'postagens_contas', value: { accounts: [{ id: 'ig-oficial', network: 'instagram', externalId: '17841400000000001', name: `@${s.instagram}`, group: 'Oficial' }, { id: 'fb-pagina', network: 'facebook', externalId: '100000000000001', name: s.name, group: 'Oficial' }] } },
  })
  const adminRoleId = await createDefaultRoles(prisma, t)
  await prisma.role.updateMany({ where: { tenantId: t }, data: { require2fa: false } })
  const sellerRole = (await prisma.role.findFirst({ where: { tenantId: t, isSystem: false, name: { contains: 'Vend' } } })) ?? (await prisma.role.findFirstOrThrow({ where: { tenantId: t, isSystem: false } }))
  const hash = await hashPassword(PASSWORD)
  const users = []
  for (const [i, n] of s.team.entries()) {
    users.push(await prisma.user.create({ data: { tenantId: t, roleId: i === 0 ? adminRoleId : sellerRole.id, name: n, email: `${n.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@${s.slug}.demo`, passwordHash: hash, trailDone: ['*'] } }))
  }
  const sellers = []
  for (const u of users) sellers.push(await prisma.seller.create({ data: { tenantId: t, name: u.name, email: u.email, userId: u.id } }))
  const origins = []
  for (const n of s.origins) origins.push(await prisma.lookupItem.create({ data: { tenantId: t, type: 'ORIGEM', name: n } }))
  const lost = []
  for (const n of s.lost) lost.push(await prisma.lookupItem.create({ data: { tenantId: t, type: 'MOTIVO_PERDA', name: n } }))

  const leads = []
  // Quem está nas conversas também está na base de leads.
  const all = [...new Set(s.talks.map(([n]) => n)), ...Array.from({ length: 56 }, () => `${pick(FIRST)} ${pick(LAST)}`)]
  for (const [i, name] of all.entries()) {
    const [city, state] = pick(CITIES)
    const created = ago(Math.floor(rnd() * 80))
    leads.push(
      await prisma.lead.create({
        data: {
          tenantId: t, name, email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.')}${i}@exemplo.com.br`, phone: `55499${String(80000000 + Math.floor(rnd() * 9999999))}`,
          company: s.companies ? pick(s.companies) || null : null, city, state, stage: pick(['LEAD', 'LEAD', 'QUALIFICADO', 'QUALIFICADO', 'OPORTUNIDADE', 'CLIENTE'] as const),
          ownerId: pick(sellers).id, originId: pick(origins).id, emailOptIn: rnd() > 0.3, scoreProfile: Math.floor(rnd() * 100), scoreInterest: Math.floor(rnd() * 100), scoreGrade: pick(['A', 'B', 'B', 'C', 'C', 'D']),
          createdAt: created, firstConversionAt: created, lastConversionAt: created, lastActivityAt: ago(Math.floor(rnd() * 10)), tags: rnd() > 0.5 ? [pick(s.tags)] : [],
        },
      }),
    )
  }

  for (let i = 0; i < 48; i++) {
    const l = pick(leads)
    const status = pick(['NEGOCIACAO', 'NEGOCIACAO', 'SIM', 'SIM', 'NAO'] as const)
    const at = ago(Math.floor(rnd() * 60))
    await prisma.serviceRecord.create({
      data: {
        tenantId: t, kind: 'PRE_VENDAS', leadAt: at, name: l.name!, phone: l.phone, email: l.email, sellerId: l.ownerId, leadId: l.id, originId: l.originId, state: l.state, city: l.city,
        saleStatus: status, saleValue: status === 'SIM' ? Math.round(s.sale[0] + rnd() * (s.sale[1] - s.sale[0])) : null, lostReasonId: status === 'NAO' ? pick(lost).id : null,
        notes: pick(s.notes), firstActionAt: new Date(at.getTime() + 600_000 + rnd() * 3_000_000), createdAt: at, createdById: users[0]!.id,
      },
    })
  }

  const number = await prisma.whatsappNumber.create({ data: { tenantId: t, name: 'Comercial', instanceName: `demo-${s.slug}-${randomBytes(3).toString('hex')}`, phone: '554933330000', profileName: s.name, status: 'CONECTADO', connectedAt: ago(30), userIds: users.map((u) => u.id), sellerIds: sellers.map((x) => x.id) } })
  for (const [k, [name, msgs]] of s.talks.entries()) {
    const lead = leads.find((l) => l.name === name) ?? null
    const who = users[k % users.length]!
    const t0 = now - (k * 47 + 20) * 60_000 - msgs.length * 120_000
    const last = msgs[msgs.length - 1]!
    const conv = await prisma.whatsappConversation.create({
      data: {
        tenantId: t, numberId: number.id, jid: `55499${String(91000000 + k)}@s.whatsapp.net`, phone: `55499${String(91000000 + k)}`, name, leadId: lead?.id ?? null,
        assignedUserId: who.id, assignedSellerId: sellers[k % sellers.length]!.id, unread: last[0] ? 0 : 1 + (k % 3), category: 'CLIENTE', status: 'ABERTA',
        lastMessageAt: new Date(t0 + msgs.length * 120_000), lastPreview: last[1], lastFromMe: last[0], lastInboundAt: new Date(t0 + msgs.length * 120_000 - (last[0] ? 120_000 : 0)),
      },
    })
    for (const [j, [fromMe, text]] of msgs.entries()) {
      await prisma.whatsappMessage.create({ data: { tenantId: t, conversationId: conv.id, waId: `DEMO${k}_${j}`, fromMe, type: 'text', text, sentAt: new Date(t0 + j * 120_000), status: fromMe ? 'READ' : null, sentByName: fromMe ? who.name : null, sentById: fromMe ? who.id : null } })
    }
  }

  for (const [title, caption, d, format, status] of s.posts) {
    const when = new Date(now + d * DAY)
    when.setUTCHours(21, 30, 0, 0) // 18h30 em Brasília
    await prisma.socialPost.create({
      data: { tenantId: t, title, caption, networks: ['instagram', 'facebook'], accountIds: ['ig-oficial', 'fb-pagina'], format, scheduledAt: when, status, publicToken: randomBytes(16).toString('hex'), createdByName: s.team[0], publishedAt: status === 'PUBLICADO' ? when : null },
    })
  }
  console.log(`${s.slug}: criada (${users[0]!.email})`)
}

async function main() {
  for (const s of SEGMENTS) await create(s)
  console.log(`Senha de todos os usuários: ${PASSWORD}`)
}

main().finally(() => prisma.$disconnect())
