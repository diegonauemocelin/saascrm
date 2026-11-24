/**
 * Empresa de DEMONSTRAÇÃO para apresentações ao vivo: loja de material de construção (Mãos à Obra Materiais de
 * Construção – Itapema/SC), com dados fictícios em todos os sistemas: atendimento, WhatsApp, leads, e-commerce, marketing
 * (postagens, e-mail, automações, Web Push, fidelidade, anúncios) e fretes (filiais, transportadoras, tabelas,
 * cotações, pedidos, NF-e, CT-e conciliados e divergentes, faturas, coletas, campanhas e poupança de frete).
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
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from '../src/auth/password'
import { type FreightCarrier, type Lead, type Prisma, PrismaClient, type Unit, type User } from '../src/generated/prisma/client'
import { createDefaultRoles } from '../src/plataforma/perfis-padrao'
import { SYSTEM_KEYS } from '../src/plataforma/sistemas'
import { bestCampaign, CAMPAIGNS_KEY, type FreightCampaign } from '../src/fretes/campanhas'
import { type CalcSettings, DEFAULT_COMPONENTS, DEFAULT_SETTINGS } from '../src/fretes/catalogo'
import { reconcile } from '../src/fretes/conciliacao'
import { addBusinessDays, calculate, matchRule, measure, type RuleLike, type Volume, weights } from '../src/fretes/motor'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const PASSWORD = process.env.DEMO_PASSWORD || `Demo-${randomBytes(9).toString('base64url')}`
const SLUG = 'maosaobra'
const NAME = 'Mãos à Obra Materiais de Construção – Itapema'
const SHORT = 'Mãos à Obra Itapema'
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
  const cuf = { SC: '42', PR: '41', RS: '43', SP: '35' }[uf] ?? '42'
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

// ---------- Cadastros base ----------

const COLORS = { primary: '#ea580c', sidebar: '#27272a' }
const TEAM: [name: string, role: 'admin' | 'Vendedor' | 'Pré-Vendas' | 'Expedição', unit: number][] = [
  ['Marcos Bittencourt', 'admin', 0],
  ['Juliana Sartori', 'Vendedor', 0],
  ['Ricardo Lemos', 'Vendedor', 0],
  ['Tatiane Moreira', 'Pré-Vendas', 0],
  ['Fábio Zanella', 'Vendedor', 1],
  ['Everton Kunz', 'Expedição', 0],
]
const UNITS = [
  { name: 'Matriz Itapema', city: 'Itapema', state: 'SC', zip: '88220000', address: 'Rua das Obras, 1200 - Morretes', cnpj: cnpj('481523670001'), hq: true },
  { name: 'Filial Balneário Camboriú', city: 'Balneário Camboriú', state: 'SC', zip: '88330000', address: 'Av. dos Construtores, 455 - Centro', cnpj: cnpj('481523670002'), hq: false },
]
const ORIGINS = ['WhatsApp', 'Google Ads', 'Instagram', 'Balcão', 'Indicação', 'Site']
const LOST = ['Preço', 'Prazo de entrega', 'Sem estoque', 'Comprou no concorrente', 'Sem retorno', 'Obra adiada']
const CUSTOMER_TYPES = ['Pedreiro', 'Construtora', 'Arquiteto', 'Consumidor final', 'Empreiteiro']
const BRANDS = ['Votorantim', 'Quartzolit', 'Suvinil', 'Tigre', 'Portobello', 'Gerdau', 'Eternit', 'Deca']
const PRODUCT_TYPES = ['Cimento e argamassa', 'Tijolos e blocos', 'Telhas', 'Tintas', 'Pisos e revestimentos', 'Hidráulica', 'Ferragens e aço', 'Louças e metais']

/** Cidades atendidas, com um CEP de cada uma (para as cotações de frete). */
const CITIES: [city: string, uf: string, zip: string][] = [
  ['Itapema', 'SC', '88220000'], ['Balneário Camboriú', 'SC', '88330000'], ['Porto Belo', 'SC', '88210000'], ['Bombinhas', 'SC', '88215000'], ['Tijucas', 'SC', '88200000'], ['Camboriú', 'SC', '88340000'],
  ['Itajaí', 'SC', '88301000'], ['Navegantes', 'SC', '88370000'], ['Brusque', 'SC', '88350000'], ['Blumenau', 'SC', '89010000'],
  ['Florianópolis', 'SC', '88010000'], ['Joinville', 'SC', '89201000'], ['Curitiba', 'PR', '80010000'], ['Porto Alegre', 'RS', '90010000'],
]
/** Clientes: a maior parte de Itapema e do Litoral Norte/Vale do Itajaí; alguns de Florianópolis, Joinville, Curitiba e Porto Alegre. */
const LOCAL_CITIES = CITIES.slice(0, 10)
/** Destinos das cotações de frete (origem em Itapema/SC): SC, PR, RS e SP. */
const DESTS: [city: string, uf: string, zip: string][] = [
  ...CITIES.slice(5),
  ['Chapecó', 'SC', '89802000'], ['Criciúma', 'SC', '88801000'], ['Lages', 'SC', '88501000'],
  ['Londrina', 'PR', '86010000'], ['Maringá', 'PR', '87013000'], ['Cascavel', 'PR', '85802000'],
  ['Caxias do Sul', 'RS', '95020000'], ['Passo Fundo', 'RS', '99020000'],
  ['São Paulo', 'SP', '01310000'], ['Campinas', 'SP', '13010000'], ['Sorocaba', 'SP', '18010000'],
]

const FIRST = ['Lucas', 'Juliana', 'Rafael', 'Fernanda', 'Gustavo', 'Patrícia', 'Thiago', 'Camila', 'Rodrigo', 'Aline', 'Marcelo', 'Beatriz', 'Felipe', 'Larissa', 'André', 'Vanessa', 'Renata', 'Eduardo', 'Simone', 'Jair', 'Leandro', 'Priscila', 'Valdir', 'Sérgio', 'Adriano', 'Gilmar']
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Ferreira', 'Gomes', 'Machado', 'Martins', 'Nunes', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Teixeira', 'Vieira', 'Zanatta', 'Schmitz', 'Bortolini', 'Kunz']
const BUILDERS = ['Construtora Horizonte', 'Alicerce Engenharia', 'Construtora Vale Verde', 'Pilar Obras e Reformas', 'Bloco Forte Construções', 'Residencial Araucária Incorporadora', 'Moradas do Sul Engenharia', 'Construtora Três Fronteiras']
const ARCHITECTS = ['Studio Arq Lumen', 'Atelier Concreto Arquitetura', 'Traço Fino Arquitetura', 'Casa & Forma Interiores']

type Kind = 'pedreiro' | 'construtora' | 'arquiteto' | 'consumidor'
const NOTES: Record<Kind, string[]> = {
  pedreiro: ['Pediu orçamento de cimento e argamassa para reboco.', 'Compra toda semana, quer condição de pedreiro parceiro.', 'Precisa de entrega na obra amanhã cedo.', 'Quer saber o rendimento da argamassa AC-III.'],
  construtora: ['Orçamento de obra: 4 casas geminadas, fundação e alvenaria.', 'Pediu tabela de aço CA-50 para a laje.', 'Compra faturada em 28 dias, aguardando cadastro.', 'Cronograma da obra: entrega fracionada por etapa.'],
  arquiteto: ['Especificou porcelanato 90x90 para projeto residencial.', 'Quer amostras de revestimento para o cliente aprovar.', 'Projeto de reforma de cozinha e banheiros.', 'Pediu catálogo de louças e metais.'],
  consumidor: ['Reforma do banheiro: piso, revestimento e louças.', 'Quer pintar a casa toda, pediu cálculo de tinta.', 'Comprou pelo site e quer acompanhar a entrega.', 'Pediu orçamento de telhas para ampliar a garagem.'],
}

type Talk = [name: string, msgs: [fromMe: boolean, text: string][], labels: string[]]
const TALKS: Talk[] = [
  ['Jair Bortolini', [[false, 'Bom dia! Tem cimento CP-II 50kg? Preciso de 40 sacos.'], [true, 'Bom dia, Jair! Temos sim, Votorantim e Itambé. Entrega na obra ou retira no balcão?'], [false, 'Entrega na obra, é no bairro Morretes.'], [true, 'Perfeito. Já te mando o orçamento com o frete da entrega. 👷'], [false, 'Fechado, aguardo']], ['Orçamento', 'Entrega na obra']],
  ['Construtora Horizonte', [[false, 'Precisamos do orçamento de obra completo: 4 casas de 70m², fundação até cobertura.'], [true, 'Olá! Com prazer. Pode mandar o projeto e a lista de materiais? Fazemos o orçamento por etapa.'], [false, 'Vou mandar o PDF do projeto agora.'], [false, 'Segue o memorial descritivo.']], ['Orçamento de obra', 'Construtora']],
  ['Fernanda Martins', [[false, 'Oi! Vocês têm porcelanato 90x90 acetinado?'], [true, 'Oi, Fernanda! Temos da Portobello em 3 tons. Te mando as fotos?'], [false, 'Manda sim! E quanto fica o m²?']], ['Orçamento']],
  ['Studio Arq Lumen', [[false, 'Boa tarde! Consegue separar amostras de revestimento para eu levar ao cliente?'], [true, 'Boa tarde! Separamos sim. Quais linhas você quer?'], [false, 'Linha mármore e a cimentícia, 3 amostras de cada.'], [true, 'Separado no seu nome, pode retirar a partir das 14h. 😉']], ['Arquiteto']],
  ['Valdir Schmitz', [[false, 'Quanto rende uma lata de 18L da Suvinil fosco?']], ['Orçamento']],
  ['Alicerce Engenharia', [[false, 'O aço da laje chega quando? Precisamos até quinta.'], [true, 'Saiu hoje de manhã pela TransSul, previsão de entrega na quarta.'], [false, 'Ótimo, obrigado!']], ['Entrega na obra', 'Construtora']],
  ['Camila Ribeiro', [[false, 'Comprei pelo site o kit de tinta, consigo trocar a cor?'], [true, 'Consegue sim, Camila, antes de abrir a lata. Qual cor você quer?']], ['Pós-venda']],
  ['Sérgio Pereira', [[false, 'Tem telha de fibrocimento 2,44m? Preciso de 30.'], [true, 'Temos Eternit 6mm. Para entrega em Porto Belo?'], [false, 'Isso, e mais 2 cumeeiras.']], ['Orçamento', 'Entrega na obra']],
  ['Rodrigo Gomes', [[false, 'Bom dia, vocês vendem tijolo 6 furos no milheiro?']], []],
  ['Pilar Obras e Reformas', [[false, 'Chegou tudo certo na obra, obrigado pela agilidade!'], [true, 'Que bom! Qualquer coisa estamos aqui. 🧱']], ['Construtora']],
  ['Adriano Cardoso', [[false, 'Argamassa AC-III serve para porcelanato grande na área externa?']], ['Orçamento']],
]

