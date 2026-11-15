/**
 * CIGAM (Integrador, https://www.cigam.com.br/wiki/index.php/Integrador): web services no servidor do cliente (IIS),
 * em REST/JSON: POST http://servidor/<Servico>.integrador.ashx/<metodo>, parâmetros no corpo e o "pin" em toda
 * chamada. Materiais em CadastroMateriais.integrador (ListarMateriaisPaginada: pin, camposRetorno, filtro, pagina,
 * quantidadeRegistros; retornos codigoMaterial, descricao, codigoUnidadeMedida, precoCusto, precoPauta, tipo...),
 * estoque em ListarEstoqueOnLine (codigoMaterial, quantidadeOnline por centro de armazenagem) e preço de venda em
 * CadastroTabelaPreco.integrador (ListarPrecoTabela: codigoTabela; codigoMaterial, precoUnitario). Resposta com várias
 * linhas: coleção "col" (nome da coluna → apelido c1, c2...) e os registros com os apelidos. Só leitura.
 */
import { type ErpProductData, money, num, text } from '../erps'
import { formBody, sleep } from './oauth'
import type { ErpAdapter, ErpCtx } from './tipos'

const PAGE = 500
const MAX_PAGES = 2000
const GAP_MS = 200
const EMPTY = /n[ãa]o retornou nenhum registro/i
const NO_RIGHTS = /n[ãa]o possui direitos suficientes/i

/** Nome de coluna comparável: só letras e números, minúsculo (codigoMaterial = codigo_material). */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Registros da resposta do Integrador: com "col", troca os apelidos (c1, c2...) pelos nomes das colunas; sem "col"
 * (um registro só, sem cabeçalhos), usa os nomes como vieram. Devolve os registros com os nomes comparáveis (key).
 */
export function cigamRows(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return []
  const b = body as Record<string, unknown>
  const aliases = new Map<string, string>()
  const cols = Array.isArray(b.col) ? b.col : b.col && typeof b.col === 'object' ? [b.col] : []
  for (const c of cols) {
    if (!c || typeof c !== 'object') continue
    for (const [name, v] of Object.entries(c as Record<string, unknown>)) {
      const alias = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as Record<string, unknown>).db_alias : null
      if (typeof alias === 'string') aliases.set(alias, name)
    }
  }
  // Os registros ficam na outra chave (o nome lógico da tabela); sem ela, a própria resposta é o registro.
  const dataKey = Object.keys(b).find((k) => k !== 'col')
  const data = dataKey === undefined ? undefined : b[dataKey]
  const rows: unknown[] = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : cols.length ? [] : [b]
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [key(aliases.get(k) ?? k), v])))
}

