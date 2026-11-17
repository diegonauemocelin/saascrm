import { useQuery } from '@tanstack/react-query'
import { AlertTriangleIcon, BanknoteIcon, Building2Icon, ExternalLinkIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, formatDate, TableSkeleton } from '@/components/page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatPhone } from '@/lib/atendimento'
import { cn } from '@/lib/utils'

interface Month {
  month: string
  receivedCents: number
  newCompanies: number
  canceled: number
}
interface Painel {
  total: number
  byStatus: Record<string, number>
  mrrCents: number
  overdueCents: number
  overdueCount: number
  months: Month[]
  thisMonth: Month
  late: { tenantId: string; name: string; slug: string; status: string; statusLabel: string; plan: string | null; openCents: number; count: number; oldestDue: string; daysLate: number; invoiceUrl: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null }[]
  canceledRecent: { id: string; name: string; plan: string | null; priceCents: number | null; canceledAt: string; createdAt: string }[]
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`
const revenue: ChartConfig = { received: { label: 'Recebido', color: 'var(--chart-1)' } }
const movement: ChartConfig = { newCompanies: { label: 'Empresas novas', color: 'var(--chart-2)' }, canceled: { label: 'Cancelamentos', color: 'var(--chart-5)' } }

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Building2Icon; label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className={cn('text-xl font-semibold tabular-nums', tone === 'bad' && 'text-destructive', tone === 'good' && 'text-emerald-700 dark:text-emerald-400')}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

/** Painel da plataforma: empresas, faturamento recebido por mês (Asaas), cancelamentos e pagamentos atrasados. */
export function PlataformaPainel({ onOpenPayments }: { onOpenPayments: () => void }) {
  const q = useQuery({ queryKey: ['plataforma-painel'], queryFn: () => api.get<Painel>('/plataforma/painel'), refetchInterval: 5 * 60_000 })
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const d = q.data
  if (!d) return <TableSkeleton />
  const chart = d.months.map((m) => ({ label: monthLabel(m.month), received: m.receivedCents / 100, newCompanies: m.newCompanies, canceled: m.canceled }))
  const yearCents = d.months.reduce((s, m) => s + m.receivedCents, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat icon={Building2Icon} label="Empresas ativas" value={String(d.byStatus.ATIVA ?? 0)} sub={`${d.byStatus.TESTE ?? 0} em teste · ${d.total} no total`} />
        <Stat icon={BanknoteIcon} label="Receita mensal (ativas)" value={brl(d.mrrCents)} sub="mensalidade das ativas e atrasadas" />
        <Stat icon={TrendingUpIcon} label="Recebido este mês" value={brl(d.thisMonth.receivedCents)} sub={`${brl(yearCents)} em 12 meses`} tone="good" />
        <Stat icon={Building2Icon} label="Empresas novas no mês" value={String(d.thisMonth.newCompanies)} />
        <Stat icon={TrendingDownIcon} label="Cancelamentos no mês" value={String(d.thisMonth.canceled)} sub={`${d.byStatus.CANCELADA ?? 0} canceladas no total`} tone={d.thisMonth.canceled ? 'bad' : undefined} />
        <Stat icon={AlertTriangleIcon} label="Pagamentos atrasados" value={brl(d.overdueCents)} sub={`${d.late.length} empresa(s) · ${d.overdueCount} cobrança(s)`} tone={d.late.length ? 'bad' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faturamento recebido por mês</CardTitle>
            <CardDescription>Pagamentos confirmados no Asaas, pelo mês em que entraram.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={revenue} className="aspect-auto h-60 w-full">
              <BarChart data={chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis width={70} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' })} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => brl(Number(v) * 100)} />} />
                <Bar dataKey="received" fill="var(--color-received)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empresas novas e cancelamentos</CardTitle>
            <CardDescription>Últimos 12 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={movement} className="aspect-auto h-60 w-full">
              <BarChart data={chart} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="newCompanies" fill="var(--color-newCompanies)" radius={4} />
                <Bar dataKey="canceled" fill="var(--color-canceled)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Pagamento atrasado</CardTitle>
            <CardDescription>Cobranças vencidas no Asaas, das mais atrasadas para as mais recentes.</CardDescription>
          </div>
          <button type="button" className="text-sm text-primary hover:underline" onClick={onOpenPayments}>
            Ver todas as cobranças
          </button>
        </CardHeader>
        <CardContent>
          {d.late.length === 0 ? (
            <EmptyState title="Nenhuma empresa com pagamento atrasado" description="Tudo em dia no Asaas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead>Venceu em</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.late.map((l) => (
                  <TableRow key={l.tenantId}>
                    <TableCell>
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">{l.statusLabel}</span>
                    </TableCell>
                    <TableCell>{l.plan ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {brl(l.openCents)}
                      {l.count > 1 && <span className="block text-xs text-muted-foreground">{l.count} cobranças</span>}
                    </TableCell>
                    <TableCell>{formatDate(l.oldestDue)}</TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', l.daysLate > 15 && 'text-destructive')}>{l.daysLate}</TableCell>
                    <TableCell className="text-sm">
                      {l.contactName ?? '—'}
                      <span className="block text-xs text-muted-foreground">{[l.contactPhone ? formatPhone(l.contactPhone) || l.contactPhone : null, l.contactEmail].filter(Boolean).join(' · ')}</span>
                    </TableCell>
                    <TableCell>
                      {l.invoiceUrl && (
                        <a href={l.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                          Fatura <ExternalLinkIcon className="size-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cancelamentos dos últimos 90 dias</CardTitle>
        </CardHeader>
        <CardContent>
          {d.canceledRecent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cancelamento nos últimos 90 dias.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Mensalidade</TableHead>
                  <TableHead>Cliente desde</TableHead>
                  <TableHead>Cancelou em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.canceledRecent.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.plan ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.priceCents === null ? '—' : brl(c.priceCents)}</TableCell>
                    <TableCell>{formatDate(c.createdAt)}</TableCell>
                    <TableCell>{formatDate(c.canceledAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
