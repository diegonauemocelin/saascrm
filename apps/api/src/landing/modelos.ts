/**
 * Modelos prontos de landing page, genéricos para qualquer ramo. O que depende de dado da empresa (nome, produtos,
 * marcas, números, região atendida, condição de oferta, prazo, depoimento) fica entre colchetes para alguém preencher.
 * Nada de preço, prazo ou garantia inventados.
 */
import type { Seo, Theme } from './blocos'

export interface LandingTemplate {
  key: string
  name: string
  description: string
  /** Para que serve (filtro na galeria de modelos). */
  goal: 'orcamento' | 'promocao' | 'marca' | 'lancamento' | 'evento' | 'obrigado'
  theme: Partial<Theme>
  seo: Partial<Seo>
  blocks: Record<string, unknown>[]
}

const BRANDS = ['[Marca 1]', '[Marca 2]', '[Marca 3]', '[Marca 4]', '[Marca 5]', '[Marca 6]'].map((name) => ({ name, image: '' }))
const NUMBERS = { type: 'numeros', background: 'padrao', items: [{ value: '[Ano]', label: 'no mercado desde' }, { value: '[Nº]', label: 'clientes atendidos' }, { value: '[Nº]', label: 'produtos no catálogo' }, { value: '[Região]', label: 'onde atendemos' }] }
const BENEFITS = {
  type: 'beneficios',
  variant: 'cartoes',
  background: 'suave',
  title: 'Por que comprar com a gente',
  subtitle: '[Uma frase sobre a empresa: há quanto tempo atua e o que faz de melhor.]',
  items: [
    { icon: 'estrela', title: 'Qualidade', text: '[Fale da qualidade dos produtos ou serviços: procedência, marcas, cuidados.]' },
    { icon: 'estoque', title: 'Variedade', text: '[Quais tipos de produto, categorias ou serviços a empresa oferece.]' },
    { icon: 'conversa', title: 'Atendimento', text: 'Nossa equipe tira suas dúvidas e ajuda a escolher a melhor opção para você.' },
    { icon: 'caminhao', title: 'Entrega', text: '[Onde a empresa entrega ou atende e como funciona o envio.]' },
  ],
}
const FAQ = {
  type: 'faq',
  background: 'padrao',
  title: 'Perguntas frequentes',
  items: [
    { q: 'Como faço um orçamento?', a: 'Preencha o formulário desta página com o que você precisa. Nossa equipe confere as informações e responde com o orçamento.' },
    { q: 'Como sei se o produto serve para mim?', a: 'Conte o que você procura e, se tiver, a marca, o modelo, a medida ou o código do produto. Nossa equipe ajuda a confirmar se ele atende à sua necessidade.' },
    { q: 'Vocês atendem a minha região?', a: '[Informe as cidades, os estados ou os países atendidos e os endereços das lojas, se houver.]' },
    { q: 'Qual o prazo de entrega?', a: '[Preencha com o prazo confirmado pela empresa antes de publicar.]' },
  ],
}
const FORM = (title: string, text: string) => ({
  type: 'formulario',
  variant: 'lado-a-lado',
  background: 'padrao',
  title,
  text,
  bullets: 'Resposta da nossa equipe\nAjuda para escolher a opção certa\nOrçamento sem compromisso',
  formId: '',
})
const FINAL_CTA = (title: string) => ({ type: 'cta', background: 'destaque', title, text: 'Fale com a nossa equipe e receba o orçamento.', ctaText: 'Pedir orçamento', action: 'formulario', url: '' })

