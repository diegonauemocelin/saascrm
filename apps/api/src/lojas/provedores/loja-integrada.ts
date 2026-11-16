/**
 * Loja Integrada. Só leitura (GET). Documentação: api-docs.lojaintegrada.com.br (OpenAPI).
 *
 * - Sem OAuth: cabeçalho "Authorization: chave_api {chave da loja} aplicacao {chave de aplicação}".
 * - Base https://api.awsli.com.br. Paginação limit/offset; meta.next indica a próxima página.
 * - Limites: 100 requisições por minuto por loja (chave_api) → 700 ms entre chamadas.
 * - Sem API de carrinhos abandonados.
 */
import { ext, email, https, money, num, parseDate, str, type LojaOrder, type LojaProduct, type OrderGroup } from '../lojas'
import type { CustomerData, OrderLine } from '../../integracoes/magazord'
import type { LojaAdapter, LojaCtx, Page } from './tipos'
import { arr, brDateTime, getWithRetry, httpError, obj, parseJson, rawId, yearsAgo } from './comum'

const KEY = 'loja_integrada' as const
const API = 'https://api.awsli.com.br'
const PAUSE = 700
/** Pedidos: "o máximo aceito é 50". Clientes e produtos: cada um ainda pede o detalhe, então páginas menores. */
const ORDER_LIMIT = 50
const LIMIT = 20

// ---------- Mapeamento (funções puras) ----------

/** Id no fim de um resource_uri ("/api/v1/cliente/34220641" → "34220641"). */
export function liIdFromUri(v: unknown): string | null {
  if (typeof v === 'number') return String(v)
  const m = /\/(\d+)\/?(?:\?.*)?$/.exec(String(v ?? ''))
  return m?.[1] ?? null
}

/** Cliente (lista/busca ou GET /v1/cliente/{id}). Não lê cpf, cnpj, rg nem ie. */
export function customerFromLojaIntegrada(c: Record<string, unknown>): CustomerData | null {
  const id = str(c?.id, 40) ?? liIdFromUri(c?.resource_uri)
  if (!id) return null
  const addrs = arr(c.enderecos).map(obj)
  const addr = addrs.find((a) => a.principal === true) ?? addrs[0] ?? {}
  return {
    externalId: ext(KEY, id),
    name: str(c.nome, 160),
    email: email(c.email),
    phone: str(c.telefone_celular, 40) ?? str(c.telefone_principal, 40) ?? str(c.telefone_comercial, 40),
    company: str(c.razao_social, 160),
    city: str(addr.cidade, 80),
    state: str(addr.estado, 40),
    registeredAt: parseDate(c.data_criacao),
  }
}

/**
 * Grupo pela situação do pedido (objeto `situacao` com as marcas da documentação): cancelado → 'cancelado';
 * aprovado → 'pago'; códigos de espera de pagamento → 'pendente'. "pedido_chargeback" vem com aprovado=true, mas o
 * pagamento foi contestado: conta como 'cancelado'.
 */
export function lojaIntegradaStatus(s: unknown): { name: string; group: OrderGroup } {
  const o = obj(s)
  const code = String(o.codigo ?? '').toLowerCase()
  const name = str(o.nome, 80) ?? (code || 'Sem situação')
  if (o.cancelado === true || code === 'pedido_chargeback') return { name, group: 'cancelado' }
  if (o.aprovado === true) return { name, group: 'pago' }
  if (['aguardando_pagamento', 'pagamento_em_analise', 'pedido_efetuado'].includes(code)) return { name, group: 'pendente' }
  return { name, group: 'outro' }
}

/** Itens de GET /v1/pedido/{numero} (itens[]): preco_venda é o preço unitário. */
export function orderLinesFromLojaIntegrada(itens: unknown): OrderLine[] {
  const out: OrderLine[] = []
  for (const raw of arr(itens)) {
    const i = obj(raw)
    const quantity = Math.round(num(i.quantidade) ?? 0)
    if (quantity <= 0) continue
    const unit = money(i.preco_venda) ?? money(i.preco_promocional) ?? money(i.preco_cheio) ?? 0
    out.push({ sku: str(i.sku, 60), name: str(i.nome, 200) ?? 'Produto sem nome', brand: null, quantity, total: Math.round(unit * quantity * 100) / 100 })
  }
  return out
}

