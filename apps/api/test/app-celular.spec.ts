import { describe, expect, it } from 'vitest'
// Só funções puras: os testes daqui não carregam classes com decorators do Nest.
import { cleanLoginHours, outsideHoursMessage, withinLoginHours } from '../src/common/horario-acesso'

// 2026-10-26 é segunda-feira. Horário de Brasília = UTC-3.
const at = (iso: string) => new Date(iso)
const SEG_A_SEX = { enabled: true, days: [null, { from: '07:00', to: '19:00' }, { from: '07:00', to: '19:00' }, { from: '07:00', to: '19:00' }, { from: '07:00', to: '19:00' }, { from: '07:00', to: '19:00' }, { from: '08:00', to: '12:00' }] }

describe('Horário de acesso do perfil', () => {
  it('entra dentro do horário e não entra fora (horário de Brasília)', () => {
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-10-26T10:00:00-03:00'))).toBe(true)
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-10-26T06:59:00-03:00'))).toBe(false)
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-10-26T19:00:00-03:00'))).toBe(false)
    // 23h em Brasília já é dia seguinte em UTC: vale o dia de Brasília.
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-10-26T23:00:00-03:00'))).toBe(false)
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-10-31T11:00:00-03:00'))).toBe(true)
    expect(withinLoginHours(SEG_A_SEX, false, at('2026-11-01T11:00:00-03:00'))).toBe(false)
  })

  it('administrador, horário desligado ou vazio: sempre entra', () => {
    expect(withinLoginHours(SEG_A_SEX, true, at('2026-11-01T03:00:00-03:00'))).toBe(true)
    expect(withinLoginHours({ ...SEG_A_SEX, enabled: false }, false, at('2026-11-01T03:00:00-03:00'))).toBe(true)
    expect(withinLoginHours(null, false, at('2026-11-01T03:00:00-03:00'))).toBe(true)
  })

  it('descarta horário inválido e explica o motivo', () => {
    expect(cleanLoginHours({ enabled: true, days: [{ from: '19:00', to: '07:00' }, { from: '7h', to: '9h' }] })?.days.slice(0, 2)).toEqual([null, null])
    expect(outsideHoursMessage(SEG_A_SEX, at('2026-10-26T20:00:00-03:00'))).toContain('das 07:00 às 19:00')
    expect(outsideHoursMessage(SEG_A_SEX, at('2026-11-01T10:00:00-03:00'))).toContain('domingo não tem acesso')
  })
})
