import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { DEMO_CLOCK_KEY, daysBetween, type DateColumn, type ForeignKey, shiftStatements } from './demo-relogio'

const TICK_MS = 60 * 60_000
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/** Uma vez por dia, as datas das empresas de demonstração (isDemo) andam até hoje. As empresas de verdade nunca mudam. */
@Injectable()
export class DemoRelogioService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DemoRelogioService.name)
  private timer: NodeJS.Timeout | null = null
  private first: NodeJS.Timeout | null = null
  private busy = false

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.first = setTimeout(() => void this.tick(), 2 * 60_000)
    this.first.unref()
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    if (this.first) clearTimeout(this.first)
  }

  private async statements() {
    const columns = await this.prisma.$queryRaw<DateColumn[]>`
      SELECT table_name AS "table", column_name AS "column" FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date')`
    const tenant = await this.prisma.$queryRaw<{ table: string }[]>`
      SELECT table_name AS "table" FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`
    const fks = await this.prisma.$queryRaw<ForeignKey[]>`
      SELECT cl.relname AS child, a.attname AS "column", pr.relname AS parent FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pr ON pr.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`
    // Tabelas com índice único que inclui uma coluna de data (andam em duas etapas).
    const unique = await this.prisma.$queryRaw<{ table: string }[]>`
      SELECT DISTINCT cl.relname AS "table" FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indisunique AND n.nspname = 'public' AND a.atttypid IN ('date'::regtype, 'timestamp'::regtype, 'timestamptz'::regtype)`
    return shiftStatements(columns, new Set(tenant.map((t) => t.table)), fks, new Set(unique.map((u) => u.table)))
  }

  async tick() {
    if (this.busy) return
    this.busy = true
    try {
      const demos = await this.prisma.tenant.findMany({ where: { isDemo: true }, select: { id: true, slug: true } })
      if (!demos.length) return
      const day = today()
      let sql: string[] | null = null
      for (const t of demos) {
        const cur = await this.prisma.tenantSetting.findUnique({ where: { tenantId_key: { tenantId: t.id, key: DEMO_CLOCK_KEY } } })
        const last = (cur?.value as { day?: string } | null)?.day
        const days = last ? daysBetween(last, day) : 0
        if (days > 0) {
          sql ??= await this.statements()
          // Tudo ou nada: se um comando falhar, a empresa fica como estava e tenta de novo na próxima hora.
          await this.prisma.$transaction(async (tx) => {
            for (const s of sql!) await tx.$executeRawUnsafe(s, days, t.id)
            await tx.tenant.update({ where: { id: t.id }, data: { paidUntil: new Date(Date.now() + 365 * 86_400_000) } })
          }, { timeout: 120_000 })
          this.logger.log(`Demonstração ${t.slug}: datas adiantadas ${days} dia(s).`)
        }
        if (days > 0 || !last) await this.prisma.tenantSetting.upsert({ where: { tenantId_key: { tenantId: t.id, key: DEMO_CLOCK_KEY } }, create: { tenantId: t.id, key: DEMO_CLOCK_KEY, value: { day } }, update: { value: { day } } })
      }
    } catch (e) {
      this.logger.warn(`Datas da demonstração: ${(e as Error).message}`)
    } finally {
      this.busy = false
    }
  }
}
