import { describe, expect, it } from 'vitest'
import { lastMonths, monthKey, monthly, onboardingSteps, overdueByCompany } from '../src/plataforma/painel'

describe('painel da plataforma', () => {
  it('meses no fuso de São Paulo', () => {
    expect(monthKey(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11')
    expect(lastMonths(new Date('2026-02-10T12:00:00Z'), 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('faturamento recebido, empresas novas e cancelamentos por mês', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const rows = monthly(now, 2, {
      payments: [
        { valueCents: 10000, paidAt: new Date('2026-11-05T12:00:00Z') },
        { valueCents: 5000, paidAt: new Date('2026-10-20T12:00:00Z') },
        { valueCents: 999, paidAt: new Date('2025-01-01T12:00:00Z') },
        { valueCents: 1, paidAt: null },
      ],
      created: [new Date('2026-11-01T12:00:00Z')],
      canceled: [new Date('2026-10-15T12:00:00Z'), new Date('2026-10-16T12:00:00Z')],
    })
    expect(rows).toEqual([
      { month: '2026-10', receivedCents: 5000, newCompanies: 0, canceled: 2 },
      { month: '2026-11', receivedCents: 10000, newCompanies: 1, canceled: 0 },
    ])
  })

  it('atrasados por empresa: soma, mais antigo e mais atrasadas primeiro', () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const r = overdueByCompany(now, [
      { tenantId: 'a', valueCents: 100, dueDate: new Date('2026-11-10T12:00:00Z'), invoiceUrl: 'a2' },
      { tenantId: 'a', valueCents: 100, dueDate: new Date('2026-10-10T12:00:00Z'), invoiceUrl: 'a1' },
      { tenantId: 'b', valueCents: 500, dueDate: new Date('2026-11-15T12:00:00Z'), invoiceUrl: null },
    ])
    expect(r.map((x) => [x.tenantId, x.openCents, x.count, x.daysLate, x.invoiceUrl])).toEqual([
      ['a', 200, 2, 38, 'a1'],
      ['b', 500, 1, 2, null],
    ])
  })
})

describe('primeiros passos', () => {
  it('cada passo conferido pelos dados da empresa', () => {
    const none = onboardingSteps({ whatsappConnected: 0, whatsappNumbers: 0, users: 1, contacts: 0 })
    expect(none.map((s) => s.done)).toEqual([false, false, false])
    const all = onboardingSteps({ whatsappConnected: 1, whatsappNumbers: 1, users: 3, contacts: 10 })
    expect(all.map((s) => s.done)).toEqual([true, true, true])
    expect(onboardingSteps({ whatsappConnected: 0, whatsappNumbers: 1, users: 1, contacts: 0 })[0]!.text).toContain('QR Code')
  })
})