/** Pedido (GET /v1/pedido/search; ou o detalhe, que traz cliente, pagamentos e itens). O id usado é o número. */
export function orderFromLojaIntegrada(o: Record<string, unknown>): LojaOrder | null {
  const numero = str(o?.numero, 40) ?? liIdFromUri(o?.resource_uri)
  if (!numero) return null
  const st = lojaIntegradaStatus(o.situacao)
  const cliente = o.cliente
  const detail = cliente && typeof cliente === 'object' ? customerFromLojaIntegrada(obj(cliente)) : null
  const cid = detail ? detail.externalId : (() => {
    const id = liIdFromUri(cliente)
    return id ? ext(KEY, id) : null
  })()
  const pay = obj(arr(o.pagamentos)[0])
  return {
    externalId: ext(KEY, numero),
    code: numero,
    customerId: cid,
    customer: detail,
    orderedAt: parseDate(o.data_criacao) ?? new Date(),
    total: money(o.valor_total) ?? 0,
    statusName: st.name,
    statusGroup: st.group,
    payment: str(obj(pay.forma_pagamento).nome, 80),
    channel: null,
    items: Array.isArray(o.itens) ? orderLinesFromLojaIntegrada(o.itens) : null,
  }
}

/**
 * Produto: linha da lista (GET /v1/produto) completada com o detalhe (GET /v1/produto/{id}, que traz preco_cheio,
 * preco_promocional, estoque_quantidade e imagem_principal) ou com /v1/produto_preco e /v1/produto_estoque.
 * Variação (tipo "atributo_opcao") pode vir sem nome: usa o nome do produto pai, se conhecido.
 */
export function productFromLojaIntegrada(
  row: Record<string, unknown>,
  extra: { detail?: Record<string, unknown> | null; price?: Record<string, unknown> | null; stock?: Record<string, unknown> | null; parentName?: string | null } = {},
): LojaProduct | null {
  const d = { ...row, ...(extra.detail ?? {}) }
  const id = str(d.id, 40)
  if (!id) return null
  const name = str(d.nome, 200) ?? str(extra.parentName, 200) ?? str(d.apelido, 200) ?? str(d.sku, 200)
  if (!name) return null
  const price = extra.price ?? null
  const onRequest = d.preco_sob_consulta === true || price?.sob_consulta === true
  const full = onRequest ? null : (money(d.preco_cheio) ?? money(price?.cheio))
  const promo = onRequest ? null : (money(d.preco_promocional) ?? money(price?.promocional))
  const onSale = promo !== null && promo > 0 && full !== null && promo < full
  const stockObj = extra.stock ?? null
  const managed = d.estoque_gerenciado ?? stockObj?.gerenciado
  const qty = num(d.estoque_quantidade) ?? num(stockObj?.quantidade_disponivel) ?? num(stockObj?.quantidade)
  const img = obj(d.imagem_principal)
  return {
    externalId: ext(KEY, id),
    code: (str(d.sku, 60) ?? id).slice(0, 60),
    name: name.slice(0, 200),
    brand: null,
    price: onSale ? promo : full,
    priceFrom: onSale ? full : null,
    stock: managed === false || qty === null ? null : Math.trunc(qty),
    image: https(img.grande) ?? https(img.media),
    url: https(d.url),
    active: d.ativo !== false && d.removido !== true && d.bloqueado !== true,
  }
}

// ---------- Chamadas ----------

function headers(ctx: LojaCtx) {
  const api = (ctx.values.chaveApi ?? '').trim()
  const app = (ctx.values.chaveAplicacao ?? '').trim()
  if (!api || !app || /\s/.test(api + app)) throw new Error('Loja Integrada: preencha a chave de API e a chave de aplicação.')
  return { Authorization: `chave_api ${api} aplicacao ${app}`, Accept: 'application/json' }
}

async function getJson(ctx: LojaCtx, path: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString()
  const r = await getWithRetry(ctx, `${API}${path}${q ? `?${q}` : ''}`, headers(ctx), PAUSE)
  return { r, json: parseJson(r.body) }
}

async function list(ctx: LojaCtx, path: string, params: Record<string, string>, page: number, limit: number) {
  const { r, json } = await getJson(ctx, path, { ...params, limit: String(limit), offset: String((Math.max(1, page) - 1) * limit) })
  if (r.status === 404) return { rows: [] as Record<string, unknown>[], more: false }
  if (r.status !== 200) throw httpError('Loja Integrada', r)
  const j = obj(json)
  const rows = arr(j.objects).map(obj)
  return { rows, more: rows.length > 0 && !!obj(j.meta).next }
}

async function detail(ctx: LojaCtx, path: string): Promise<Record<string, unknown> | null> {
  const { r, json } = await getJson(ctx, path)
  return r.status === 200 ? obj(json) : null
}

