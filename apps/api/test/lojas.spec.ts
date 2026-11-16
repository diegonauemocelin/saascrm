import { describe, expect, it } from 'vitest'
import { cleanLoja, email, ext, https, money, num, parseDate } from '../src/lojas/lojas'
import { allowedModules, onRequestModules } from '../src/plataforma/sistemas'

describe('lojas virtuais: regras comuns', () => {
  it('id externo com o prefixo da plataforma', () => {
    expect(ext('tray', 123)).toBe('tray:123')
    expect(ext('loja_integrada', '9')).toBe('loja_integrada:9')
  })

  it('números, valores, links e e-mails', () => {
    expect(num('1.234,56')).toBe(1234.56)
    expect(num('199.90')).toBe(199.9)
    expect(num(12)).toBe(12)
    expect(money('-1')).toBeNull()
    expect(https('http://x.com')).toBeNull()
    expect(https('https://loja.com/p/1')).toBe('https://loja.com/p/1')
    expect(email(' Fulano@Loja.com ')).toBe('fulano@loja.com')
    expect(email('sem-arroba')).toBeNull()
  })

  it('datas: ISO com fuso e sem fuso (Brasília)', () => {
    expect(parseDate('2026-11-16T10:00:00Z')!.toISOString()).toBe('2026-11-16T10:00:00.000Z')
    expect(parseDate('2026-11-16 10:00:00')!.toISOString()).toBe('2026-11-16T13:00:00.000Z')
    expect(parseDate('0000-00-00')).toBeNull()
  })

  it('configuração limpa', () => {
    const s = cleanLoja({ enabled: true, abandonHours: 500, tags: [' Loja ', 7 as unknown as string] })
    expect(s.abandonHours).toBe(2)
    expect(s.tags).toEqual(['loja'])
    expect(s.importCarts).toBe(true)
  })

  it('loja liberada pela plataforma: a tela dela, o Catálogo e os Carrinhos; as outras não aparecem', () => {
    const m = allowedModules({ isPlatform: false, systems: [], ecomIntegrations: ['nuvemshop'] })
    expect(m.has('loja_nuvemshop')).toBe(true)
    expect(m.has('catalogo')).toBe(true)
    expect(m.has('carrinhos')).toBe(true)
    expect(m.has('loja_tray')).toBe(false)
    expect(onRequestModules(m)).not.toContain('loja_tray')
  })
})
