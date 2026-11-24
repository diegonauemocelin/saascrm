/**
 * Empresas de demonstração com as datas sempre atuais: uma vez por dia, todas as datas da empresa andam o número de
 * dias que passou desde a última vez (conversas, atendimentos, pedidos, fretes, postagens...), então os painéis e
 * gráficos parecem de hoje. Só monta os comandos (testado em test/demo-relogio.spec.ts); quem roda é o serviço.
 */

export const DEMO_CLOCK_KEY = 'demo_relogio'

/** Tabelas que nunca mudam: histórico de auditoria, cobrança da plataforma, domínios e acessos. */
export const DEMO_SKIP = new Set(['audit_logs', 'tenant_payments', 'tenant_domains', 'passkeys', 'push_subscriptions', 'refresh_tokens', 'trusted_devices', 'recovery_codes', 'password_reset_tokens', 'tenants', '_prisma_migrations', 'plans', 'system_releases'])

export interface DateColumn {
  table: string
  column: string
}
export interface ForeignKey {
  child: string
  column: string
  parent: string
}

const q = (id: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new Error(`Nome inválido: ${id}`)
  return `"${id}"`
}

/** Dias entre duas datas AAAA-MM-DD (0 se a última for hoje ou depois). */
export function daysBetween(from: string, to: string) {
  const d = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
  return Number.isFinite(d) && d > 0 ? d : 0
}

/**
 * Comandos SQL que movem as datas de uma empresa: tabelas com "tenantId" direto; tabelas sem ele (ex.: destinatários
 * do e-mail, eventos do pedido) pela tabela-mãe que tem. Parâmetros: $1 = dias, $2 = empresa.
 */
export function shiftStatements(columns: DateColumn[], tenantTables: Set<string>, fks: ForeignKey[]) {
  const byTable = new Map<string, string[]>()
  for (const c of columns) if (!DEMO_SKIP.has(c.table)) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c.column])
  const out: string[] = []
  for (const [table, cols] of byTable) {
    const set = cols.map((c) => `${q(c)} = ${q(c)} + make_interval(days => $1::int)`).join(', ')
    if (tenantTables.has(table)) {
      out.push(`UPDATE ${q(table)} SET ${set} WHERE "tenantId" = $2::uuid`)
      continue
    }
    const fk = fks.find((f) => f.child === table && tenantTables.has(f.parent) && !DEMO_SKIP.has(f.parent))
    if (!fk) continue
    const setChild = cols.map((c) => `${q(c)} = ch.${q(c)} + make_interval(days => $1::int)`).join(', ')
    out.push(`UPDATE ${q(table)} AS ch SET ${setChild} FROM ${q(fk.parent)} AS p WHERE ch.${q(fk.column)} = p."id" AND p."tenantId" = $2::uuid`)
  }
  return out
}