export const lojaIntegrada: LojaAdapter = {
  def: {
    key: KEY,
    name: 'Loja Integrada',
    oauth: false,
    fields: [
      { key: 'chaveApi', label: 'Chave de API da loja', secret: true, help: 'No painel da Loja Integrada: Configurações > Integração via API (chave de API).' },
      {
        key: 'chaveAplicacao',
        label: 'Chave de aplicação',
        secret: true,
        help: 'Chave de aplicação do integrador. A Loja Integrada pode restringir essa chave por IP: libere o IP do servidor do CRM.',
      },
    ],
    appFields: [],
    supports: { customers: true, orders: true, carts: false, cartLink: false, products: true },
    howTo:
      'No painel da Loja Integrada, gere a chave de API da loja e informe também a chave de aplicação. Cole as duas aqui e clique em Testar. ' +
      'O CRM passa a ler clientes, pedidos e produtos. A Loja Integrada não fornece carrinhos abandonados pela API. ' +
      'A leitura respeita o limite de 100 consultas por minuto da loja, então a primeira importação pode demorar. O CRM só lê dados: nada é alterado na sua loja.',
  },

  async test(ctx) {
    const { r, json } = await getJson(ctx, '/v1/produto', { limit: '1' })
    if (r.status !== 200) throw httpError('Loja Integrada', r)
    const total = num(obj(obj(json).meta).total_count)
    return total === null ? 'Conectado à Loja Integrada.' : `Conectado à Loja Integrada (${total} produto${total === 1 ? '' : 's'}).`
  },

  /**
   * Com `since`: GET /v1/cliente/search?since_atualizado=AAAA-MM-DDThh:mm:ss. Sem `since`: GET /v1/cliente. A lista não
   * traz telefone nem endereço: cada cliente é completado com GET /v1/cliente/{id}.
   */
  async customers(ctx, since, page): Promise<Page<CustomerData>> {
    const { rows, more } = since
      ? await list(ctx, '/v1/cliente/search', { since_atualizado: brDateTime(since) }, page, LIMIT)
      : await list(ctx, '/v1/cliente', {}, page, LIMIT)
    const items: CustomerData[] = []
    for (const row of rows) {
      const id = str(row.id, 40) ?? liIdFromUri(row.resource_uri)
      const full = id && /^\d+$/.test(id) ? await detail(ctx, `/v1/cliente/${id}`) : null
      const c = customerFromLojaIntegrada(full ?? row)
      if (c) items.push(c)
    }
    return { items, more }
  },

  /** GET /v1/pedido/search?since_atualizado=... (sem `since`: últimos 2 anos). Itens e pagamento no detalhe (orderItems). */
  async orders(ctx, since, page): Promise<Page<LojaOrder>> {
    const { rows, more } = await list(ctx, '/v1/pedido/search', { since_atualizado: brDateTime(since ?? yearsAgo(2)) }, page, ORDER_LIMIT)
    return { items: rows.map(orderFromLojaIntegrada).filter((o): o is LojaOrder => !!o), more }
  },

  async orderItems(ctx, externalId) {
    const id = rawId(externalId)
    if (!/^\d{1,20}$/.test(id)) return null
    const d = await detail(ctx, `/v1/pedido/${id}`)
    return d ? orderLinesFromLojaIntegrada(d.itens) : null
  },

  async products(ctx, page): Promise<Page<LojaProduct>> {
    const { rows, more } = await list(ctx, '/v1/produto', {}, page, LIMIT)
    const names = new Map<string, string>()
    for (const r of rows) {
      const n = str(r.nome, 200)
      for (const f of arr(r.filhos)) {
        const fid = liIdFromUri(f)
        if (fid && n) names.set(fid, n)
      }
    }
    const items: LojaProduct[] = []
    for (const row of rows) {
      const id = str(row.id, 40)
      if (!id || !/^\d+$/.test(id)) continue
      let d: Record<string, unknown> | null = null
      let price: Record<string, unknown> | null = null
      let stock: Record<string, unknown> | null = null
      if (row.removido !== true) {
        d = await detail(ctx, `/v1/produto/${id}`)
        if (!d || !('preco_cheio' in d)) {
          price = await detail(ctx, `/v1/produto_preco/${id}`)
          stock = await detail(ctx, `/v1/produto_estoque/${id}`)
        }
      }
      const p = productFromLojaIntegrada(row, { detail: d, price, stock, parentName: names.get(id) ?? null })
      if (p) items.push(p)
    }
    return { items, more }
  },
}
