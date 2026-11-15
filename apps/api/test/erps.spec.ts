import { describe, expect, it } from 'vitest'
import { cleanErpSettings, DEFAULT_ERP_STATE, fullDue, money, normalizeServerUrl, num, searchTextOf } from '../src/erps/erps'

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
