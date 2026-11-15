/**
 * Omie (https://app.omie.com.br/api/v1/...): chamadas POST em JSON { call, app_key, app_secret, param: [...] }.
 * Produtos em geral/produtos/ (ListarProdutos: pagina, registros_por_pagina; produto_servico_cadastro com
 * codigo_produto, codigo, descricao, unidade, ncm, ean, valor_unitario, marca, descricao_familia, inativo) e estoque em
 * estoque/consulta/ (ListarPosEstoque: nPagina, nRegPorPagina, dDataPosicao; produtos com nCodProd, nSaldo e nCMC, o
 * custo médio contábil). Limite: 240 chamadas por minuto por método. Só leitura.
 */
import { digitsOrNull, type ErpProductData, money, num, text } from '../erps'
import { sleep } from './oauth'
import type { ErpAdapter, ErpCtx } from './tipos'

const API = 'https://app.omie.com.br/api/v1'
const PAGE = 100
const GAP_MS = 400
const MAX_PAGES = 3000

/** Data de hoje no formato da Omie (dd/mm/aaaa), no fuso de Brasília. */
export function omieDate(d = new Date()) {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** "Não existem registros para a página" encerra a paginação; outros erros da Omie viram mensagem. */
function omieError(e: unknown): { empty: boolean; message: string } {
  const body = String((e as { body?: string }).body ?? '')
  let fault = ''
  try {
    const j = JSON.parse(body) as { faultstring?: string }
    fault = j.faultstring ?? ''
  } catch {
    // corpo não é JSON
  }
  if (/n[ãa]o existem registros/i.test(fault)) return { empty: true, message: fault }
  return { empty: false, message: fault ? `Omie: ${fault.replace(/^ERROR:\s*/i, '').slice(0, 300)}` : (e as Error).message }
}

async function call<T>(ctx: ErpCtx, path: string, method: string, param: Record<string, unknown>): Promise<T | null> {
  try {
    const body = await ctx.request(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call: method, app_key: ctx.values.appKey ?? '', app_secret: ctx.values.appSecret ?? '', param: [param] }),
    })
    return JSON.parse(body) as T
  } catch (e) {
    const f = omieError(e)
    if (f.empty) return null
    throw new Error(f.message)
  }
}

/** Produto da Omie no formato do CRM (o saldo e o custo médio vêm da posição de estoque). */
export function productFromOmie(r: Record<string, unknown>, stock: Map<string, { saldo: number | null; cmc: number | null }>): ErpProductData | null {
  const code = text(r.codigo, 80)
  const name = text(r.descricao, 300)
  if (!code || !name) return null
  const id = r.codigo_produto === undefined || r.codigo_produto === null ? null : String(r.codigo_produto)
  const s = id ? stock.get(id) : undefined
  return {
    code,
    name,
    ean: digitsOrNull(r.ean, 8, 14),
    brand: text(r.marca, 120),
    category: text(r.descricao_familia, 120),
    ncm: digitsOrNull(r.ncm, 8, 8),
    unit: text(r.unidade, 10),
    price: money(r.valor_unitario),
    stock: s?.saldo ?? null,
    cost: s?.cmc ?? null,
    active: r.inativo !== 'S',
    externalId: id,
  }
}

type ProdutosPage = { total_de_paginas?: number; produto_servico_cadastro?: Record<string, unknown>[] }
type EstoquePage = { nTotPaginas?: number; produtos?: Record<string, unknown>[] }

export const omie: ErpAdapter = {
  def: {
    key: 'omie',
    name: 'Omie',
    segment: 'ERP Omie (gestão para pequenas e médias empresas)',
    module: 'erp_omie',
    howTo:
      'Cole a App Key e o App Secret do aplicativo da sua empresa na Omie (veja na ajuda da Omie como obter as chaves de acesso à API). O CRM só consulta produtos e a posição de estoque. Confira com a Omie as regras de uso da API do seu plano.',
    fields: [
      { key: 'appKey', label: 'App Key', placeholder: 'App Key da Omie' },
      { key: 'appSecret', label: 'App Secret', secret: true },
    ],
  },
  async test(ctx) {
    const r = await call<ProdutosPage>(ctx, '/geral/produtos/', 'ListarProdutos', { pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' })
    const first = r?.produto_servico_cadastro?.[0] ? productFromOmie(r.produto_servico_cadastro[0], new Map()) : null
    return first ? `Conexão OK. Primeiro produto: ${first.code} — ${first.name}.` : 'Conexão OK, mas a Omie não devolveu produtos.'
  },
  async sync(ctx, onPage) {
    const stock = new Map<string, { saldo: number | null; cmc: number | null }>()
    const today = omieDate()
    for (let p = 1; p <= MAX_PAGES; p++) {
      const r = await call<EstoquePage>(ctx, '/estoque/consulta/', 'ListarPosEstoque', { nPagina: p, nRegPorPagina: PAGE, dDataPosicao: today, cExibeTodos: 'N' })
      for (const x of r?.produtos ?? []) if (x.nCodProd !== undefined && x.nCodProd !== null) stock.set(String(x.nCodProd), { saldo: num(x.nSaldo), cmc: money(x.nCMC) })
      if (!r || p >= (r.nTotPaginas ?? 1)) break
      await sleep(GAP_MS)
    }
    for (let p = 1; p <= MAX_PAGES; p++) {
      await sleep(GAP_MS)
      const r = await call<ProdutosPage>(ctx, '/geral/produtos/', 'ListarProdutos', { pagina: p, registros_por_pagina: PAGE, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' })
      const list = (r?.produto_servico_cadastro ?? []).map((x) => productFromOmie(x, stock)).filter((x): x is ErpProductData => !!x)
      if (list.length) await onPage(list)
      if (!r || p >= (r.total_de_paginas ?? 1)) return
    }
    throw new Error('A Omie devolveu páginas demais: cópia interrompida.')
  },
}