const POSTS: [title: string, caption: string, days: number, format: 'FEED' | 'STORIES' | 'REELS', status: 'RASCUNHO' | 'EM_APROVACAO' | 'APROVADO' | 'PUBLICADO'][] = [
  ['Semana da Construção', 'Cimento, argamassa e tijolos com condição especial até sábado. Entrega na obra! 🏗️', 1, 'FEED', 'APROVADO'],
  ['Antes e depois: banheiro', 'Reforma completa com porcelanato e louças da Mãos à Obra. Arraste para ver o resultado.', 2, 'REELS', 'APROVADO'],
  ['Quanto de tinta eu preciso?', 'Calcule: área das paredes ÷ rendimento por demão × número de demãos. Chame no WhatsApp que a gente calcula!', 3, 'STORIES', 'EM_APROVACAO'],
  ['Pedreiro parceiro', 'Cadastre-se como pedreiro parceiro e tenha condições especiais toda semana.', 5, 'FEED', 'APROVADO'],
  ['Porcelanato 90x90', 'Chegou a nova linha de porcelanato 90x90 acetinado. Venha ver no showroom.', 7, 'FEED', 'RASCUNHO'],
  ['Dica de obra: cura do concreto', 'Molhe a laje por 7 dias para o concreto curar sem trincas.', 9, 'REELS', 'RASCUNHO'],
  ['Entrega na obra', 'Caminhão próprio em Itapema e no Litoral Norte; transportadoras parceiras para SC, PR, RS e SP. 🚚', -2, 'FEED', 'PUBLICADO'],
  ['Feirão de tintas', 'Obrigado a todos que passaram no feirão de tintas!', -6, 'STORIES', 'PUBLICADO'],
  ['Nova loja em Balneário Camboriú', 'Agora também em Balneário Camboriú! Av. dos Construtores, 455.', -12, 'FEED', 'PUBLICADO'],
]

/** Catálogo (loja virtual): SKU, nome, marca, preço, peso (kg), medidas (cm). */
const PRODUCTS: [sku: string, name: string, brand: string, price: number, kg: number, cm: [number, number, number]][] = [
  ['CIM-CP2-50', 'Cimento CP-II 50kg', 'Votorantim', 38.9, 50, [60, 40, 12]],
  ['CIM-CP5-40', 'Cimento CP-V ARI 40kg', 'Votorantim', 42.5, 40, [55, 38, 12]],
  ['ARG-AC3-20', 'Argamassa AC-III 20kg', 'Quartzolit', 34.9, 20, [40, 30, 10]],
  ['ARG-AC2-20', 'Argamassa AC-II 20kg', 'Quartzolit', 24.9, 20, [40, 30, 10]],
  ['REJ-FLEX-1', 'Rejunte flexível 1kg cinza', 'Quartzolit', 14.9, 1, [15, 10, 5]],
  ['TIN-FOS-18', 'Tinta acrílica fosca 18L branco neve', 'Suvinil', 389.9, 25, [30, 30, 40]],
  ['TIN-SEM-36', 'Tinta acrílica semibrilho 3,6L', 'Suvinil', 129.9, 5, [17, 17, 20]],
  ['TUB-PVC-100', 'Tubo PVC esgoto 100mm 6m', 'Tigre', 89.9, 9, [600, 11, 11]],
  ['TUB-SOL-25', 'Tubo PVC soldável 25mm 6m', 'Tigre', 29.9, 2, [600, 3, 3]],
  ['POR-90-ACT', 'Porcelanato 90x90 acetinado (caixa 1,62m²)', 'Portobello', 249.9, 38, [92, 92, 5]],
  ['POR-60-MAR', 'Porcelanato 60x60 marmorizado (caixa 2,16m²)', 'Portobello', 159.9, 32, [62, 62, 8]],
  ['ACO-CA50-10', 'Vergalhão CA-50 10mm barra 12m', 'Gerdau', 54.9, 7.4, [1200, 2, 2]],
  ['ACO-CA60-5', 'Vergalhão CA-60 5mm barra 12m', 'Gerdau', 17.9, 1.9, [1200, 1, 1]],
  ['TEL-FIB-244', 'Telha fibrocimento 2,44x1,10m 6mm', 'Eternit', 79.9, 18, [244, 110, 3]],
  ['BAC-CX-ACP', 'Bacia com caixa acoplada branca', 'Deca', 699.9, 32, [70, 40, 80]],
  ['MIS-COZ-01', 'Misturador monocomando para cozinha', 'Deca', 459.9, 2.5, [35, 25, 12]],
]

/** Cargas típicas para as cotações: descrição, volumes (kg por unidade, medidas em cm) e valor da nota. */
const CARGOS: [string, Volume[], number][] = [
  ['Louças e metais (4 bacias e 6 misturadores)', [{ quantity: 4, weight: 32, length: 70, width: 40, height: 80 }, { quantity: 6, weight: 2.5, length: 35, width: 25, height: 12 }], 5559],
  ['10 argamassas AC-III e 6 caixas de porcelanato 60x60', [{ quantity: 10, weight: 20, length: 40, width: 30, height: 10 }, { quantity: 6, weight: 32, length: 62, width: 62, height: 8 }], 1308.4],
  ['60 barras de vergalhão CA-50 10mm', [{ quantity: 60, weight: 7.4, length: 1200, width: 2, height: 2 }], 3294],
  ['8 latas de tinta 18L', [{ quantity: 8, weight: 25, length: 30, width: 30, height: 40 }], 3119.2],
  ['12 caixas de porcelanato 90x90', [{ quantity: 12, weight: 38, length: 92, width: 92, height: 5 }], 2998.8],
  ['30 telhas de fibrocimento', [{ quantity: 30, weight: 18, length: 244, width: 110, height: 3 }], 2397],
  ['Kit banheiro (bacia, misturador e argamassa)', [{ quantity: 1, weight: 32, length: 70, width: 40, height: 80 }, { quantity: 1, weight: 2.5, length: 35, width: 25, height: 12 }, { quantity: 4, weight: 20, length: 40, width: 30, height: 10 }], 1299.3],
  ['10 tubos PVC esgoto 100mm', [{ quantity: 10, weight: 9, length: 600, width: 11, height: 11 }], 899],
  ['5 caixas de rejunte e 6 argamassas', [{ quantity: 5, weight: 12, length: 30, width: 20, height: 15 }, { quantity: 6, weight: 20, length: 40, width: 30, height: 10 }], 433.8],
]

/** Transportadoras fictícias: preço base por UF de destino (faixa até 10 kg), fator das faixas, prazos e taxas. */
const CARRIERS = [
  { name: 'TransSul Cargas', legal: 'TransSul Cargas e Encomendas Ltda', base: '519874320001', city: 'Itajaí', uf: 'SC', zip: '88311000', price: { SC: 42, PR: 58, RS: 61, SP: 66 }, days: { SC: 2, PR: 3, RS: 4, SP: 4 }, adv: 0.3, gris: 0.15, toll: 4.9, pickupMode: 'COLETA', schedule: false },
  { name: 'Rápido Oeste', legal: 'Rápido Oeste Transportes Rodoviários Ltda', base: '627301450001', city: 'Cascavel', uf: 'PR', zip: '85816000', price: { SC: 55, PR: 39, RS: 66, SP: 70 }, days: { SC: 3, PR: 2, RS: 5, SP: 5 }, adv: 0.25, gris: 0.2, toll: 5.5, pickupMode: 'COLETA', schedule: false },
  { name: 'Expresso Serra', legal: 'Expresso Serra Gaúcha Logística Ltda', base: '734512980001', city: 'Caxias do Sul', uf: 'RS', zip: '95032000', price: { SC: 52, PR: 63, RS: 37, SP: 74 }, days: { SC: 3, PR: 4, RS: 2, SP: 5 }, adv: 0.35, gris: 0.12, toll: 6.2, pickupMode: 'COLETA', schedule: false },
  { name: 'Rodo Litoral', legal: 'Rodo Litoral Transportes Ltda', base: '815236740001', city: 'Navegantes', uf: 'SC', zip: '88370000', price: { SC: 45, PR: 57, RS: 64, SP: 62 }, days: { SC: 2, PR: 3, RS: 5, SP: 3 }, adv: 0.28, gris: 0.18, toll: 5.1, pickupMode: 'DESPACHO', schedule: false },
  { name: 'Fluxo Express', legal: 'Fluxo Express Entregas Rápidas Ltda', base: '908172630001', city: 'Curitiba', uf: 'PR', zip: '81200000', price: { SC: 49, PR: 44 } as Record<string, number>, days: { SC: 2, PR: 1 } as Record<string, number>, adv: 0.4, gris: 0.22, toll: 4.5, pickupMode: 'COLETA', schedule: true },
] as const

