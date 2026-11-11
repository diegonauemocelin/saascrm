import { describe, expect, it } from 'vitest'
import { isIP } from 'node:net'
import { MODULE_KEYS } from '../src/common/permissions'
import { privateIp } from '../src/fretes/download'
import { allowedModules, SYSTEMS } from '../src/plataforma/sistemas'
import { addressAllowed, guardedLookup, vpnEligibleIp } from '../src/trier/http'
import {
  changedWindow,
  cleanTrier,
  cleanVpnAddress,
  DEFAULT_TRIER,
  effectiveValues,
  nextSync,
  normalizeBaseUrl,
  pageParams,
  productFromTrier,
  rowsOf,
  stockFromTrier,
  trierHttpError,
  trierUrl,
  validGtin,
  vpnStatus,
} from '../src/trier/trier'

const sample = {
  codigo: 12345,
  nome: 'SHAMPOO ANTICASPA 200ML',
  valorVenda: 19.9,
  valorCusto: 12.5,
  valorCustoMedio: 13.1,
  quantidadeEstoque: 100,
  unidade: 'UN',
  codigoBarras: 7891234567895,
  codigoLaboratorio: 101,
  nomeLaboratorio: 'Laboratorio Exemplo',
  nomeDepartamento: 'Higiene',
  nomeGrupo: 'Cabelos',
  nomeCategoria: 'Shampoo',
  nomeClassificacao: 'Perfumaria',
  ativo: true,
  tipo: { codigo: 3, nome: 'Perfumaria' },
  integracaoEcommerce: true,
  nomeEcommerce: 'Shampoo Anticaspa 200 ml',
  descricaoEcommerce: 'Shampoo para uso diário.',
  valorVendaEcommerce: 21.9,
  quantidadeEstoqueEcommerce: 50,
  larguraEcommerce: 40,
  alturaEcommerce: 120,
  profundidadeEcommerce: 20,
  pesoEcommerce: 150,
  codClaFiscal: '3305.10.00',
  produtoManipulado: 'N',
  dataAlteracao: '2026-11-10T12:00:00Z',
}

describe('Trier: endereço e rotas', () => {
  it('normaliza o endereço do servidor', () => {
    expect(normalizeBaseUrl('farmacia.ddns.net:4647')).toBe('http://farmacia.ddns.net:4647/sgfpod1')
    expect(normalizeBaseUrl('http://1.2.3.4:4647/sgfpod1/rest/')).toBe('http://1.2.3.4:4647/sgfpod1')
    expect(normalizeBaseUrl('https://erp.farmacia.com.br:4647/sgfpod2')).toBe('https://erp.farmacia.com.br:4647/sgfpod2')
    expect(() => normalizeBaseUrl('')).toThrow(/Informe/)
    expect(() => normalizeBaseUrl('ftp://x:21')).toThrow(/http/)
    expect(() => normalizeBaseUrl('http://user:pw@x:4647')).toThrow(/usuário/)
    expect(() => normalizeBaseUrl('http://x:4647/a/b')).toThrow(/Caminho/)
  })

  it('monta a URL com /rest/integracao e só rotas permitidas', () => {
    expect(trierUrl('http://x:4647/sgfpod1', 'produto/obter-todos-v1', pageParams(2, 0))).toBe('http://x:4647/sgfpod1/rest/integracao/produto/obter-todos-v1?primeiroRegistro=1000&quantidadeRegistros=500')
    expect(pageParams(0, 1).primeiroRegistro).toBe(1)
    expect(() => trierUrl('http://x:4647/sgfpod1', 'venda/efetuar-venda-v1' as never, {})).toThrow()
  })

  it('agenda cópia completa e alterados', () => {
    const s = { fullEveryHours: 6, incrementalMinutes: 15 }
    const now = new Date('2026-11-11T12:00:00Z')
    expect(nextSync(now, { lastFullAt: null, lastIncrementalAt: null }, s)).toBe('full')
    expect(nextSync(now, { lastFullAt: '2026-11-11T05:00:00Z', lastIncrementalAt: null }, s)).toBe('full')
    expect(nextSync(now, { lastFullAt: '2026-11-11T10:00:00Z', lastIncrementalAt: '2026-11-11T11:40:00Z' }, s)).toBe('incremental')
    expect(nextSync(now, { lastFullAt: '2026-11-11T10:00:00Z', lastIncrementalAt: '2026-11-11T11:50:00Z' }, s)).toBeNull()
    expect(changedWindow({ lastIncrementalAt: '2026-11-11T11:40:00Z', lastFullAt: null }, now)).toEqual({ dataInicial: '2026-11-11T11:35:00Z', dataFinal: '2026-11-11T12:00:00Z' })
  })

  it('limpa a configuração com padrões seguros', () => {
    const c = cleanTrier({ fullEveryHours: 99, incrementalMinutes: 1, importCost: 'sim' })
    expect(c.fullEveryHours).toBe(DEFAULT_TRIER.fullEveryHours)
    expect(c.incrementalMinutes).toBe(DEFAULT_TRIER.incrementalMinutes)
    expect(c.importCost).toBe(false)
    expect(DEFAULT_TRIER.ecommerceOnly).toBe(true)
    expect(DEFAULT_TRIER.useEcommerceValues).toBe(true)
  })

  it('mensagens de erro em português', () => {
    expect(trierHttpError(401)).toMatch(/token/)
    expect(trierHttpError(404)).toMatch(/sgfpod1/)
  })
})