export const TEMPLATES: LandingTemplate[] = [
  {
    key: 'orcamento',
    name: 'Pedido de orçamento',
    description: 'Para anúncios de busca: chamada direta, confiança (números e marcas) e formulário.',
    goal: 'orcamento',
    theme: { header: 'logo-botao', headerCta: 'Pedir orçamento' },
    seo: { title: '[Produto ou serviço] | Orçamento', description: '[Descreva em uma frase o que a empresa vende ou faz e para quem.]' },
    blocks: [
      { type: 'hero', variant: 'imagem-direita', eyebrow: '[Seu diferencial em poucas palavras]', title: '[Produto ou serviço] com quem entende do assunto', subtitle: 'Conte o que você precisa e receba um orçamento da nossa equipe. [Complete com os tipos de produto, marcas ou serviços da empresa.]', image: '', ctaText: 'Pedir orçamento', action: 'formulario', note: '[Região atendida, ex.: Atendemos todo o Brasil]' },
      NUMBERS,
      BENEFITS,
      { type: 'marcas', background: 'padrao', title: 'Marcas com que trabalhamos', items: BRANDS },
      FORM('Peça seu orçamento', 'Conte qual produto você procura e, se tiver, a marca, o modelo ou o código. Quanto mais detalhes, mais rápido o orçamento.'),
      FAQ,
      FINAL_CTA('Receba seu orçamento sem compromisso'),
    ],
  },
  {
    key: 'categoria-produtos',
    name: 'Categoria em destaque',
    description: 'Campanha para uma categoria ou linha de produtos: o que você encontra, ajuda na escolha e formulário.',
    goal: 'promocao',
    theme: { header: 'logo-botao', headerCta: 'Pedir orçamento' },
    seo: { title: '[Categoria] | [Nome da empresa]', description: '[Descreva a categoria: tipos de produto, marcas e para quem serve.]' },
    blocks: [
      { type: 'hero', variant: 'imagem-fundo', eyebrow: '[Categoria]', title: '[Categoria]: encontre a opção certa para você', subtitle: '[Liste os principais tipos de produto e as marcas desta categoria.]', image: '', ctaText: 'Cotar agora', action: 'formulario', note: 'Diga o que você procura e ajudamos na escolha' },
      { type: 'beneficios', variant: 'lista', background: 'padrao', title: 'O que você encontra', subtitle: '', items: [{ icon: 'check', title: '[Tipo de produto 1]', text: '[Descrição curta.]' }, { icon: 'check', title: '[Tipo de produto 2]', text: '[Descrição curta.]' }, { icon: 'check', title: '[Tipo de produto 3]', text: '[Descrição curta.]' }, { icon: 'check', title: 'E mais', text: '[Descreva o que mais a categoria oferece, como kits ou combinações.]' }] },
      { type: 'imagem-texto', variant: 'imagem-esquerda', background: 'suave', title: 'Produto certo na primeira vez', text: 'Na dúvida sobre qual escolher? Fale com a nossa equipe: com a marca, o modelo, a medida ou o código do produto fica mais fácil acertar na primeira vez.', image: '', ctaText: 'Falar com a equipe', action: 'whatsapp', url: '' },
      { type: 'marcas', background: 'padrao', title: 'Marcas desta categoria', items: BRANDS },
      FORM('Faça sua cotação', 'Informe quais produtos você precisa e, se tiver, a marca, o modelo ou o código.'),
      FAQ,
    ],
  },
  {
    key: 'promocao-oferta',
    name: 'Promoção com prazo',
    description: 'Vitrine de produtos com oferta por prazo (contagem regressiva) e formulário.',
    goal: 'promocao',
    theme: { header: 'logo-botao', headerCta: 'Quero a oferta' },
    seo: { title: '[Nome da promoção] | [Nome da empresa]', description: '[Descreva a oferta e até quando ela vale.]' },
    blocks: [
      { type: 'hero', variant: 'centro', eyebrow: 'Oferta por tempo limitado', title: '[Produto ou categoria] em oferta', subtitle: '[Descreva em uma frase o que está em promoção e para quem.]', image: '', ctaText: 'Ver a oferta', action: 'formulario', note: '' },
      { type: 'oferta', background: 'padrao', title: '[Descreva a condição da oferta]', text: 'Condição válida até a data indicada ou enquanto durar o estoque. [Confirme a condição antes de publicar.]', endsAt: '', ctaText: 'Quero a oferta', action: 'formulario', url: '' },
      { type: 'produtos', background: 'suave', title: 'Produtos em destaque', subtitle: 'Escolha um produto do catálogo ou cadastre manualmente.', items: [{ image: '', name: '[Produto 1]', text: '[Descrição curta]', price: '', ctaText: 'Quero este', url: '' }, { image: '', name: '[Produto 2]', text: '[Descrição curta]', price: '', ctaText: 'Quero este', url: '' }, { image: '', name: '[Produto 3]', text: '[Descrição curta]', price: '', ctaText: 'Quero este', url: '' }] },
      FORM('Garanta a sua oferta', 'Diga quais produtos você quer e a quantidade.'),
      FAQ,
    ],
  },
  {
    key: 'produtos-por-marca',
    name: 'Produtos por marca',
    description: 'Uma página por marca: bom para anúncios com o nome da marca na busca.',
    goal: 'marca',
    theme: { header: 'logo-botao', headerCta: 'Pedir orçamento' },
    seo: { title: '[Marca] | [Nome da empresa]', description: 'Produtos [Marca] na [Nome da empresa]: [principais categorias ou linhas].' },
    blocks: [
      { type: 'hero', variant: 'imagem-direita', eyebrow: '[Marca]', title: 'Encontre produtos [Marca]', subtitle: '[Principais categorias ou linhas da marca.] Diga o modelo ou o produto que você procura.', image: '', ctaText: 'Pedir orçamento', action: 'formulario', note: '[Diferencial, ex.: revenda autorizada da marca]' },
      { type: 'beneficios', variant: 'cartoes', background: 'suave', title: 'Linhas da marca', subtitle: '', items: [{ icon: 'raio', title: '[Linha ou categoria 1]', text: '[O que a linha inclui.]' }, { icon: 'caminhao', title: '[Linha ou categoria 2]', text: '[O que a linha inclui.]' }, { icon: 'suporte', title: '[Linha ou categoria 3]', text: '[O que a linha inclui.]' }, { icon: 'estoque', title: '[Linha ou categoria 4]', text: '[O que a linha inclui.]' }] },
      NUMBERS,
      FORM('Orçamento de produtos [Marca]', 'Informe o produto e, se tiver, o modelo ou o código.'),
      FAQ,
      FINAL_CTA('Fale com a gente sobre produtos [Marca]'),
    ],
  },
  {
    key: 'lancamento-linha',
    name: 'Lançamento de produto ou coleção',
    description: 'Apresentar um produto, linha ou coleção nova: imagem de impacto, galeria e WhatsApp.',
    goal: 'lancamento',
    theme: { header: 'logo', mode: 'escuro' },
    seo: { title: '[Nome do lançamento] | [Nome da empresa]', description: '[Descreva o lançamento.]' },
    blocks: [
      { type: 'hero', variant: 'imagem-fundo', eyebrow: 'Novidade', title: '[Nome do lançamento]', subtitle: '[Descreva em uma frase o que o lançamento traz de novo para o seu cliente.]', image: '', ctaText: 'Conhecer o lançamento', action: 'formulario', note: '' },
      { type: 'imagem-texto', variant: 'imagem-direita', background: 'padrao', title: 'O que muda para você', text: '[Explique os diferenciais com dados confirmados pelo fabricante ou fornecedor.]', image: '', ctaText: '', action: 'formulario', url: '' },
      { type: 'galeria', background: 'suave', title: 'Veja de perto', items: [{ image: '', caption: '' }, { image: '', caption: '' }, { image: '', caption: '' }] },
      { type: 'whatsapp', background: 'padrao', title: 'Tire suas dúvidas com a equipe', text: 'Converse com a nossa equipe pelo WhatsApp.', buttonText: 'Chamar no WhatsApp', mode: 'direto', whatsappId: '' },
      FORM('Quero saber mais', 'Deixe seus dados que a nossa equipe entra em contato.'),
    ],
  },
  {
    key: 'feira-evento',
    name: 'Feira ou evento',
    description: 'Convite para visitar o estande ou participar de um evento, com contagem regressiva.',
    goal: 'evento',
    theme: { header: 'logo-botao', headerCta: 'Confirmar presença' },
    seo: { title: '[Nome da empresa] na [nome do evento]', description: 'Visite o nosso estande na [nome do evento].' },
    blocks: [
      { type: 'hero', variant: 'centro', eyebrow: '[Data e local]', title: 'Encontre a [Nome da empresa] na [nome do evento]', subtitle: '[Estande, horários e o que vai ter de especial.]', image: '', ctaText: 'Confirmar presença', action: 'formulario', note: '' },
      { type: 'oferta', background: 'padrao', title: 'Faltam poucos dias', text: '[Detalhes do evento.]', endsAt: '', ctaText: 'Confirmar presença', action: 'formulario', url: '' },
      { type: 'texto', background: 'suave', title: 'Como chegar', text: '[Endereço do evento, estacionamento e horários.]' },
      { ...FORM('Confirme sua presença', 'Deixe seus dados para receber a confirmação e novidades do evento.'), variant: 'cartao', bullets: '' },
    ],
  },
  {
    key: 'obrigado',
    name: 'Página de obrigado',
    description: 'Para onde o formulário leva depois do envio: confirma, dá o próximo passo e mede a conversão.',
    goal: 'obrigado',
    theme: { header: 'logo' },
    seo: { title: 'Recebemos seu contato', noindex: true },
    blocks: [
      { type: 'hero', variant: 'centro', eyebrow: 'Recebemos seu contato', title: 'Obrigado! Em breve nossa equipe fala com você', subtitle: 'Se for urgente, chame agora no WhatsApp.', image: '', ctaText: 'Chamar no WhatsApp', action: 'whatsapp', note: '' },
      { type: 'texto', background: 'suave', title: 'Enquanto isso', text: 'Separe as informações do que você precisa (produto, quantidade e, se tiver, marca, modelo ou código). Isso agiliza o atendimento.' },
    ],
  },
  {
    key: 'cotizacion-latam',
    name: 'Cotización (América Latina, em espanhol)',
    description: 'Versão em espanhol do pedido de orçamento, para campanhas na América Latina.',
    goal: 'orcamento',
    theme: { header: 'logo-botao', headerCta: 'Solicitar cotización', whatsappMessage: '¡Hola! Vengo de la página {pagina} y quisiera una cotización.' },
    seo: { title: '[Producto o servicio] | Cotización', description: '[Describa en una frase lo que vende o hace la empresa y para quién.]' },
    blocks: [
      { type: 'hero', variant: 'imagem-direita', eyebrow: '[Su diferencial en pocas palabras]', title: '[Producto o servicio] con quien conoce del tema', subtitle: 'Cuéntenos lo que necesita y reciba una cotización de nuestro equipo. [Complete con los tipos de producto, marcas o servicios de la empresa.]', image: '', ctaText: 'Solicitar cotización', action: 'formulario', note: '[Región atendida, ej.: Atendemos toda América Latina]' },
      { type: 'beneficios', variant: 'cartoes', background: 'suave', title: '¿Por qué elegirnos?', subtitle: '', items: [{ icon: 'mundo', title: 'Alcance', text: '[Países o regiones donde atiende la empresa.]' }, { icon: 'estoque', title: 'Variedad', text: '[Tipos de producto, categorías o servicios que ofrece.]' }, { icon: 'suporte', title: 'Atención', text: 'Nuestro equipo responde sus dudas y le ayuda a elegir la mejor opción.' }, { icon: 'caminhao', title: 'Envío', text: '[Cómo funciona el envío y a dónde entrega.]' }] },
      { type: 'marcas', background: 'padrao', title: 'Marcas con las que trabajamos', items: BRANDS },
      { ...FORM('Solicite su cotización', 'Indique el producto que necesita y, si lo tiene, la marca, el modelo o el código.'), bullets: 'Respuesta de nuestro equipo\nAyuda para elegir la opción correcta\nCotización sin compromiso' },
      { type: 'cta', background: 'destaque', title: 'Reciba su cotización sin compromiso', text: 'Hable con nuestro equipo.', ctaText: 'Solicitar cotización', action: 'formulario', url: '' },
    ],
  },
]
