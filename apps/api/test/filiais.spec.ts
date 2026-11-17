import { describe, expect, it } from 'vitest'
import { cleanFiliais, dddOf, DEFAULT_FILIAIS, filialOf } from '../src/whatsapp/filiais'

describe('filial sugerida pelo DDD', () => {
  it('acha o DDD do telefone brasileiro', () => {
    expect(dddOf('+5545999887766')).toBe('45')
    expect(dddOf('554532221100')).toBe('45')
    expect(dddOf('+14155550100')).toBeNull()
    expect(dddOf(null)).toBeNull()
  })

  it('acha a filial pelo DDD', () => {
    const rules = cleanFiliais([{ name: 'Filial Sul', ddds: '41, 42, 43', color: 'verde' }, { name: 'Matriz', ddds: ['11'], color: 'azul' }])
    expect(filialOf('+5541988887777', rules)?.name).toBe('Filial Sul')
    expect(filialOf('+5511988887777', rules)?.name).toBe('Matriz')
    expect(filialOf('+5551988887777', rules)).toBeNull()
    expect(DEFAULT_FILIAIS).toEqual([])
  })

  it('limpa as regras: nome obrigatório, DDD válido, sem repetir entre filiais', () => {
    const r = cleanFiliais([
      { name: ' Cascavel ', ddds: '41, 42 ,99x, 10, 4', color: 'verde' },
      { name: 'Outra', ddds: ['42', '43'], color: 'nada' },
      { name: '', ddds: ['44'] },
    ])
    expect(r).toEqual([
      { name: 'Cascavel', ddds: ['41', '42', '99'], color: 'verde' },
      { name: 'Outra', ddds: ['43'], color: 'verde' },
    ])
    expect(cleanFiliais('x')).toEqual([])
  })
})
