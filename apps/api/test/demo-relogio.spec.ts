import { describe, expect, it } from 'vitest'
import { daysBetween, shiftStatements } from '../src/plataforma/demo-relogio'

describe('demonstração com as datas sempre atuais', () => {
  it('dias desde a última vez', () => {
    expect(daysBetween('2026-11-20', '2026-11-24')).toBe(4)
    expect(daysBetween('2026-11-24', '2026-11-24')).toBe(0)
    expect(daysBetween('2026-11-25', '2026-11-24')).toBe(0)
  })
  it('move as datas da empresa e das tabelas-filhas pela mãe; auditoria e cobrança ficam', () => {
    const sql = shiftStatements(
      [
        { table: 'leads', column: 'createdAt' },
        { table: 'leads', column: 'lastActivityAt' },
        { table: 'email_recipients', column: 'sentAt' },
        { table: 'audit_logs', column: 'createdAt' },
        { table: 'refresh_tokens', column: 'expiresAt' },
      ],
      new Set(['leads', 'email_campaigns', 'audit_logs', 'users']),
      [
        { child: 'email_recipients', column: 'campaignId', parent: 'email_campaigns' },
        { child: 'refresh_tokens', column: 'userId', parent: 'users' },
      ],
    )
    expect(sql).toHaveLength(2)
    expect(sql[0]).toBe('UPDATE "leads" SET "createdAt" = "createdAt" + make_interval(days => $1::int), "lastActivityAt" = "lastActivityAt" + make_interval(days => $1::int) WHERE "tenantId" = $2::uuid')
    expect(sql[1]).toContain('UPDATE "email_recipients" AS ch SET "sentAt" = ch."sentAt"')
    expect(sql[1]).toContain('FROM "email_campaigns" AS p WHERE ch."campaignId" = p."id" AND p."tenantId" = $2::uuid')
  })
})
