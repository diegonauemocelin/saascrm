import { useMutation, useQuery } from '@tanstack/react-query'
import { CreditCardIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState, formatDate, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { usePageTitle } from '@/lib/page-title'

export interface Billing {
  company: string
  status: string
  statusLabel: string
  plan: { name: string; priceCents: number; maxUsers: number; maxWhatsapp: number; systems: string[] } | null
  trialEndsAt: string | null
  paidUntil: string | null
  payUrl: string | null
  hasSubscription: boolean
  payments: { id: string; valueCents: number; status: string; billingType: string | null; dueDate: string; paidAt: string | null; invoiceUrl: string | null }[]
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PAY_STATUS: Record<string, string> = { PENDENTE: 'Em aberto', VENCIDA: 'Vencida', CONFIRMADA: 'Paga', RECEBIDA: 'Paga', ESTORNADA: 'Estornada', CANCELADA: 'Cancelada' }

/** Botão de pagar: abre a fatura em aberto; sem assinatura ainda, gera a cobrança no Asaas. */
export function PayButton({ billing, size }: { billing?: Billing; size?: 'default' | 'lg' }) {
  const pay = useMutation({
    mutationFn: () => api.post<{ payUrl: string }>('/assinatura/pagar'),
    onSuccess: (r) => window.open(r.payUrl, '_blank', 'noopener'),
    onError: (err) => toast.error(errorMessage(err), { duration: 10_000 }),
  })
  if (billing?.payUrl)
    return (
      <Button size={size} asChild>
        <a href={billing.payUrl} target="_blank" rel="noreferrer">
          <CreditCardIcon /> Pagar agora (Pix, boleto ou cartão) <ExternalLinkIcon />
        </a>
      </Button>
    )
  if (billing && billing.plan && !billing.hasSubscription)
    return (
      <Button size={size} onClick={() => pay.mutate()} disabled={pay.isPending}>
        {pay.isPending ? <Loader2Icon className="animate-spin" /> : <CreditCardIcon />} Gerar a fatura
      </Button>
    )
  return null
}

export function AssinaturaPage() {
  usePageTitle('Assinatura')
  const q = useQuery({ queryKey: ['assinatura'], queryFn: () => api.get<Billing>('/assinatura') })
  const b = q.data
  return (
    <RequirePermission module="configuracoes">
      <PageHeader title="Assinatura" description="Plano contratado, vencimento e as faturas da mensalidade. O pagamento confirmado libera o acesso na hora." />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !b ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="gap-1 p-4">
              <p className="text-xs text-muted-foreground">Plano</p>
              <p className="text-xl font-semibold">{b.plan ? `${b.plan.name} · ${brl(b.plan.priceCents)}/mês` : 'Sem plano'}</p>
              {b.plan && (
                <p className="text-sm text-muted-foreground">
                  {b.plan.maxUsers} usuário(s) · {b.plan.maxWhatsapp} WhatsApp
                </p>
              )}
            </Card>
            <Card className="gap-1 p-4">
              <p className="text-xs text-muted-foreground">Situação</p>
              <p className="text-xl font-semibold">{b.statusLabel}</p>
              <p className="text-sm text-muted-foreground">{b.status === 'TESTE' ? `Teste até ${formatDate(b.trialEndsAt)}` : b.paidUntil ? `Pago até ${formatDate(b.paidUntil)}` : ''}</p>
            </Card>
            <Card className="justify-center gap-2 p-4">
              <PayButton billing={b} />
              {!b.payUrl && b.hasSubscription && <p className="text-sm text-muted-foreground">Nenhuma fatura em aberto.</p>}
            </Card>
          </div>
          {b.plan && b.plan.systems.length > 0 && (
            <Card className="gap-1 p-4">
              <p className="text-sm font-medium">Sistemas do plano</p>
              <p className="text-sm text-muted-foreground">{b.plan.systems.join(' · ')}</p>
            </Card>
          )}
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4">{formatDate(p.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(p.valueCents)}</TableCell>
                    <TableCell>{PAY_STATUS[p.status] ?? p.status}</TableCell>
                    <TableCell>{p.paidAt ? formatDate(p.paidAt) : '—'}</TableCell>
                    <TableCell>
                      {p.invoiceUrl && (
                        <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                          Fatura <ExternalLinkIcon className="size-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!b.payments.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma fatura ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </RequirePermission>
  )
}
