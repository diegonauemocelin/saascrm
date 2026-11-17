import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, CheckCircle2Icon, CircleDashedIcon, XIcon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface Step {
  key: string
  title: string
  text: string
  done: boolean
  to: string
  module: string
}

/**
 * Primeiros passos do cliente novo (tela inicial do administrador): conectar o WhatsApp, cadastrar a equipe e importar
 * os contatos. Cada passo fica marcado quando está feito; o cartão some quando tudo está pronto ou ao dispensar.
 */
export function PrimeirosPassos({ className }: { className?: string }) {
  const { me } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['primeiros-passos'], queryFn: () => api.get<{ show: boolean; steps: Step[]; done: number; total: number }>('/primeiros-passos'), enabled: !!me?.role.isSystem, staleTime: 60_000 })
  const dismiss = useMutation({
    mutationFn: () => api.post('/primeiros-passos/dispensar'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['primeiros-passos'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const d = q.data
  if (!d?.show) return null
  const pct = Math.round((d.done / Math.max(1, d.total)) * 100)
  return (
    <Card className={cn('border-[color:var(--brand)]/40', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Primeiros passos</CardTitle>
          <CardDescription>
            {d.done} de {d.total} feitos. Com eles prontos, a equipe já atende pelo WhatsApp com os contatos no sistema.
          </CardDescription>
          <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Primeiros passos feitos">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dismiss.mutate()} disabled={dismiss.isPending} title="Não mostrar mais">
          <XIcon /> Dispensar
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-3">
          {d.steps.map((s, i) => (
            <li key={s.key} className={cn('rounded-lg border p-3', s.done && 'bg-emerald-50/60 dark:bg-emerald-500/5')}>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {s.done ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <CircleDashedIcon className="size-4 text-muted-foreground" />}
                Passo {i + 1}
                {s.done && <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400">· feito</span>}
              </span>
              <p className={cn('mt-1 font-medium', s.done && 'text-muted-foreground line-through')}>{s.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
              {!s.done && (
                <Button asChild variant="link" size="sm" className="h-auto px-0">
                  <Link to={s.to}>
                    Fazer agora <ArrowRightIcon />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
