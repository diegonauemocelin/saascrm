import { describe, expect, it } from 'vitest'
import { cleanErpSettings, DEFAULT_ERP_STATE, fullDue, money, normalizeServerUrl, num, searchTextOf } from '../src/erps/erps'
import { bling, productFromBling } from '../src/erps/provedores/bling'
import { cigamRows, productFromCigam } from '../src/erps/provedores/cigam'
import { accessToken, tokensFrom } from '../src/erps/provedores/oauth'
import { omieDate, productFromOmie } from '../src/erps/provedores/omie'
import { productFromTiny, stockFromTiny } from '../src/erps/provedores/tiny'
import type { ErpCtx } from '../src/erps/provedores/tipos'

describe('integrações com ERP: regras comuns', () => {
  it('lê números em formato brasileiro e americano', () => {
    expect(num('1.234,56')).toBe(1234.56)
    expect(num('1234.56')).toBe(1234.56)
    expect(num(12)).toBe(12)
    expect(num('')).toBeNull()
    expect(money('-3')).toBeNull()
    expect(money('10,555')).toBe(10.56)
  })

  it('limpa a configuração (horas e nomes dos campos)', () => {
    const s = cleanErpSettings({ enabled: true, fullEveryHours: 99, values: { token: 'x', 'mal nome': 'y' } as Record<string, string> })
    expect(s.fullEveryHours).toBe(6)
    expect(s.values).toEqual({ token: 'x' })
    expect(cleanErpSettings({ fullEveryHours: 12 }).fullEveryHours).toBe(12)
  })

  it('cópia completa vencida', () => {
    const now = new Date('2026-11-15T12:00:00Z')
    const s = cleanErpSettings({ fullEveryHours: 6 })
    expect(fullDue(now, DEFAULT_ERP_STATE, s)).toBe(true)
    expect(fullDue(now, { ...DEFAULT_ERP_STATE, lastFullAt: '2026-11-15T07:00:00Z' }, s)).toBe(false)
    expect(fullDue(now, { ...DEFAULT_ERP_STATE, lastFullAt: '2026-11-15T05:59:00Z' }, s)).toBe(true)
  })

  it('endereço do servidor do ERP', () => {
    expect(normalizeServerUrl('erp.empresa.com.br:8080/api/')).toBe('http://erp.empresa.com.br:8080/api')
    expect(() => normalizeServerUrl('http://user:senha@x.com')).toThrow()
    expect(() => normalizeServerUrl('http://x.com/?a=1')).toThrow()
  })

  it('texto de busca sem acento', () => {
    expect(searchTextOf({ code: 'A1', name: 'Pão de Açúcar', ean: null, brand: 'Ótima', category: null })).toBe('a1 pao de acucar otima')
  })
})


const fakeCtx = (values: Record<string, string>, respond: (url: string, o: { method?: string; body?: string; headers?: Record<string, string> }) => string) => {
  const calls: { url: string; body?: string; headers?: Record<string, string> }[] = []
  const ctx: ErpCtx = {
    values: { ...values },
    request: async (url, o = {}) => {
      calls.push({ url, body: o.body, headers: o.headers })
      return respond(url, o)
    },
    save: async (patch) => void Object.assign(ctx.values, patch),
  }
  return { ctx, calls }
}