async function call(ctx: ErpCtx, service: string, method: string, params: Record<string, string>) {
  let body: string
  try {
    body = await ctx.request(`${ctx.values.baseUrl}/${service}.integrador.ashx/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ pin: ctx.values.pin ?? '', ...params }),
    })
  } catch (e) {
    const b = String((e as { body?: string }).body ?? '')
    if (EMPTY.test(b)) return []
    if (NO_RIGHTS.test(b)) throw new Error('O CIGAM recusou o PIN: confira o PIN e os serviços liberados para ele no Integrador.')
    throw e
  }
  if (EMPTY.test(body)) return []
  if (NO_RIGHTS.test(body)) throw new Error('O CIGAM recusou o PIN: confira o PIN e os serviços liberados para ele no Integrador.')
  try {
    return cigamRows(JSON.parse(body))
  } catch {
    throw new Error('O Integrador do CIGAM respondeu algo que não é JSON. Confira o endereço (ex.: http://servidor/IntegradorCigam).')
  }
}

/** Material do CIGAM no formato do CRM (tipo A = ativo; I, O e N = inativo, obsoleto ou nulo). */
export function productFromCigam(r: Record<string, unknown>, stock: Map<string, number>, prices: Map<string, number>): ErpProductData | null {
  const code = text(r.codigomaterial, 80)
  const name = text(r.descricao, 300)
  if (!code || !name) return null
  const tipo = text(r.tipo, 2)
  return {
    code,
    name,
    ean: null,
    brand: null,
    category: text(r.codigogrupo, 40),
    ncm: null,
    unit: text(r.codigounidademedida, 10),
    price: prices.get(code) ?? money(r.precopauta),
    stock: stock.has(code) ? stock.get(code)! : null,
    cost: money(r.precocusto),
    active: !tipo || tipo === 'A',
    externalId: code,
  }
}

export const cigam: ErpAdapter = {
  def: {
    key: 'cigam',
    name: 'CIGAM',
    segment: 'ERP CIGAM (indústria, distribuição e varejo)',
    module: 'erp_cigam',
    howTo:
      'A integração usa o Integrador do CIGAM (web services no servidor da sua empresa). Peça ao seu TI ou à CIGAM: o endereço público do Integrador (com HTTPS, de preferência) e um PIN com acesso aos serviços CadastroMateriais e CadastroTabelaPreco. O servidor precisa estar acessível pela internet para o CRM consultar.',
    fields: [
      { key: 'baseUrl', label: 'Endereço do Integrador', url: true, placeholder: 'https://erp.suaempresa.com.br/IntegradorCigam', help: 'Endereço onde ficam os arquivos *.integrador.ashx.' },
      { key: 'pin', label: 'PIN do Integrador', secret: true },
      { key: 'tabelaPreco', label: 'Tabela de preço de venda', optional: true, placeholder: 'Código da tabela no CIGAM', help: 'Em branco, usa o preço de pauta do material.' },
    ],
  },
  async test(ctx) {
    const rows = await call(ctx, 'CadastroMateriais', 'ListarMateriaisPaginada', { camposRetorno: '', filtro: '', pagina: '1', quantidadeRegistros: '1' })
    const first = rows[0] ? productFromCigam(rows[0], new Map(), new Map()) : null
    if (first) return `Conexão OK. Primeiro material: ${first.code} — ${first.name}.`
    return rows[0] ? `Conexão OK, mas o material veio sem código ou descrição (colunas: ${Object.keys(rows[0]).slice(0, 12).join(', ')}).` : 'Conexão OK, mas o CIGAM não devolveu materiais.'
  },
  async sync(ctx, onPage) {
    // Estoque on-line: soma dos centros de armazenagem por material. Sem permissão para o método, segue sem estoque.
    const stock = new Map<string, number>()
    for (const r of await call(ctx, 'CadastroMateriais', 'ListarEstoqueOnLine', {}).catch(() => [])) {
      const code = text(r.codigomaterial, 80)
      const q = num(r.quantidadeonline)
      if (code && q !== null) stock.set(code, (stock.get(code) ?? 0) + q)
    }
    const prices = new Map<string, number>()
    if (ctx.values.tabelaPreco) {
      for (const r of await call(ctx, 'CadastroTabelaPreco', 'ListarPrecoTabela', { codigoTabela: ctx.values.tabelaPreco })) {
        const code = text(r.codigomaterial, 80)
        const p = money(r.precounitario)
        if (code && p !== null) prices.set(code, p)
      }
    }
    for (let p = 1; p <= MAX_PAGES; p++) {
      const rows = await call(ctx, 'CadastroMateriais', 'ListarMateriaisPaginada', { camposRetorno: '', filtro: '', pagina: String(p), quantidadeRegistros: String(PAGE) })
      const list = rows.map((r) => productFromCigam(r, stock, prices)).filter((x): x is ErpProductData => !!x)
      if (list.length) await onPage(list)
      if (rows.length < PAGE) return
      await sleep(GAP_MS)
    }
    throw new Error('O CIGAM devolveu páginas demais: cópia interrompida.')
  },
}
