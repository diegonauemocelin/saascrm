/**
 * Bling (API v3, https://developer.bling.com.br): OAuth2 (authorization code + refresh token, Basic com
 * client_id:client_secret, JWT com "enable-jwt: 1"), produtos em GET /produtos (pagina, limite, criterio 2 = ativos e
 * 3 = inativos; itens com id, codigo, nome, preco, precoCusto, situacao, estoque.saldoVirtualTotal). Limite: 3
 * requisições por segundo por conta. Só leitura.
 */
import { type ErpProductData, money, num, text } from '../erps'
import { accessToken, formBody, saveTokens, sleep, tokensFrom } from './oauth'
import type { ErpAdapter, ErpCtx } from './tipos'

const API = 'https://api.bling.com.br/Api/v3'
const AUTH = 'https://www.bling.com.br/Api/v3/oauth/authorize'
const PAGE = 100
/** 3 requisições por segundo: uma a cada 400 ms dá folga. */
const GAP_MS = 400
const MAX_PAGES = 2000

const basic = (v: Record<string, string>) => `Basic ${Buffer.from(`${v.clientId}:${v.clientSecret}`).toString('base64')}`

async function token(ctx: ErpCtx) {
  return accessToken(ctx, 'Bling', (refresh) =>
    ctx.request(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0', Authorization: basic(ctx.values), 'enable-jwt': '1' },
      body: formBody({ grant_type: 'refresh_token', refresh_token: refresh }),
    }),
  )
}

async function get(ctx: ErpCtx, path: string) {
  const t = await token(ctx)
  const body = await ctx.request(`${API}${path}`, { headers: { Authorization: `Bearer ${t}`, 'enable-jwt': '1' } })
  try {
    return JSON.parse(body) as { data?: unknown }
  } catch {
    throw new Error('O Bling respondeu algo que não é JSON.')
  }
}

/** Item da listagem de produtos do Bling no formato do CRM (marca e EAN só vêm no detalhe: ficam vazios). */
export function productFromBling(r: Record<string, unknown>): ErpProductData | null {
  const code = text(r.codigo, 80)
  const name = text(r.nome, 300)
  if (!code || !name) return null
  const estoque = r.estoque && typeof r.estoque === 'object' ? (r.estoque as Record<string, unknown>) : {}
  return {
    code,
    name,
    ean: null,
    brand: null,
    category: null,
    ncm: null,
    unit: null,
    price: money(r.preco),
    stock: num(estoque.saldoVirtualTotal),
    cost: money(r.precoCusto),
    active: r.situacao !== 'I',
    externalId: r.id === undefined || r.id === null ? null : String(r.id),
  }
}

export const bling: ErpAdapter = {
  def: {
    key: 'bling',
    name: 'Bling',
    segment: 'ERP Bling (varejo e e-commerce)',
    module: 'erp_bling',
    oauth: true,
    howTo:
      'No Bling, abra a Central de Extensões › Área do integrador e crie um aplicativo (somente leitura de produtos e estoque). No campo "Link de redirecionamento" do aplicativo, cole o endereço de retorno mostrado abaixo. Copie o Client ID e o Client Secret para cá, salve e clique em Conectar para autorizar o acesso na conta do Bling.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Client ID do aplicativo no Bling' },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
    ],
  },
  authorizeUrl(values, _redirectUri, state) {
    return `${AUTH}?${new URLSearchParams({ response_type: 'code', client_id: values.clientId ?? '', state }).toString()}`
  },
  async exchangeCode(ctx, code) {
    const body = await ctx.request(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0', Authorization: basic(ctx.values), 'enable-jwt': '1' },
      body: formBody({ grant_type: 'authorization_code', code }),
    })
    await saveTokens(ctx, tokensFrom(body))
  },
  async test(ctx) {
    const r = await get(ctx, `/produtos?pagina=1&limite=1`)
    const first = Array.isArray(r.data) && r.data[0] ? productFromBling(r.data[0] as Record<string, unknown>) : null
    return first ? `Conexão OK. Primeiro produto: ${first.code} — ${first.name}.` : 'Conexão OK, mas o Bling não devolveu produtos.'
  },
  async sync(ctx, onPage) {
    // Ativos (criterio 2) e inativos (criterio 3).
    for (const criterio of [2, 3]) {
      for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
        const r = await get(ctx, `/produtos?pagina=${pagina}&limite=${PAGE}&criterio=${criterio}`)
        const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []
        const list = rows.map(productFromBling).filter((p): p is ErpProductData => !!p)
        if (list.length) await onPage(list)
        if (rows.length < PAGE) break
        if (pagina === MAX_PAGES) throw new Error('O Bling devolveu páginas demais: cópia interrompida.')
        await sleep(GAP_MS)
      }
    }
  },
}