describe('Bling', () => {
  it('item da listagem vira produto (preço, custo, saldo e situação)', () => {
    expect(productFromBling({ id: 12, codigo: 'ABC', nome: 'Filtro', preco: 10.5, precoCusto: 6, situacao: 'A', estoque: { saldoVirtualTotal: 7 } })).toMatchObject({ code: 'ABC', name: 'Filtro', price: 10.5, cost: 6, stock: 7, active: true, externalId: '12' })
    expect(productFromBling({ codigo: 'X', nome: 'Y', situacao: 'I' })!.active).toBe(false)
    expect(productFromBling({ nome: 'sem código' })).toBeNull()
  })

  it('renova o token vencido e pagina ativos e inativos', async () => {
    const { ctx, calls } = fakeCtx({ clientId: 'id', clientSecret: 'sec', accessToken: 'velho', refreshToken: 'r1', expiresAt: '0' }, (url) => {
      if (url.endsWith('/oauth/token')) return JSON.stringify({ access_token: 'novo', refresh_token: 'r2', expires_in: 21600 })
      return JSON.stringify({ data: url.includes('pagina=1&') && url.includes('criterio=2') ? [{ id: 1, codigo: 'A', nome: 'Um', situacao: 'A' }] : [] })
    })
    const got: string[] = []
    await bling.sync(ctx, async (rows) => void got.push(...rows.map((r) => r.code)))
    expect(got).toEqual(['A'])
    expect(ctx.values.accessToken).toBe('novo')
    expect(ctx.values.refreshToken).toBe('r2')
    const tokenCall = calls.find((c) => c.url.endsWith('/oauth/token'))!
    expect(tokenCall.headers!.Authorization).toBe(`Basic ${Buffer.from('id:sec').toString('base64')}`)
    expect(tokenCall.body).toBe('grant_type=refresh_token&refresh_token=r1')
    expect(calls.filter((c) => c.url.includes('/produtos')).map((c) => c.headers!.Authorization)).toEqual(['Bearer novo', 'Bearer novo'])
  })

  it('sem autorização pede para conectar', async () => {
    const { ctx } = fakeCtx({}, () => '')
    await expect(accessToken(ctx, 'Bling', async () => '')).rejects.toThrow(/Conectar/)
    expect(() => tokensFrom('{"access_token":"a"}')).toThrow()
  })
})

describe('Tiny (v3)', () => {
  it('produto com o saldo disponível do /estoque; excluídos ficam de fora', () => {
    const stock = new Map([stockFromTiny({ idProduto: 5, saldo: 10, disponivel: 8 })!])
    expect(productFromTiny({ id: 5, sku: 'S1', descricao: 'Peça', situacao: 'A', unidade: 'UN', gtin: '7891234567895', precos: { preco: 20, precoCusto: 9, precoCustoMedio: 9.5 }, categoria: { nome: 'Filtros', caminhoCompleto: 'Motor > Filtros' } }, stock)).toMatchObject({ code: 'S1', stock: 8, cost: 9.5, price: 20, ean: '7891234567895', category: 'Motor > Filtros', unit: 'UN' })
    expect(productFromTiny({ id: 6, sku: 'S2', descricao: 'X', situacao: 'E' }, stock)).toBeNull()
  })
})

describe('Omie', () => {
  it('produto com saldo e custo médio da posição de estoque', () => {
    const stock = new Map([['99', { saldo: 3, cmc: 12.34 }]])
    expect(productFromOmie({ codigo_produto: 99, codigo: 'P-1', descricao: 'Bomba', unidade: 'UN', ncm: '8413.30.30', ean: '', valor_unitario: 150, marca: 'X', descricao_familia: 'Hidráulica', inativo: 'N' }, stock)).toMatchObject({ code: 'P-1', stock: 3, cost: 12.34, price: 150, ncm: '84133030', ean: null, active: true, category: 'Hidráulica' })
    expect(productFromOmie({ codigo: 'P-2', descricao: 'Y', inativo: 'S' }, stock)!.active).toBe(false)
    expect(omieDate(new Date('2026-11-15T12:00:00Z'))).toBe('15/11/2026')
  })
})

describe('CIGAM (Integrador)', () => {
  it('troca os apelidos da coleção col pelos nomes das colunas', () => {
    const rows = cigamRows({ col: [{ codigoMaterial: 'c1', descricao: 'c2', precoCusto: { db_column: 'campo3', db_alias: 'c3' }, tipo: 'c4' }], esmateri: [{ c1: '001', c2: 'Material 1', c3: '10.5', c4: 'A' }, { c1: '002', c2: 'Material 2', c3: '20', c4: 'I' }] })
    expect(rows).toEqual([
      { codigomaterial: '001', descricao: 'Material 1', precocusto: '10.5', tipo: 'A' },
      { codigomaterial: '002', descricao: 'Material 2', precocusto: '20', tipo: 'I' },
    ])
    expect(productFromCigam(rows[0]!, new Map([['001', 4]]), new Map([['001', 30]]))).toMatchObject({ code: '001', cost: 10.5, price: 30, stock: 4, active: true })
    expect(productFromCigam(rows[1]!, new Map(), new Map())!.active).toBe(false)
    // Um registro só, sem cabeçalhos.
    expect(cigamRows({ codigoMaterial: '9', descricao: 'Único' })).toEqual([{ codigomaterial: '9', descricao: 'Único' }])
  })
})
