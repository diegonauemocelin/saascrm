/**
 * Tiny ERP / Olist ERP (API v3, https://api-docs.erp.olist.com): OAuth2 pelo accounts.tiny.com.br (credenciais no
 * corpo; token de acesso de 4 h e refresh de 1 dia), produtos em GET /produtos (limit, offset; itens com id, sku,
 * descricao, situacao A/I/E, unidade, gtin, precos.preco/precoCusto/precoCustoMedio) e saldos em GET /estoque (itens
 * com idProduto, saldo, disponivel). Limite a partir de 30 leituras por minuto. Só leitura.
 */
import { digitsOrNull, type ErpProductData, money, num, text } from '../erps'
import { accessToken, formBody, saveTokens, sleep, tokensFrom } from './oauth'
import type { ErpAdapter, ErpCtx } from './tipos'

const API = 'https://api.tiny.com.br/public-api/v3'
const OIDC = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect'
const PAGE = 100
/** 30 leituras por minuto no plano de entrada: uma a cada 2,1 s. */
const GAP_MS = 2100
const MAX_PAGES = 3000

async function token(ctx: ErpCtx) {
  return accessToken(ctx, 'Tiny', (refresh) =>
    ctx.request(`${OIDC}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ grant_type: 'refresh_token', client_id: ctx.values.clientId ?? '', client_secret: ctx.values.clientSecret ?? '', refresh_token: refresh }),
    }),
  )
}

async function get(ctx: ErpCtx, path: string) {
  const t = await token(ctx)
  const body = await ctx.request(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })
  try {
    return JSON.parse(body) as { itens?: unknown }
  } catch {
    throw new Error('O Tiny respondeu algo que não é JSON.')
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Item de GET /produtos no formato do CRM (o estoque vem de GET /estoque). Excluídos ficam de fora. */
export function productFromTiny(r: Record<string, unknown>, stock: Map<string, number>): ErpProductData | null {
  const code = text(r.sku, 80)
  const name = text(r.descricao, 300)
  if (!code || !name || r.situacao === 'E') return null
  const precos = obj(r.precos)
  const id = r.id === undefined || r.id === null ? null : String(r.id)
  const cat = obj(r.categoria)
  return {
    code,
    name,
    ean: digitsOrNull(r.gtin, 8, 14),
    brand: null,
    category: text(cat.caminhoCompleto ?? cat.nome, 120),
    ncm: null,
    unit: text(r.unidade, 10),
    price: money(precos.preco),
    stock: id !== null && stock.has(id) ? stock.get(id)! : null,
    cost: money(precos.precoCustoMedio) ?? money(precos.precoCusto),
    active: r.situacao !== 'I',
    externalId: id,
  }
}

/** Saldo por produto: o disponível (saldo menos reservado), ou o saldo. */
export function stockFromTiny(r: Record<string, unknown>): [string, number] | null {
  const id = r.idProduto === undefined || r.idProduto === null ? null : String(r.idProduto)
  const v = num(r.disponivel) ?? num(r.saldo)
  return id && v !== null ? [id, v] : null
}

async function paged(ctx: ErpCtx, path: string, each: (rows: Record<string, unknown>[]) => Promise<void>) {
  for (let i = 0; i < MAX_PAGES; i++) {
    const r = await get(ctx, `${path}${path.includes('?') ? '&' : '?'}limit=${PAGE}&offset=${i * PAGE}`)
    const rows = Array.isArray(r.itens) ? (r.itens as Record<string, unknown>[]) : []
    if (rows.length) await each(rows)
    if (rows.length < PAGE) return
    await sleep(GAP_MS)
  }
  throw new Error('O Tiny devolveu páginas demais: cópia interrompida.')
}

export const tiny: ErpAdapter = {
  def: {
    key: 'tiny',
    name: 'Tiny',
    segment: 'Tiny ERP / Olist ERP (varejo e e-commerce)',
    module: 'erp_tiny',
    oauth: true,
    howTo:
      'No Tiny (Olist ERP), cadastre um aplicativo da API v3 (veja na ajuda do Tiny: "Aplicativos API v3: configurações e utilização"). Como endereço de redirecionamento do aplicativo, cole o endereço de retorno mostrado abaixo. Copie o Client ID e o Client Secret para cá, salve e clique em Conectar para autorizar. O Tiny pede nova autorização se a integração ficar mais de 1 dia sem rodar.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'tiny-api-...' },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
    ],
  },
  authorizeUrl(values, redirectUri, state) {
    return `${OIDC}/auth?${new URLSearchParams({ client_id: values.clientId ?? '', redirect_uri: redirectUri, scope: 'openid', response_type: 'code', state }).toString()}`
  },
  async exchangeCode(ctx, code, redirectUri) {
    const body = await ctx.request(`${OIDC}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ grant_type: 'authorization_code', client_id: ctx.values.clientId ?? '', client_secret: ctx.values.clientSecret ?? '', redirect_uri: redirectUri, code }),
    })
    await saveTokens(ctx, tokensFrom(body))
  },
  async test(ctx) {
    const r = await get(ctx, `/produtos?limit=1&offset=0`)
    const first = Array.isArray(r.itens) && r.itens[0] ? productFromTiny(r.itens[0] as Record<string, unknown>, new Map()) : null
    return first ? `Conexão OK. Primeiro produto: ${first.code} — ${first.name}.` : 'Conexão OK, mas o Tiny não devolveu produtos.'
  },
  async sync(ctx, onPage) {
    const stock = new Map<string, number>()
    await paged(ctx, '/estoque', async (rows) => {
      for (const r of rows) {
        const s = stockFromTiny(r)
        if (s) stock.set(s[0], s[1])
      }
    })
    await sleep(GAP_MS)
    await paged(ctx, '/produtos', async (rows) => {
      const list = rows.map((r) => productFromTiny(r, stock)).filter((p): p is ErpProductData => !!p)
      if (list.length) await onPage(list)
    })
  },
}