describe('Trier: produto e estoque', () => {
  it('mapeia o ProdutoIntegracaoDto', () => {
    const p = productFromTrier(sample, { importCost: false })!
    expect(p.code).toBe('12345')
    expect(p.ean).toBe('7891234567895')
    expect(p.brand).toBe('Laboratorio Exemplo')
    expect(p.ncm).toBe('33051000')
    expect(p.cost).toBeNull()
    expect(p.ecommerce).toBe(true)
    expect(p.typeName).toBe('Perfumaria')
    expect(p.compounded).toBe(false)
    expect(p.weightG).toBe(150)
    expect(p.changedAt?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(p.searchText).toContain('shampoo')
  })

  it('custo só com a opção ligada (custo médio primeiro)', () => {
    expect(productFromTrier(sample, { importCost: true })!.cost).toBe(13.1)
    expect(productFromTrier({ ...sample, valorCustoMedio: null }, { importCost: true })!.cost).toBe(12.5)
  })

  it('manipulado, EAN com zero à esquerda e linhas inválidas', () => {
    expect(productFromTrier({ ...sample, produtoManipulado: 'S' }, { importCost: false })!.compounded).toBe(true)
    // 0012345678905 chega como número (12 dígitos).
    expect(validGtin('0012345678905')).toBe(true)
    expect(productFromTrier({ ...sample, codigoBarras: 12345678905 }, { importCost: false })!.ean).toBe('0012345678905')
    expect(productFromTrier({ ...sample, codigoBarras: 123 }, { importCost: false })!.ean).toBeNull()
    expect(productFromTrier({ nome: 'x' }, { importCost: false })).toBeNull()
    expect(productFromTrier({ codigo: 1 }, { importCost: false })).toBeNull()
  })

  it('estoque e valores efetivos', () => {
    expect(stockFromTrier({ codigoProduto: 12345, quantidadeEstoque: 2 })).toEqual({ code: '12345', stock: 2 })
    expect(stockFromTrier({ codigoProduto: 12345 })).toBeNull()
    const p = { price: 19.9, ecommercePrice: 21.9, stock: 100, ecommerceStock: 50 }
    expect(effectiveValues(p, true)).toEqual({ price: 21.9, stock: 50 })
    expect(effectiveValues(p, false)).toEqual({ price: 19.9, stock: 100 })
    expect(effectiveValues({ ...p, ecommercePrice: null, ecommerceStock: null, stock: -3 }, true)).toEqual({ price: 19.9, stock: 0 })
    expect(() => rowsOf({ erro: 1 })).toThrow()
    expect(rowsOf([{ a: 1 }, null])).toHaveLength(1)
  })
})

describe('Trier: proteção de rede (SSRF) e acesso pela VPN', () => {
  it('bloqueia rede interna, loopback, link-local e metadados de nuvem', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) expect(addressAllowed(ip)).toBe(false)
    expect(addressAllowed('200.150.10.20')).toBe(true)
  })

  it('libera só o IP privado exato da VPN; loopback e link-local nunca', () => {
    expect(addressAllowed('10.8.0.20', '10.8.0.20')).toBe(true)
    expect(addressAllowed('10.8.0.21', '10.8.0.20')).toBe(false)
    expect(addressAllowed('127.0.0.1', '127.0.0.1')).toBe(false)
    expect(addressAllowed('169.254.169.254', '169.254.169.254')).toBe(false)
    expect(vpnEligibleIp('192.168.0.5')).toBe(true)
    expect(vpnEligibleIp('fd12::5')).toBe(true)
    expect(vpnEligibleIp('fe80::1')).toBe(false)
  })

  it('lookup recusa nome que resolve para IP interno', async () => {
    const fake = ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '10.0.0.9', family: 4 }])) as never
    const err = await new Promise((resolve) => guardedLookup(null, fake)('farmacia.ddns.net', {}, (e) => resolve(e)))
    expect(String(err)).toMatch(/rede interna/)
    const ok = await new Promise((resolve) => guardedLookup(null, ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '200.1.2.3', family: 4 }])) as never)('x', {}, (e, a) => resolve(e ?? a)))
    expect(ok).toBe('200.1.2.3')
  })

  it('liberação exata de IP:porta pela plataforma', () => {
    expect(cleanVpnAddress(' 10.8.0.20:4647 ', privateIp, vpnEligibleIp)).toBe('10.8.0.20:4647')
    expect(cleanVpnAddress('[FD00::5]:4647', privateIp, vpnEligibleIp)).toBe('[fd00::5]:4647')
    expect(() => cleanVpnAddress('10.8.0.0/24', privateIp, vpnEligibleIp)).toThrow()
    expect(() => cleanVpnAddress('127.0.0.1:4647', privateIp, vpnEligibleIp)).toThrow(/não pode/)
    expect(() => cleanVpnAddress('169.254.169.254:80', privateIp, vpnEligibleIp)).toThrow(/não pode/)
    expect(() => cleanVpnAddress('200.1.2.3:4647', privateIp, vpnEligibleIp)).toThrow(/público/)
  })

  it('situação do endereço na tela da empresa', () => {
    const lit = (h: string) => isIP(h) > 0
    expect(vpnStatus('http://farmacia.ddns.net:4647/sgfpod1', { allowed: null }, privateIp, vpnEligibleIp, lit)).toBe('publico')
    expect(vpnStatus('http://10.8.0.20:4647/sgfpod1', { allowed: null }, privateIp, vpnEligibleIp, lit)).toBe('aguardando')
    expect(vpnStatus('http://10.8.0.20:4647/sgfpod1', { allowed: '10.8.0.20:4647' }, privateIp, vpnEligibleIp, lit)).toBe('liberado')
    // Porta diferente da liberada: volta a aguardar.
    expect(vpnStatus('http://10.8.0.20:8080/sgfpod1', { allowed: '10.8.0.20:4647' }, privateIp, vpnEligibleIp, lit)).toBe('aguardando')
    expect(vpnStatus('http://127.0.0.1:4647/sgfpod1', { allowed: '127.0.0.1:4647' }, privateIp, vpnEligibleIp, lit)).toBe('bloqueado')
  })
})

describe('Trier: módulos e planos', () => {
  it('erp_trier no sistema erp e marketplace_publicar em marketplaces', () => {
    expect(MODULE_KEYS).toContain('erp_trier')
    expect(MODULE_KEYS).toContain('marketplace_publicar')
    expect(SYSTEMS.find((s) => s.key === 'erp')!.modules).toContain('erp_trier')
    expect(SYSTEMS.find((s) => s.key === 'marketplaces')!.modules).toContain('marketplace_publicar')
    expect(allowedModules({ isPlatform: false, systems: ['marketplaces'] }).has('erp_trier')).toBe(false)
  })
})