/** Faixas de peso (kg) e o fator sobre o preço base. Acima de 200 kg: excedente por kg. */
const BANDS: [min: number, max: number, factor: number][] = [
  [0, 10, 1],
  [10, 30, 1.45],
  [30, 50, 1.9],
  [50, 100, 2.9],
  [100, 200, 4.6],
]

const ORDER_STATUS: Record<'pago' | 'pendente' | 'cancelado', [number, string][]> = { pago: [[4, 'Pagamento aprovado'], [6, 'Nota fiscal emitida'], [8, 'Entregue']], pendente: [[1, 'Aguardando pagamento']], cancelado: [[2, 'Cancelado']] }

async function main() {
  if (process.env.DEMO !== 'sim') throw new Error('Confirme com DEMO=sim (cria uma empresa fictícia neste banco).')
  if (await prisma.tenant.findUnique({ where: { slug: SLUG } })) {
    console.log(`${SLUG}: já existe, nada alterado.`)
    return
  }
  const counts: Record<string, number> = {}
  const add = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

  // ---------- Empresa, marca e perfis ----------
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: NAME, isDemo: true, notes: 'Empresa fictícia para apresentação a clientes (loja de material de construção).', status: 'ATIVA', planId: null, paidUntil: new Date(now + 365 * DAY), extraSystems: [...SYSTEM_KEYS], extraUsers: 20, extraWhatsapp: 5 },
  })
  const t = tenant.id
  const setting = (key: string, value: unknown) => prisma.tenantSetting.create({ data: { tenantId: t, key, value: json(value) } })
  await setting('branding', { appName: NAME, shortName: SHORT, primaryColor: COLORS.primary, brandColor: COLORS.primary, sidebarColor: COLORS.sidebar })
  await setting('postagens_contas', { accounts: [{ id: 'ig-oficial', network: 'instagram', externalId: '17841400000000031', name: '@maosaobramateriais', group: 'Oficial' }, { id: 'fb-pagina', network: 'facebook', externalId: '100000000000031', name: NAME, group: 'Oficial' }] })
  const adminRoleId = await createDefaultRoles(prisma, t)
  const WORK = { canView: true, canCreate: true, canEdit: true, canExport: true }
  const expedicao = await prisma.role.create({
    data: {
      tenantId: t,
      name: 'Expedição',
      description: 'Fretes: cotação, pedidos, coletas, CT-e e conferência.',
      permissions: { create: [{ module: 'dashboard', canView: true }, { module: 'chat', ...WORK }, ...['fretes_painel', 'fretes_coletas', 'fretes_cotacao', 'fretes_pedidos', 'fretes_cte', 'fretes_transportadoras'].map((module) => ({ module, ...WORK })), { module: 'fretes_tabelas', canView: true }] },
    },
  })
  await prisma.role.updateMany({ where: { tenantId: t }, data: { require2fa: false } })
  const roleByName = new Map((await prisma.role.findMany({ where: { tenantId: t } })).map((r) => [r.name, r.id]))

  const units: Unit[] = []
  for (const u of UNITS) units.push(await prisma.unit.create({ data: { tenantId: t, name: u.name, city: u.city, state: u.state, isHeadquarters: u.hq, cnpj: u.cnpj, legalName: 'Mãos à Obra Comércio de Materiais de Construção Ltda', zip: u.zip, address: u.address } }))
  add('filiais', units.length)

  const hash = await hashPassword(PASSWORD)
  const users: User[] = []
  for (const [name, role, unit] of TEAM) {
    const roleId = role === 'admin' ? adminRoleId : role === 'Expedição' ? expedicao.id : roleByName.get(role)!
    users.push(await prisma.user.create({ data: { tenantId: t, roleId, unitId: units[unit]!.id, name, email: `${slugify(name.split(' ')[0]!)}@${SLUG}.demo`, passwordHash: hash, trailDone: ['*'] } }))
  }
  add('usuarios', users.length)
  const admin = users[0]!
  const sellers = []
  for (const [i, u] of users.entries()) if (TEAM[i]![1] !== 'Expedição') sellers.push(await prisma.seller.create({ data: { tenantId: t, name: u.name, email: u.email, userId: u.id, unitId: u.unitId, gender: ['Juliana Sartori', 'Tatiane Moreira'].includes(u.name) ? 'F' : 'M' } }))
  add('vendedores', sellers.length)
  const lookups = async (type: 'ORIGEM' | 'MOTIVO_PERDA' | 'TIPO_CLIENTE' | 'MARCA' | 'TIPO_PECA', names: string[]) => Promise.all(names.map((name) => prisma.lookupItem.create({ data: { tenantId: t, type, name } })))
  const origins = await lookups('ORIGEM', ORIGINS)
  const lost = await lookups('MOTIVO_PERDA', LOST)
  const customerTypes = await lookups('TIPO_CLIENTE', CUSTOMER_TYPES)
  const brands = await lookups('MARCA', BRANDS)
  const productTypes = await lookups('TIPO_PECA', PRODUCT_TYPES)
  add('listas (origens, motivos, tipos, marcas)', origins.length + lost.length + customerTypes.length + brands.length + productTypes.length)
  const origin = (n: string) => origins.find((o) => o.name === n)!

  // ---------- Leads ----------
  const talkKind = (n: string): Kind => (BUILDERS.includes(n) || n.includes('Engenharia') || n.includes('Obras') ? 'construtora' : ARCHITECTS.includes(n) ? 'arquiteto' : ['Jair Bortolini', 'Valdir Schmitz', 'Sérgio Pereira', 'Adriano Cardoso'].includes(n) ? 'pedreiro' : 'consumidor')
  const people: [string, Kind][] = TALKS.map(([n]) => [n, talkKind(n)])
  const used = new Set(people.map(([n]) => n))
  for (const b of [...BUILDERS, ...ARCHITECTS]) if (!used.has(b)) (people.push([b, BUILDERS.includes(b) ? 'construtora' : 'arquiteto']), used.add(b))
  while (people.length < 80) {
    const n = `${pick(FIRST)} ${pick(LAST)}`
    if (used.has(n)) continue
    used.add(n)
    people.push([n, rnd() < 0.35 ? 'pedreiro' : 'consumidor'])
  }
  const TAGS: Record<Kind, string[]> = { pedreiro: ['pedreiro', 'pedreiro parceiro'], construtora: ['construtora', 'orçamento de obra'], arquiteto: ['arquiteto', 'especificador'], consumidor: ['reforma', 'consumidor final'] }
  const TYPE_OF: Record<Kind, string> = { pedreiro: 'Pedreiro', construtora: 'Construtora', arquiteto: 'Arquiteto', consumidor: 'Consumidor final' }
  const leads: (Lead & { kind: Kind })[] = []
  for (const [i, [name, kind]] of people.entries()) {
    const [city, state] = i < 25 ? pick(LOCAL_CITIES.slice(0, 3)) : rnd() < 0.8 ? pick(LOCAL_CITIES) : pick(CITIES.slice(10))
    const created = ago(between(1, 88))
    const company = kind === 'construtora' || kind === 'arquiteto' ? name : null
    const unit = ['Balneário Camboriú', 'Camboriú', 'Itajaí', 'Navegantes'].includes(city) ? units[1]! : units[0]!
    const owner = sellers.find((s) => s.unitId === unit.id && rnd() < 0.6) ?? pick(sellers)
    const lead = await prisma.lead.create({
      data: {
        tenantId: t, name, company, jobTitle: kind === 'construtora' ? pick(['Engenheiro de obras', 'Compras', 'Mestre de obras']) : kind === 'arquiteto' ? 'Arquiteto(a)' : null,
        email: `${slugify(name)}${i}@exemplo.com.br`, phone: `55479${String(81000000 + i * 7919)}`, city, state, unitId: unit.id,
        stage: pick(kind === 'construtora' ? (['QUALIFICADO', 'OPORTUNIDADE', 'CLIENTE', 'CLIENTE'] as const) : (['LEAD', 'LEAD', 'QUALIFICADO', 'OPORTUNIDADE', 'CLIENTE'] as const)),
        ownerId: owner.id, originId: pick(origins).id, emailOptIn: rnd() > 0.3, scoreProfile: between(10, 100), scoreInterest: between(0, 100), scoreGrade: pick(['A', 'B', 'B', 'C', 'C', 'D']), scoreUpdatedAt: ago(1),
        createdAt: created, firstConversionAt: created, lastConversionAt: created, lastActivityAt: ago(between(0, 12)), tags: rnd() > 0.3 ? [pick(TAGS[kind])] : [],
        customerCode: kind === 'construtora' || rnd() > 0.6 ? String(10_000 + i * 37) : null,
      },
    })
    leads.push({ ...lead, kind })
  }
  add('leads', leads.length)
  const leadByName = (n: string) => leads.find((l) => l.name === n) ?? null

  // ---------- Pré-vendas e pós-vendas ----------
  const SALE: Record<Kind, [number, number]> = { pedreiro: [180, 3800], construtora: [4500, 25000], arquiteto: [1200, 12000], consumidor: [80, 2800] }
  const pres = []
  for (let i = 0; i < 64; i++) {
    const l = pick(leads)
    const status = pick(['NEGOCIACAO', 'NEGOCIACAO', 'SIM', 'SIM', 'SIM', 'NAO'] as const)
    const at = ago(between(0, 75))
    const seller = sellers.find((s) => s.id === l.ownerId)!
    const rec = await prisma.serviceRecord.create({
      data: {
        tenantId: t, kind: 'PRE_VENDAS', leadAt: at, name: l.name!, phone: l.phone, email: l.email, sellerId: seller.id, unitId: seller.unitId, leadId: l.id, originId: l.originId, state: l.state, city: l.city,
        customerTypeId: customerTypes.find((c) => c.name === TYPE_OF[l.kind])!.id, customerCode: l.customerCode, brandIds: [pick(brands).id, ...(rnd() > 0.5 ? [pick(brands).id] : [])].filter((x, k, a) => a.indexOf(x) === k), partTypeIds: [pick(productTypes).id],
        forwarded: true, forwardedAt: new Date(at.getTime() + 300_000), saleStatus: status, saleValue: status === 'SIM' ? between(SALE[l.kind][0], SALE[l.kind][1]) : null, lostReasonId: status === 'NAO' ? pick(lost).id : null,
        resultAt: status === 'NEGOCIACAO' ? null : new Date(at.getTime() + between(1, 5) * DAY), invoiceNumber: status === 'SIM' ? String(52_000 + i) : null, callDueAt: status === 'NEGOCIACAO' ? new Date(at.getTime() + DAY) : null,
        notes: pick(NOTES[l.kind]), firstActionAt: new Date(at.getTime() + 600_000 + rnd() * 3_000_000), createdAt: at, createdById: users[3]!.id,
      },
    })
    pres.push(rec)
  }
  add('pré-vendas', pres.length)
  const FOLLOW = ['PENDENTE', 'CONTATADO', 'ANALISANDO', 'RESOLVIDO', 'RESOLVIDO', 'RESOLVIDO'] as const
  const FOLLOW_NOTES = ['Cliente recebeu tudo certo na obra.', 'Pediu nota fiscal com o CNPJ da construtora.', 'Uma telha chegou trincada: troca agendada.', 'Elogiou o atendimento do vendedor.', 'Quer orçamento da próxima etapa da obra.']
  let posts = 0
  for (const p of pres.filter((r) => r.saleStatus === 'SIM')) {
    const at = new Date((p.resultAt ?? p.leadAt).getTime() + 2 * DAY)
    const follow = at.getTime() > now - 3 * DAY ? 'PENDENTE' : pick(FOLLOW)
    await prisma.serviceRecord.create({
      data: {
        tenantId: t, kind: 'POS_VENDAS', leadAt: at, name: p.name, phone: p.phone, email: p.email, sellerId: p.sellerId, unitId: p.unitId, leadId: p.leadId, originId: p.originId, customerTypeId: p.customerTypeId, state: p.state, city: p.city,
        parentId: p.id, saleStatus: 'SIM', saleValue: p.saleValue, invoiceNumber: p.invoiceNumber, followStatus: follow, followNote: follow === 'PENDENTE' ? null : pick(FOLLOW_NOTES), dueAt: new Date(at.getTime() + DAY),
        firstActionAt: follow === 'PENDENTE' ? null : new Date(at.getTime() + between(1, 20) * 3_600_000), createdAt: at, createdById: admin.id,
      },
    })
    posts++
  }
  add('pós-vendas', posts)
  for (const p of pres.filter((r) => r.saleStatus === 'SIM' && r.leadId)) await prisma.lead.update({ where: { id: p.leadId! }, data: { lastSaleAt: p.resultAt, lastSaleValue: p.saleValue } })

  // ---------- WhatsApp ----------
  const number = await prisma.whatsappNumber.create({ data: { tenantId: t, name: 'Comercial', instanceName: `demo-${SLUG}-${randomBytes(3).toString('hex')}`, phone: '554733330800', profileName: NAME, status: 'CONECTADO', connectedAt: ago(40), userIds: users.map((u) => u.id), sellerIds: sellers.map((x) => x.id) } })
  const LABELS: [string, string][] = [['Orçamento', 'laranja'], ['Orçamento de obra', 'vermelho'], ['Entrega na obra', 'azul'], ['Construtora', 'roxo'], ['Arquiteto', 'rosa'], ['Pós-venda', 'verde']]
  const labels = new Map<string, string>()
  for (const [name, color] of LABELS) labels.set(name, (await prisma.whatsappLabel.create({ data: { tenantId: t, name, color } })).id)
  add('etiquetas do chat', labels.size)
  const QUICK: [string, string][] = [
    ['Orçamento recebido', 'Recebemos o seu pedido de orçamento! Em instantes um vendedor te chama com os valores e o prazo de entrega. 🧱'],
    ['Entrega na obra', 'Entregamos na obra em Itapema e no Litoral Norte com caminhão próprio. Para outras cidades, cotamos com as transportadoras parceiras.'],
    ['Horário', 'Atendemos de segunda a sexta, das 7h30 às 18h, e aos sábados das 8h às 12h.'],
  ]
  for (const [title, text] of QUICK) await prisma.whatsappQuickReply.create({ data: { tenantId: t, title, text } })
  add('respostas rápidas', QUICK.length)
  for (const [k, [name, msgs, tags]] of TALKS.entries()) {
    const lead = leadByName(name)
    const seller = sellers.find((s) => s.id === lead?.ownerId) ?? sellers[k % sellers.length]!
    const who = users.find((u) => u.id === seller.userId)!
    const t0 = now - (k * 53 + 15) * 60_000 - msgs.length * 120_000
    const last = msgs[msgs.length - 1]!
    const conv = await prisma.whatsappConversation.create({
      data: {
        tenantId: t, numberId: number.id, jid: `${lead?.phone ?? `55479${91000000 + k}`}@s.whatsapp.net`, phone: lead?.phone ?? `55479${91000000 + k}`, name, leadId: lead?.id ?? null,
        assignedUserId: who.id, assignedSellerId: seller.id, unread: last[0] ? 0 : 1 + (k % 3), category: 'CLIENTE', status: 'ABERTA',
        lastMessageAt: new Date(t0 + msgs.length * 120_000), lastPreview: last[1], lastFromMe: last[0], lastInboundAt: new Date(t0 + msgs.length * 120_000 - (last[0] ? 120_000 : 0)),
      },
    })
    for (const [j, [fromMe, text]] of msgs.entries()) {
      await prisma.whatsappMessage.create({ data: { tenantId: t, conversationId: conv.id, waId: `DEMOCF${k}_${j}`, fromMe, type: 'text', text, sentAt: new Date(t0 + j * 120_000), status: fromMe ? 'READ' : null, sentByName: fromMe ? who.name : null, sentById: fromMe ? who.id : null } })
      add('mensagens do WhatsApp')
    }
    for (const l of tags) await prisma.whatsappConversationLabel.create({ data: { conversationId: conv.id, labelId: labels.get(l)! } })
    add('conversas do WhatsApp')
  }

  // ---------- Postagens ----------
  for (const [title, caption, d, format, status] of POSTS) {
    const when = new Date(now + d * DAY)
    when.setUTCHours(21, 30, 0, 0)
    await prisma.socialPost.create({ data: { tenantId: t, title, caption, networks: ['instagram', 'facebook'], accountIds: ['ig-oficial', 'fb-pagina'], format, scheduledAt: when, status, publicToken: randomBytes(16).toString('hex'), createdByName: TEAM[0]![0], publishedAt: status === 'PUBLICADO' ? when : null, approvedByName: ['APROVADO', 'PUBLICADO'].includes(status) ? TEAM[0]![0] : null, approvedAt: ['APROVADO', 'PUBLICADO'].includes(status) ? ago(Math.max(0, -d) + 1) : null } })
  }
  add('postagens', POSTS.length)

  // ---------- E-commerce: catálogo, pedidos e carrinhos ----------
  for (const [sku, name, brand, price, kg, [l, w, h]] of PRODUCTS) {
    await prisma.storeProduct.create({ data: { tenantId: t, externalId: sku, code: sku, name, brand, price, priceFrom: rnd() > 0.6 ? r2(price * 1.15) : null, stock: between(8, 400), url: `https://loja.maosaobra.demo/${slugify(name).replace(/\./g, '-')}`, path: `/${slugify(name).replace(/\./g, '-')}`, weightKg: kg, lengthCm: l, widthCm: w, heightCm: h, measuresAt: ago(3), syncedAt: ago(0) } })
  }
  add('produtos do catálogo', PRODUCTS.length)
  const buyers = leads.filter((l) => l.kind !== 'construtora')
  const orders = []
  for (let i = 0; i < 130; i++) {
    const lead = pick(buyers)
    const group: keyof typeof ORDER_STATUS = rnd() < 0.86 ? 'pago' : rnd() < 0.55 ? 'pendente' : 'cancelado'
    const [statusCode, statusName] = pick(ORDER_STATUS[group])
    const lines = Array.from({ length: between(1, 3) }, () => pick(PRODUCTS))
    const items = [...new Map(lines.map((p) => [p[0], p])).values()].map(([sku, name, brand, price]) => {
      const quantity = price > 300 ? between(1, 3) : price > 60 ? between(1, 6) : between(2, 30)
      return { sku, name, brand, quantity, total: r2(price * quantity) }
    })
    const orderedAt = ago(between(1, 90))
    const order = await prisma.ecommerceOrder.create({
      data: {
        tenantId: t, externalId: `CF${100_000 + i}`, code: `${2_600_000 + i * 13}`, leadId: lead.id, customerId: `cli-${lead.id.slice(0, 8)}`, orderedAt, total: r2(items.reduce((s, x) => s + x.total, 0)), statusCode, statusName, statusGroup: group,
        payment: pick(['Pix', 'Pix', 'Cartão de crédito', 'Cartão de crédito', 'Boleto']), channel: rnd() < 0.82 ? 'Site' : 'Mercado Livre', itemsAt: orderedAt,
        items: { create: items.map((x) => ({ tenantId: t, ...x })) },
      },
    })
    orders.push({ ...order, lead })
    add('itens de pedidos', items.length)
  }
  add('pedidos da loja', orders.length)
  for (let i = 0; i < 9; i++) {
    const lead = pick(buyers)
    const lines = [pick(PRODUCTS), pick(PRODUCTS)]
    const items = lines.map(([code, name]) => ({ code, name, qty: between(1, 10), image: null, url: `https://loja.maosaobra.demo/${slugify(name).replace(/\./g, '-')}` }))
    const started = ago(between(0, 20))
    await prisma.ecommerceCart.create({
      data: {
        tenantId: t, externalId: `site:${randomUUID()}`, status: i < 6 ? 2 : 1, leadId: lead.id, customerName: lead.name, customerEmail: lead.email, customerPhone: lead.phone, startedAt: started, lastActivityAt: new Date(started.getTime() + 1_800_000),
        checkoutStarted: i < 4, items: json(items), itemCount: items.reduce((n, x) => n + x.qty, 0), value: r2(items.reduce((s, x) => s + x.qty * PRODUCTS.find((p) => p[0] === x.code)![3], 0)),
        contactStatus: i < 2 ? 'CONTATADO' : 'PENDENTE', contactedAt: i < 2 ? ago(0) : null, contactedBy: i < 2 ? TEAM[3]![0] : null,
      },
    })
  }
  add('carrinhos', 9)
  for (const o of orders.filter((x) => x.statusGroup === 'pago')) await prisma.lead.update({ where: { id: o.leadId! }, data: { lastSaleAt: o.orderedAt, lastSaleValue: o.total, ecommerceId: o.customerId } })

  // ---------- Fidelidade ----------
  await setting('fidelidade', { enabled: true, since: spDay(), pointsPerReal: 1, expireMonths: 12, bonusReview: 50, levels: [{ key: 'bronze', name: 'Bronze', min: 0, benefits: 'Pontos em todas as compras da loja virtual.', color: '#b45309' }, { key: 'prata', name: 'Prata', min: 1000, benefits: 'Atendimento prioritário no WhatsApp.', color: '#64748b' }, { key: 'ouro', name: 'Ouro', min: 3000, benefits: 'Entrega na obra com prioridade e condições especiais.', color: '#ca8a04' }], page: { title: 'Clube Mãos à Obra', intro: 'Cada compra na loja virtual vale pontos. Troque por descontos e brindes para a sua obra.' } })
  const rewards = await Promise.all([
    prisma.loyaltyReward.create({ data: { tenantId: t, name: 'R$ 30 de desconto', description: 'Desconto na próxima compra.', kind: 'DESCONTO', discountType: 'VALOR', value: 30, pointsCost: 600, sort: 1 } }),
    prisma.loyaltyReward.create({ data: { tenantId: t, name: '10% de desconto em tintas', kind: 'DESCONTO', discountType: 'PERCENTUAL', value: 10, pointsCost: 1200, sort: 2 } }),
    prisma.loyaltyReward.create({ data: { tenantId: t, name: 'R$ 50 de cashback', kind: 'CASHBACK', value: 50, pointsCost: 1500, minLevel: 'prata', sort: 3 } }),
  ])
  add('prêmios da fidelidade', rewards.length)
  const members = new Map<string, number>()
  for (const o of orders.filter((x) => x.statusGroup === 'pago').slice(0, 60)) {
    const points = Math.floor(Number(o.total))
    await prisma.loyaltyOrder.create({ data: { tenantId: t, orderId: o.id, leadId: o.leadId!, points, earnedAt: o.orderedAt, deliveredAt: new Date(o.orderedAt.getTime() + 4 * DAY), inviteStatus: 'PULADO: demonstração' } })
    await prisma.loyaltyEntry.create({ data: { tenantId: t, leadId: o.leadId!, kind: 'GANHO', points, remaining: points, expiresAt: new Date(o.orderedAt.getTime() + 365 * DAY), orderId: o.id, orderCode: o.code, reason: `Pedido ${o.code}`, dedupeKey: `ganho:${o.id}`, createdAt: o.orderedAt } })
    members.set(o.leadId!, (members.get(o.leadId!) ?? 0) + points)
    add('lançamentos de pontos')
  }
  for (const [leadId, points] of members) {
    await prisma.loyaltyMember.create({ data: { tenantId: t, leadId, balance: points, levelKey: points >= 3000 ? 'ouro' : points >= 1000 ? 'prata' : 'bronze', levelAt: ago(5), joinedAt: ago(between(30, 90)), consentAt: ago(30), lastAccessAt: rnd() > 0.5 ? ago(between(0, 10)) : null } })
  }
  add('membros da fidelidade', members.size)
  const reviewed = orders.filter((x) => x.statusGroup === 'pago').slice(0, 14)
  for (const [i, o] of reviewed.entries()) {
    const nps = [10, 9, 10, 8, 9, 10, 7, 9, 10, 4, 9, 10, 8, 10][i]!
    await prisma.loyaltyReview.create({ data: { tenantId: t, leadId: o.leadId!, orderId: o.id, orderCode: o.code, stars: nps >= 9 ? 5 : nps >= 7 ? 4 : 2, nps, comment: nps >= 9 ? pick(['Entrega rápida e tudo bem embalado.', 'Ótimo atendimento, recomendo!', 'Chegou antes do prazo na obra.']) : nps >= 7 ? 'Bom, mas a entrega atrasou um dia.' : 'Uma caixa de porcelanato veio com peças quebradas.', aspects: json({ produto: nps >= 7 ? 5 : 2, entrega: nps >= 9 ? 5 : 3, atendimento: 5 }), detractor: nps <= 6, followUpStatus: nps <= 6 ? 'PENDENTE' : null, createdAt: new Date(o.orderedAt.getTime() + 6 * DAY) } })
  }
  add('avaliações (NPS)', reviewed.length)

  // ---------- E-mail marketing e automações ----------
  const segments = await Promise.all([
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Pedreiros parceiros', filters: json({ tag: 'pedreiro parceiro' }) } }),
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Clientes de Santa Catarina', filters: json({ stage: 'CLIENTE', state: 'SC' }) } }),
    prisma.emailSegment.create({ data: { tenantId: t, name: 'Região Sul', filters: json({ region: 'Sul' }) } }),
  ])
  add('segmentos de e-mail', segments.length)
  const optIn = leads.filter((l) => l.emailOptIn)
  const CAMPAIGNS: [name: string, subject: string, days: number, seg: number, links: string[]][] = [
    ['Semana da Construção', 'Cimento, argamassa e tijolos com preço de obra 🏗️', 20, 2, ['https://loja.maosaobra.demo/semana-da-construcao', 'https://loja.maosaobra.demo/cimento']],
    ['Feirão de tintas', 'Suvinil com até 20% de desconto só esta semana', 9, 1, ['https://loja.maosaobra.demo/tintas']],
    ['Novidades em porcelanato', 'Chegou a linha 90x90 acetinado da Portobello', 3, 2, ['https://loja.maosaobra.demo/porcelanato', 'https://loja.maosaobra.demo/showroom']],
  ]
  for (const [name, subject, d, seg, links] of CAMPAIGNS) {
    const started = ago(d)
    const blocks = [{ type: 'titulo', html: subject, align: 'center' }, { type: 'texto', html: '<p>Olá, {nome}! Preparamos condições especiais para a sua obra. Entrega na obra em Itapema e região.</p>' }, { type: 'botao', text: 'Ver ofertas', url: links[0], color: COLORS.primary }]
    const c = await prisma.emailCampaign.create({ data: { tenantId: t, name, subject, preheader: NAME, fromName: SHORT, blocks: json(blocks), links, segmentId: segments[seg]!.id, status: 'ENVIADA', startedAt: started, finishedAt: new Date(started.getTime() + 1_200_000), createdById: admin.id, createdAt: new Date(started.getTime() - DAY) } })
    let opens = 0
    let clicks = 0
    const audience = optIn.filter((_, k) => (k + d) % 4 !== 0)
    for (const l of audience) {
      const opened = rnd() < 0.42
      const clicked = opened && rnd() < 0.3
      const r = await prisma.emailRecipient.create({ data: { campaignId: c.id, leadId: l.id, email: l.email!, status: 'ENVIADO', sentAt: started, openedAt: opened ? new Date(started.getTime() + between(1, 48) * 3_600_000) : null, opens: opened ? between(1, 3) : 0, clickedAt: clicked ? new Date(started.getTime() + between(2, 50) * 3_600_000) : null, clicks: clicked ? 1 : 0 } })
      if (clicked) await prisma.emailClick.create({ data: { recipientId: r.id, campaignId: c.id, linkIndex: between(0, links.length - 1), createdAt: r.clickedAt! } })
      opens += opened ? 1 : 0
      clicks += clicked ? 1 : 0
    }
    await prisma.emailCampaign.update({ where: { id: c.id }, data: { total: audience.length, sent: audience.length, opens, clicks, unsubscribes: d > 10 ? 1 : 0 } })
    add('campanhas de e-mail enviadas')
    add('destinatários de e-mail', audience.length)
  }
  await prisma.emailCampaign.create({ data: { tenantId: t, name: 'Ofertas de dezembro', subject: 'Termine a obra antes das festas', status: 'RASCUNHO', segmentId: segments[2]!.id, blocks: json([{ type: 'titulo', html: 'Termine a obra antes das festas', align: 'center' }]), createdById: admin.id } })
  const template = await prisma.emailCampaign.create({ data: { tenantId: t, name: 'Boas-vindas (modelo)', subject: 'Bem-vindo à Mãos à Obra, {nome}!', kind: 'MODELO', status: 'RASCUNHO', blocks: json([{ type: 'titulo', html: 'Bem-vindo à Mãos à Obra!', align: 'center' }, { type: 'texto', html: '<p>Tudo para a sua obra, da fundação ao acabamento. Fale com a gente pelo WhatsApp.</p>' }]), createdById: admin.id } })
  add('campanhas de e-mail (rascunho e modelo)', 2)
  const welcome = await prisma.automation.create({
    data: {
      tenantId: t, name: 'Boas-vindas a leads novos', description: 'E-mail de boas-vindas e, dois dias depois, a tag de acompanhamento.', active: true, activatedAt: ago(45), createdById: admin.id,
      trigger: json({ type: 'lead_novo', originId: null, includeImported: false }),
      steps: json([{ id: 's1', type: 'enviar_email', templateId: template.id }, { id: 's2', type: 'esperar', amount: 2, unit: 'dias' }, { id: 's3', type: 'adicionar_tag', tags: ['boas-vindas'] }]),
    },
  })
  const winback = await prisma.automation.create({
    data: {
      tenantId: t, name: 'Pedreiro sem comprar há 30 dias', description: 'Chama no WhatsApp o pedreiro parceiro que parou de comprar.', active: true, activatedAt: ago(30), createdById: admin.id,
      trigger: json({ type: 'inatividade', days: 30, kind: 'interacao' }),
      steps: json([{ id: 'w1', type: 'condicao', match: 'todas', rules: [{ type: 'tem_tag', tag: 'pedreiro parceiro' }], yes: [{ id: 'w2', type: 'enviar_whatsapp', numberId: number.id, text: 'Olá, {nome}! Sentimos sua falta na Mãos à Obra. Esta semana tem condição especial de cimento e argamassa para pedreiro parceiro. 🧱', openRecord: true }], no: [{ id: 'w3', type: 'encerrar' }] }]),
    },
  })
  add('automações', 2)
  for (const [i, l] of leads.slice(-12).entries()) {
    const a = i < 8 ? welcome : winback
    const done = i % 3 !== 0
    const started = ago(between(1, 20))
    const run = await prisma.automationRun.create({ data: { tenantId: t, automationId: a.id, leadId: l.id, status: done ? 'CONCLUIDO' : 'ATIVO', stepId: done ? null : a === welcome ? 's2' : 'w1', nextRunAt: done ? null : new Date(now + DAY), startedAt: started, finishedAt: done ? new Date(started.getTime() + 2 * DAY) : null } })
    await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, kind: 'entrou', message: 'Entrou no fluxo.', createdAt: started } })
    if (a === welcome) await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, stepId: 's1', kind: 'email', message: 'E-mail "Boas-vindas (modelo)" enviado.', createdAt: started } })
    if (done) await prisma.automationLog.create({ data: { runId: run.id, automationId: a.id, leadId: l.id, kind: 'concluiu', message: 'Concluiu o fluxo.', createdAt: new Date(started.getTime() + 2 * DAY) } })
    add('passagens pelas automações')
  }

  // ---------- Web Push (só campanhas com os números; inscritos precisam de navegador de verdade) ----------
  for (const [name, title, message, d, targets] of [
    ['Feirão de tintas', 'Feirão de tintas começou! 🎨', 'Suvinil com até 20% de desconto. Só esta semana.', 8, 412],
    ['Cimento com preço de obra', 'Cimento CP-II com preço de obra', 'Compre 40 sacos e ganhe a entrega em Itapema.', 2, 455],
  ] as const) {
    const sent = targets - between(5, 20)
    const delivered = sent - between(10, 30)
    await prisma.webPushCampaign.create({ data: { tenantId: t, name, title, message, url: 'https://loja.maosaobra.demo/ofertas', buttonLabel: 'Ver ofertas', status: 'ENVIADO', sentAt: ago(d), finishedAt: ago(d), targets, sent, failed: targets - sent, delivered, clicks: Math.round(delivered * (0.05 + rnd() * 0.06)), createdById: admin.id, createdByName: admin.name } })
  }
  add('campanhas de Web Push', 2)

  // ---------- Anúncios (Marketing Inteligente) ----------
  const GADS = [['21100001', 'Pesquisa | Material de construção Itapema', 95], ['21100002', 'Performance Max | Loja virtual', 140]] as const
  const META = [['23850001', 'Leads | Orçamento de obra', 70], ['23850002', 'Tráfego | Feirão de tintas', 45]] as const
  for (let d = 1; d <= 90; d++) {
    const date = utcDay(spDay(-d))
    for (const [campaignId, campaignName, budget] of GADS) {
      const cost = r2(budget * (0.7 + rnd() * 0.5))
      const clicks = Math.round(cost / (0.9 + rnd() * 0.8))
      await prisma.googleAdsCampaignDay.create({ data: { tenantId: t, date, campaignId, campaignName, cost, clicks, impressions: clicks * between(14, 30), conversions: r2(clicks * (0.03 + rnd() * 0.05)) } })
    }
    for (const [campaignId, campaignName, budget] of META) {
      const spend = r2(budget * (0.7 + rnd() * 0.5))
      const impressions = Math.round(spend * between(55, 90))
      await prisma.mktAdDay.create({ data: { tenantId: t, platform: 'meta', level: 'campaign', entityId: campaignId, name: campaignName, campaignId, campaignName, objective: campaignName.startsWith('Leads') ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC', date, spend, impressions, reach: Math.round(impressions * 0.7), clicks: Math.round(impressions * (0.011 + rnd() * 0.01)), leads: campaignName.startsWith('Leads') ? between(1, 6) : 0, conversations: between(0, 4) } })
    }
  }
  add('dias de Google Ads e Meta Ads (por campanha)', 90 * 4)

  // ---------- Fretes ----------
  const settings: CalcSettings = { ...DEFAULT_SETTINGS, icmsRateIntra: 12 }
  const carriers: (FreightCarrier & { def: (typeof CARRIERS)[number] })[] = []
  const tables: { table: { id: string; name: string; quoteName: string | null; validTo: Date; dispatchDays: number | null }; carrier: FreightCarrier; version: { id: string; number: number }; rules: RuleLike[] }[] = []
  const validFrom = utcDay(spDay(-120))
  const validTo = utcDay(spDay(245))
  for (const [ci, c] of CARRIERS.entries()) {
    const carrier = await prisma.freightCarrier.create({
      data: {
        tenantId: t, cnpj: cnpj(c.base), legalName: c.legal, name: c.name, zip: c.zip, city: c.city, state: c.uf, phone: `55${{ SC: '47', PR: '41', RS: '54' }[c.uf] ?? '47'}3${String(3300000 + ci * 1111)}`, email: `comercial@${slugify(c.name).replace(/\./g, '')}.demo`,
        contacts: json([{ name: pick(FIRST) + ' ' + pick(LAST), role: 'Comercial', phone: null, email: `comercial@${slugify(c.name).replace(/\./g, '')}.demo` }]), modes: ['RODOVIARIO'],
        pickups: json(c.schedule ? [] : [{ unitId: null, days: [1, 2, 3, 4, 5], cutoff: ci % 2 ? '14:30' : '15:30', pickup: ci % 2 ? '16:00' : '17:00', minutes: 30, note: null }]),
        pickupMode: c.pickupMode, pickupBySchedule: c.schedule,
      },
    })
    carriers.push({ ...carrier, def: c })
    const table = await prisma.freightTable.create({ data: { tenantId: t, carrierId: carrier.id, name: `${c.name} ${new Date(now).getUTCFullYear()}`, status: 'ATIVA', validFrom, validTo, goodsTypes: [], notes: 'Tabela negociada (fictícia).' } })
    // A TransSul tem a versão 1 substituída pela 2 (reajuste): mostra o histórico de versões.
    const versions = ci === 0 ? [1, 2] : [1]
    for (const n of versions) {
      const factor = n === 1 && versions.length > 1 ? 0.93 : 1
      const rules: (RuleLike & { id: string })[] = []
      for (const uf of Object.keys(c.price)) {
        const base = (c.price as Record<string, number>)[uf]! * factor
        for (const [bi, [min, max, f]] of BANDS.entries()) {
          const values: Record<string, number> = { freight: r2(base * f), advalorem: c.adv, gris: c.gris, gris_min: 3.5, toll: c.toll, fraction: 100 }
          if (bi === BANDS.length - 1) values.over_weight = r2((base * f) / 500)
          if (uf !== c.uf) values.tas = 2.9
          rules.push({ id: randomUUID(), cepStart: null, cepEnd: null, uf, city: null, weightMin: min, weightMax: max, deadlineDays: (c.days as Record<string, number>)[uf]!, restricted: false, values })
        }
      }
      const status = n === versions.length ? 'PUBLICADA' : 'SUBSTITUIDA'
      const pubAt = n === 1 ? ago(120) : ago(35)
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
  add('tabelas de frete', tables.length)

  // Campanhas de frete e poupança de frete dos vendedores.
  const freightCampaigns: FreightCampaign[] = [
    { id: randomUUID(), name: 'Frete grátis em SC acima de R$ 3.000', active: true, mode: 'GRATIS', value: 0, carrierIds: [], ufs: ['SC'], cities: [], minCargoValue: 3000, tableAbove: null, startsOn: null, endsOn: null },
    { id: randomUUID(), name: 'Obras no Paraná: 10% de desconto', active: true, mode: 'DESCONTO', value: 10, carrierIds: [], ufs: ['PR'], cities: [], minCargoValue: 1500, tableAbove: null, startsOn: spDay(-30), endsOn: spDay(30) },
    { id: randomUUID(), name: 'Reajuste do diesel', active: false, mode: 'ACRESCIMO', value: 5, carrierIds: [], ufs: [], cities: [], minCargoValue: null, tableAbove: null, startsOn: null, endsOn: null },
  ]
  await setting(CAMPAIGNS_KEY, freightCampaigns)
  const walletStart = spDay(-60)
  const [wy, wm, wd] = walletStart.split('-').map(Number) as [number, number, number]
  const walletEnd = new Date(Date.UTC(wy, wm - 1 + 3, wd) - DAY).toISOString().slice(0, 10)
  const wallet = { id: randomUUID(), name: 'Poupança de frete do trimestre', active: true, pct: 15, sellerPcts: [{ seller: 'Ricardo Lemos', pct: 10 }], period: 'TRIMESTRAL', start: walletStart, end: walletEnd }
  await setting('fretes_poupanca_campanhas', [wallet])
  add('campanhas de frete', freightCampaigns.length)
  add('campanhas da poupança de frete', 1)

  type Result = ReturnType<typeof quoteOne>
  function quoteOne(entry: (typeof tables)[number], unit: Unit, dest: (typeof DESTS)[number], personType: 'PF' | 'PJ', cargoValue: number, volumes: Volume[], date: Date) {
    const { table, carrier, version, rules } = entry
    const m = measure(volumes, null)
    const base = {
      tableId: table.id, tableName: table.name, quoteName: table.quoteName || carrier.quoteName || carrier.name, carrierId: carrier.id, carrierName: carrier.name,
      pickups: ((carrier.pickups as unknown as { unitId: string | null; days: number[]; cutoff: string; pickup: string; note: string | null }[]) ?? []).filter((p) => p.days.includes(date.getUTCDay())).map((p) => ({ cutoff: p.cutoff, pickup: p.pickup, note: p.note })),
      pickupMode: carrier.pickupMode === 'DESPACHO' ? ('DESPACHO' as const) : ('COLETA' as const), versionId: version.id, versionNumber: version.number, status: 'OK' as string, reason: null as string | null,
      total: null as number | null, subtotal: null as number | null, icms: null as unknown, components: [] as unknown[], weights: null as unknown, deadlineDays: null as number | null, deliveryDate: null as string | null,
      validUntil: table.validTo.toISOString().slice(0, 10), rule: null as { id: string | null; by: string; label: string } | null, warnings: [] as string[], expiredUsed: false, campaign: null as ReturnType<typeof bestCampaign>,
    }
    const match = matchRule(rules, { zip: Number(dest[2]), uf: dest[1], city: dest[0] }, weights(m, settings).taxed)
    if (!match.rule) return { ...base, status: 'SEM_COBERTURA', reason: `${match.reason} Destino: ${dest[0]}/${dest[1]}, CEP ${dest[2].slice(0, 5)}-${dest[2].slice(5)}.` }
    const r = match.rule
    base.rule = { id: r.id ?? null, by: match.by, label: `UF ${r.uf}, ${r.weightMin} a ${r.weightMax ?? '∞'} kg` }
    const res = calculate(DEFAULT_COMPONENTS, settings, match, { cargoValue, personType, measures: m, sameState: unit.state === dest[1], originUf: unit.state, destUf: dest[1] })
    if (!res.ok) return { ...base, status: 'ERRO', reason: res.error, weights: res.weights, components: res.components, warnings: res.warnings }
    const deadline = r.deadlineDays! + (table.dispatchDays ?? 0)
    const campaign = bestCampaign(freightCampaigns, { carrierId: carrier.id, destUf: dest[1], destCity: dest[0], cargoValue, date: date.toISOString().slice(0, 10) }, res.total)
    return { ...base, total: res.total, subtotal: res.subtotal, icms: res.icms, components: res.components, weights: res.weights, warnings: res.warnings, deadlineDays: deadline, deliveryDate: addBusinessDays(date, deadline).toISOString().slice(0, 10), campaign }
  }

  const CUSTOMERS = [...BUILDERS.slice(0, 5).map((n, i) => [n, cnpj(`${30_100_200 + i * 7}0001`), 'PJ'] as const), ...['Jair Bortolini', 'Fernanda Martins', 'Valdir Schmitz', 'Camila Ribeiro', 'Sérgio Pereira'].map((n) => [n, null, 'PF'] as const)]
  const quoteSeller = users.filter((_, i) => i !== 0 && TEAM[i]![1] !== 'Expedição')
  const quotes = []
  for (let i = 0; i < 18; i++) {
    const unit = i % 5 === 4 ? units[1]! : units[0]!
    const dest = pick(i % 3 === 0 ? DESTS.filter((c) => c[1] === 'RS' || c[1] === 'SP') : DESTS.filter((c) => c[0] !== unit.city))
    const [desc, volumes, cargoValue] = pick(CARGOS)
    const [customerName, customerDoc, personType] = pick(CUSTOMERS)
    const daysAgo = Math.floor((18 - i) * 1.9) + 1
    const createdAt = ago(daysAgo)
    const quoteDate = utcDay(createdAt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    const results: Result[] = tables.map((e) => quoteOne(e, unit, dest, personType, cargoValue, volumes, quoteDate))
    results.sort((a, b) => (a.status === 'OK' ? 0 : 1) - (b.status === 'OK' ? 0 : 1) || (a.total ?? 0) - (b.total ?? 0))
    const ok = results.filter((r) => r.status === 'OK')
    const m = measure(volumes, null)
    const who = pick(quoteSeller)
    const status = i === 7 ? 'CANCELADA' : i > 14 ? 'CALCULADA' : 'SELECIONADA'
    const chosen = status === 'SELECIONADA' ? (i % 4 === 0 && ok[1] ? ok[1] : ok[0]) : undefined
    const input = { unitId: unit.id, originZip: unit.zip, destZip: dest[2], destCity: dest[0], destUf: dest[1], personType, customerName, customerDoc, cargoValue, volumes, goodsType: null, quoteDate: quoteDate.toISOString().slice(0, 10), reference: desc, notes: null }
    const q = await prisma.freightQuote.create({
      data: {
        tenantId: t, unitId: unit.id, reference: desc, customerName, customerDoc, personType, originZip: unit.zip!, destZip: dest[2], destCity: dest[0], destUf: dest[1], cargoValue, realWeight: m.realWeight, cubicMeters: m.cubicMeters, volumes: json(volumes), quoteDate,
        input: json(input), results: json(results), bestTotal: ok[0]?.total ?? null, status,
        selectedTableId: chosen?.tableId ?? null, selectedVersionId: chosen?.versionId ?? null, selectedCarrierId: chosen?.carrierId ?? null, selectedTotal: chosen?.total ?? null, selectedAt: chosen ? new Date(createdAt.getTime() + 900_000) : null, selectedByName: chosen ? who.name : null,
        selectionNote: chosen && chosen !== ok[0] ? 'Cliente pediu a transportadora com o menor prazo.' : null, createdById: who.id, createdByName: who.name, createdAt,
      },
    })
    quotes.push({ q, chosen, unit, dest, volumes, cargoValue, customerName, customerDoc, personType, who, createdAt })
  }
  add('cotações de frete', quotes.length)

  // Pedidos expedidos: caminho das situações até a atual.
  const PATH = ['COTADO', 'APROVADO', 'AGUARDANDO_COLETA', 'DESPACHADO', 'EM_TRANSITO', 'ENTREGUE', 'AGUARDANDO_CONCILIACAO', 'CONCILIADO'] as const
  const FINAL: string[] = ['CONCILIADO', 'CONCILIADO', 'AGUARDANDO_CONCILIACAO', 'CONCILIADO', 'ENTREGUE', 'AGUARDANDO_CONCILIACAO', 'CONCILIADO', 'COM_OCORRENCIA', 'EM_TRANSITO', 'EM_TRANSITO', 'DESPACHADO', 'AGUARDANDO_COLETA', 'AGUARDANDO_COLETA', 'APROVADO']
  const exp = users.find((u) => u.name === 'Everton Kunz')!
  const sellerOf = (userId: string) => users.find((u) => u.id === userId)!.name
  let nfeNumber = 18_400
  let cteSeq = 0
  const ctes: { id: string; carrierId: string; total: number; unitId: string }[] = []
  const selected = quotes.filter((x) => x.chosen)
  for (const [i, x] of selected.entries()) {
    const status = FINAL[i] ?? 'APROVADO'
    const chosen = x.chosen!
    const carrier = carriers.find((c) => c.id === chosen.carrierId)!
    const reached = status === 'COM_OCORRENCIA' ? PATH.indexOf('EM_TRANSITO') : PATH.indexOf(status as (typeof PATH)[number])
    const created = new Date(x.createdAt.getTime() + 1_800_000)
    const step = (k: number) => new Date(created.getTime() + k * 0.7 * DAY)
    const shipped = reached >= 3 ? step(3) : null
    const delivered = reached >= 5 ? step(3 + Math.max(1, chosen.deadlineDays ?? 2)) : null
    const m = measure(x.volumes, null)
    const issued = reached >= 2 ? step(2) : null
    const nfeKey = issued ? accessKey(x.unit.state!, issued, x.unit.cnpj!, '55', ++nfeNumber) : null
    const sh = await prisma.freightShipment.create({
      data: {
        tenantId: t, unitId: x.unit.id, orderNumber: String(77_000 + i), invoiceNumber: nfeKey ? String(nfeNumber) : null, invoiceKey: nfeKey, customerName: x.customerName, customerDoc: x.customerDoc, personType: x.personType,
        destZip: x.dest[2], destCity: x.dest[0], destUf: x.dest[1], cargoValue: x.cargoValue, weight: m.realWeight, volumesCount: m.quantity, carrierId: carrier.id, quoteId: x.q.id,
        expected: json({ ...chosen, quoteCode: x.q.code }), expectedTotal: chosen.total, status, collectedAt: shipped, shippedAt: shipped,
        expectedDeliveryAt: chosen.deliveryDate ? utcDay(chosen.deliveryDate) : null, deliveredAt: delivered, trackingCode: shipped ? `${carrier.name.slice(0, 2).toUpperCase()}${between(1_000_000, 9_999_999)}` : null,
        trackingAt: shipped ? ago(0) : null, trackingLast: status === 'COM_OCORRENCIA' ? 'Destinatário ausente: nova tentativa de entrega amanhã.' : delivered ? 'Mercadoria entregue' : shipped ? 'Em trânsito para a unidade de destino' : null,
        notes: status === 'COM_OCORRENCIA' ? 'Obra fechada no horário da entrega.' : null, createdById: x.who.id, createdByName: x.who.name, createdAt: created,
      },
    })
    const events = status === 'COM_OCORRENCIA' ? [...PATH.slice(0, reached + 1), 'COM_OCORRENCIA'] : PATH.slice(0, reached + 1)
    for (const [k, s] of events.entries()) await prisma.freightShipmentEvent.create({ data: { shipmentId: sh.id, status: s, note: s === 'COM_OCORRENCIA' ? 'Destinatário ausente.' : null, userName: k < 2 ? x.who.name : s === 'CONCILIADO' ? 'Conciliação automática' : exp.name, createdAt: step(k) } })
    add('pedidos de frete')
    add('histórico dos pedidos', events.length)
    if (!nfeKey || !issued) continue
    // NF-e CIF com o vendedor nos dados adicionais: o frete cobrado do cliente alimenta a poupança de frete.
    const pct = sellerOf(x.who.id) === 'Ricardo Lemos' ? 10 : 15
    const charged = r2(chosen.total! * (1 + pct / 100) + (rnd() - 0.25) * 60)
    await prisma.freightNfe.create({
      data: {
        tenantId: t, key: nfeKey, number: nfeNumber, series: '1', issuedAt: issued, emitCnpj: x.unit.cnpj, unitId: x.unit.id, value: x.cargoValue, freightValue: charged, seller: sellerOf(x.who.id), freightMode: '0',
        carrierCnpj: carrier.cnpj, carrierId: carrier.id, volumes: m.quantity, grossWeight: m.realWeight, netWeight: r2(m.realWeight * 0.98), destCnpj: x.customerDoc, destZip: x.dest[2], destCity: x.dest[0], destUf: x.dest[1], shipmentId: sh.id, status: 'PEDIDO', createdAt: issued,
      },
    })
    add('NF-e')
    if (reached < 5) continue
    // CT-e: a maioria bate com a cotação; dois vêm com divergência (taxa não prevista e peso a mais).
    const divergent = status === 'AGUARDANDO_CONCILIACAO'
    const comps = (chosen.components as { code: string; name: string; cteName: string | null; value: number; skipped: boolean }[]).filter((c) => !c.skipped && c.value > 0).map((c) => ({ name: c.cteName ?? c.name, value: c.value }))
    if (divergent && cteSeq % 2 === 0) comps.push({ name: 'TDE', value: 48.5 })
    if (divergent && cteSeq % 2 === 1) comps[0] = { name: comps[0]!.name, value: r2(comps[0]!.value * 1.22) }
    const icms = chosen.icms as { mode: 'SOMADO' | 'NAO_INCIDE' | 'INFORMATIVO'; rate: number | null; base: number; value: number }
    const sub = r2(comps.reduce((s, c) => s + c.value, 0))
    const icmsValue = icms.rate ? r2(sub / (1 - icms.rate / 100) - sub) : 0
    const total = r2(sub + icmsValue)
    const cteAt = new Date(shipped!.getTime() + 3_600_000)
    const emit = carrier.cnpj
    const key = accessKey(carrier.state!, cteAt, emit, '57', 31_000 + ++cteSeq)
    const weight = divergent && cteSeq % 2 === 0 ? r2(m.realWeight * 1.15) : m.realWeight
    const charged2 = { total, components: [...comps, { name: 'ICMS', value: icmsValue }], icms: { rate: icms.rate, value: icmsValue }, weight }
    const expected = { total: chosen.total!, components: chosen.components as { code: string; name: string; cteName?: string | null; value: number; skipped?: boolean }[], icms, weight: (chosen.weights as { taxed: number }).taxed }
    const rec = reconcile(expected, charged2, { value: 1, percent: 1 })
    const cte = await prisma.freightCte.create({
      data: {
        tenantId: t, key, number: String(31_000 + cteSeq), series: '1', issuedAt: cteAt, emitCnpj: emit, emitName: carrier.legalName, carrierId: carrier.id, unitId: x.unit.id, tomadorDoc: x.unit.cnpj, senderDoc: x.unit.cnpj,
        recipientDoc: x.customerDoc, recipientName: x.customerName, ufIni: x.unit.state, ufFim: x.dest[1], cityIni: x.unit.city, cityFim: x.dest[0], destZip: x.dest[2], cfop: x.unit.state === x.dest[1] ? '5352' : '6352',
        total, cargoValue: x.cargoValue, weight, volumes: m.quantity, components: json(charged2.components), icms: json({ cst: '00', base: sub + icmsValue, rate: icms.rate, value: icmsValue }), nfeKeys: [nfeKey],
        protocol: `14${between(100_000_000, 999_999_999)}`, protocolStatus: '100', shipmentId: sh.id, companyRoles: ['REMETENTE', 'TOMADOR'], source: cteSeq % 3 === 0 ? 'MANUAL' : 'SEFAZ', importedByName: cteSeq % 3 === 0 ? exp.name : 'Captura automática (SEFAZ)', createdAt: cteAt,
        recStatus: rec.status, recTypes: rec.types, recSource: 'COTACAO', expectedTotal: rec.expectedTotal, difference: rec.difference, recDetail: json({ ...rec, reference: `Cotação nº ${x.q.code} (${chosen.tableName} v${chosen.versionNumber})` }), recAt: new Date(cteAt.getTime() + 600_000),
        ...(rec.status === 'CONCILIADO' ? { decision: 'APROVADO', approvedValue: total, decidedByName: 'Conciliação automática', decidedAt: new Date(cteAt.getTime() + 600_000) } : cteSeq % 2 === 0 ? { decision: 'CONTESTADO', contestStatus: 'ABERTA', contestNote: 'TDE não combinada na tabela: pedido de crédito enviado à transportadora.', decidedByName: admin.name, decidedAt: ago(1) } : {}),
      },
    })
    ctes.push({ id: cte.id, carrierId: carrier.id, total, unitId: x.unit.id })
    add(`CT-e ${rec.status === 'CONCILIADO' ? 'conciliados' : 'divergentes'}`)
  }
  // Notas sem frete (retira no balcão) e uma cancelada: aparecem na lista de NF-e.
  for (let i = 0; i < 3; i++) {
    const issued = ago(between(1, 20))
    const unit = units[0]!
    await prisma.freightNfe.create({ data: { tenantId: t, key: accessKey('SC', issued, unit.cnpj!, '55', ++nfeNumber), number: nfeNumber, series: '1', issuedAt: issued, emitCnpj: unit.cnpj, unitId: unit.id, value: between(300, 4000), freightValue: 0, seller: pick(sellers).name, freightMode: i === 2 ? '0' : '9', destCity: 'Itapema', destUf: 'SC', destZip: '88220000', status: i === 2 ? 'CANCELADA' : 'SEM_FRETE', cancelledAt: i === 2 ? issued : null } })
    add('NF-e')
  }
  // Pedido aguardando cotação (entrou pela NF-e, falta escolher a transportadora).
  await prisma.freightShipment.create({ data: { tenantId: t, unitId: units[0]!.id, orderNumber: '77990', customerName: 'Construtora Vale Verde', personType: 'PJ', destZip: '88010000', destCity: 'Florianópolis', destUf: 'SC', cargoValue: 5840, weight: 820, volumesCount: 18, status: 'AGUARDANDO_COTACAO', createdById: users[1]!.id, createdByName: users[1]!.name } })
  add('pedidos de frete')

  // Faturas das transportadoras (uma paga, uma em aberto) com os CT-es conciliados.
  const byCarrier = new Map<string, typeof ctes>()
  for (const c of ctes) byCarrier.set(c.carrierId, [...(byCarrier.get(c.carrierId) ?? []), c])
  let invoices = 0
  for (const [carrierId, list] of [...byCarrier].slice(0, 2)) {
    const paid = invoices === 0
    const total = r2(list.reduce((s, c) => s + c.total, 0))
    const inv = await prisma.freightInvoice.create({ data: { tenantId: t, carrierId, unitId: list[0]!.unitId, number: `FAT-${2600 + invoices}`, issuedAt: utcDay(spDay(paid ? -15 : -3)), dueAt: utcDay(spDay(paid ? -1 : 12)), total, status: paid ? 'PAGA' : 'ABERTA', paidAt: paid ? utcDay(spDay(-1)) : null, paidValue: paid ? total : null, createdByName: exp.name } })
    await prisma.freightCte.updateMany({ where: { id: { in: list.map((c) => c.id) } }, data: { invoiceId: inv.id } })
    invoices++
  }
  add('faturas de frete', invoices)

  // Poupança: um uso do saldo registrado.
  await prisma.freightWalletMove.create({ data: { tenantId: t, campaignId: wallet.id, seller: 'Juliana Sartori', kind: 'USO', value: -35, note: 'Desconto no frete do pedido 77005 (Construtora Horizonte).', createdByName: admin.name, createdAt: ago(4) } })
  add('movimentos da poupança de frete')

  // Coletas agendadas (a Fluxo Express só vem quando a expedição agenda).
  const fluxo = carriers.find((c) => c.def.schedule)!
  for (const [d, period, status] of [[-1, 'TARDE', 'COLETADA'], [0, 'MANHA', 'COLETANDO'], [0, 'TARDE', 'AGENDADA'], [1, 'MANHA', 'AGENDADA']] as const) {
    await prisma.freightPickupSchedule.create({ data: { tenantId: t, unitId: units[0]!.id, carrierId: fluxo.id, date: utcDay(spDay(d)), period, status, note: d === 1 ? '12 volumes de porcelanato para Curitiba.' : null, createdByName: exp.name, statusByName: status === 'AGENDADA' ? null : exp.name, statusAt: status === 'AGENDADA' ? null : ago(0) } })
  }
  add('coletas agendadas', 4)

  console.log(`${SLUG}: criada (${admin.email})`)
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
  console.log(`Senha dos usuários: ${PASSWORD}`)
}

main().finally(() => prisma.$disconnect())
