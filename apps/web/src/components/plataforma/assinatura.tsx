import { AlertTriangleIcon, LockIcon, LogOutIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'

/** Aviso fixo no canto: teste grátis acabando ou mensalidade vencida (ainda na tolerância). */
export function SubscriptionBanner() {
  const { me } = useAuth()
  const warning = me?.company?.warning
  if (!warning) return null
  return (
    <div className="fixed right-4 bottom-4 z-40 flex max-w-md items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-lg dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200" role="status">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{warning}</span>
    </div>
  )
}

/** Tela no lugar do sistema quando a assinatura está bloqueada (sem pagamento, teste encerrado, suspensa). */
export function SubscriptionBlocked() {
  const { me, logout } = useAuth()
  const branding = useBranding()
  const c = me?.company
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <LockIcon className="mx-auto size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Acesso bloqueado</h1>
        <p className="text-sm text-muted-foreground">{c?.reason ?? 'A assinatura da empresa não está em dia.'}</p>
        {c && (
          <p className="text-sm">
            {c.name}
            {c.plan ? ` · plano ${c.plan}` : ''} · {c.statusLabel}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Seus dados continuam guardados. Dúvidas: {branding.supportEmail || 'fale com a sgmulticonecta'}.</p>
        <Button variant="outline" onClick={() => void logout()}>
          <LogOutIcon /> Sair
        </Button>
      </div>
    </div>
  )
}
