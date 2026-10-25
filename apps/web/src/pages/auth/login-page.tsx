import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { ArrowRightIcon, BuildingIcon, Loader2Icon, MailIcon, ShieldCheckIcon, UserPlusIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { ClockWarning } from '@/components/clock-warning'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranding } from '@/lib/branding'
import { AuthLayout, FormError } from './auth-layout'

type Step = 'credentials' | 'mfa' | 'recovery'

const ADMIN_KEY = 'login-administracao'
const remembered = () => {
  try {
    return localStorage.getItem(ADMIN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Entrada da plataforma (crm.sgmulticonecta.com.br): quem já é cliente vai para o login da própria empresa (onde também
 * recupera a senha), quem ainda não é cria a conta escolhendo o plano, e a equipe da plataforma entra na administração.
 */
function PlatformEntry({ domain, onAdmin }: { domain: string; onAdmin: () => void }) {
  const b = useBranding()
  const [slug, setSlug] = useState('')
  const [forgot, setForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const clean = slug.trim().toLowerCase().replace(/^https?:\/\//, '').split('.')[0]!.replace(/[^a-z0-9-]/g, '')

  const go = (e: FormEvent) => {
    e.preventDefault()
    if (clean.length < 3) return setError('Informe o endereço da sua empresa.')
    window.location.href = `https://${clean}.${domain}/login`
  }
  const remind = async (e: FormEvent) => {
    e.preventDefault()
    if (!/\S+@\S+\.\S+/.test(email)) return setError('Informe o seu e-mail.')
    setBusy(true)
    setError(null)
    try {
      setSent((await api.post<{ message: string }>('/public/cadastro/minhas-empresas', { email })).message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={`Bem-vindo ao ${b.appName}`} subtitle="Entre na sua empresa ou crie a sua conta.">
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-medium">
            <BuildingIcon className="size-4 text-muted-foreground" /> Já sou cliente
          </h2>
          {!forgot ? (
            <form onSubmit={go} className="space-y-2" noValidate>
              <Label htmlFor="pe-slug">Endereço da sua empresa</Label>
              <div className="flex items-center gap-1.5">
                <Input id="pe-slug" autoFocus autoComplete="organization" placeholder="suaempresa" value={slug} onChange={(e) => (setSlug(e.target.value), setError(null))} />
                <span className="shrink-0 text-sm text-muted-foreground">.{domain}</span>
              </div>
              <FormError message={error} />
              <Button type="submit" className="w-full">
                Ir para o login <ArrowRightIcon />
              </Button>
              <p className="text-xs text-muted-foreground">
                No login da sua empresa você entra com e-mail e senha, e recupera a senha se precisar.{' '}
                <button type="button" className="underline hover:text-foreground" onClick={() => (setForgot(true), setError(null))}>
                  Não lembro o endereço
                </button>
              </p>
            </form>
          ) : sent ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <p>{sent}</p>
              <button type="button" className="text-xs underline" onClick={() => (setForgot(false), setSent(null))}>
                Voltar
              </button>
            </div>
          ) : (
            <form onSubmit={remind} className="space-y-2" noValidate>
              <Label htmlFor="pe-email">Seu e-mail de acesso</Label>
              <Input id="pe-email" type="email" autoFocus autoComplete="email" value={email} onChange={(e) => (setEmail(e.target.value), setError(null))} />
              <FormError message={error} />
              <Button type="submit" variant="outline" className="w-full" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <MailIcon />} Enviar o endereço para o meu e-mail
              </Button>
              <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => (setForgot(false), setError(null))}>
                Voltar
              </button>
            </form>
          )}
        </section>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-medium">
            <UserPlusIcon className="size-4 text-muted-foreground" /> Ainda não sou cliente
          </h2>
          <Button asChild variant="outline" className="w-full">
            <Link to="/cadastro">Criar conta e escolher o plano</Link>
          </Button>
        </section>

        <p className="pt-2 text-center">
          <button type="button" onClick={onAdmin} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            <ShieldCheckIcon className="size-3.5" /> Acesso da administração
          </button>
        </p>
      </div>
    </AuthLayout>
  )
}

export function LoginPage() {
  const b = useBranding()
  const { me, refresh } = useAuth()
  const navigate = useNavigate()
  // Volta para a tela em que a pessoa estava quando a sessão acabou (só endereços internos).
  const from = (useLocation().state as { from?: string } | null)?.from
  const target = from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login') ? from : '/'
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [admin, setAdmin] = useState(remembered)

  if (me) return <Navigate to={target} replace />
  if (b.signup && b.platformDomain && !admin) return <PlatformEntry domain={b.platformDomain} onAdmin={() => setAdmin(true)} />

  const finish = async () => {
    await refresh()
    navigate(target, { replace: true })
  }

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Informe e-mail e senha.')
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ status: string }>('/auth/login', { email, password })
      if (res.status === 'mfa_required') {
        setStep('mfa')
        setPassword('')
      } else {
        await finish()
      }
      if (b.signup) {
        try {
          localStorage.setItem(ADMIN_KEY, '1')
        } catch {
          // sem armazenamento local: na próxima vez, a entrada da plataforma aparece de novo
        }
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/2fa/verify', { code: value })
      await finish()
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
      if (errorMessage(err).includes('expirada')) setStep('credentials')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'credentials') {
    return (
      <AuthLayout title={b.loginTitle} subtitle={b.loginSubtitle}>
        <form onSubmit={submitCredentials} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email" required>E-mail</Label>
            <Input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>
                Senha
              </Label>
              <Link to="/esqueci-senha" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                Esqueci minha senha
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <FormError message={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Entrar
          </Button>
          {b.signup && (
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => {
                setAdmin(false)
                try {
                  localStorage.removeItem(ADMIN_KEY)
                } catch {
                  // sem armazenamento local
                }
              }}
            >
              Sou cliente: entrar na minha empresa ou criar conta
            </button>
          )}
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Verificação em duas etapas"
      subtitle={
        step === 'mfa'
          ? 'Digite o código de 6 dígitos do seu aplicativo autenticador.'
          : 'Digite um dos códigos de recuperação que você guardou ao ativar o 2FA.'
      }
    >
      <div className="space-y-4">
        <ClockWarning />
        {step === 'mfa' ? (
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={busy}
            autoFocus
            aria-label="Código de verificação"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitCode(code)
            }}
            className="space-y-3"
          >
            <Label htmlFor="recovery" required>
              Código de recuperação
            </Label>
            <Input id="recovery" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.trim())} />
            {code.length < 10 && <p className="text-xs text-muted-foreground">Digite o código completo, com pelo menos 10 caracteres.</p>}
            <Button type="submit" className="w-full" disabled={busy || code.length < 10}>
              {busy && <Loader2Icon className="animate-spin" />}
              Verificar
            </Button>
          </form>
        )}
        <FormError message={error} />
        <div className="flex flex-col gap-1 text-sm">
          <button
            type="button"
            className="text-left text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => {
              setStep(step === 'mfa' ? 'recovery' : 'mfa')
              setCode('')
              setError(null)
            }}
          >
            {step === 'mfa' ? 'Perdi o acesso ao autenticador: usar código de recuperação' : 'Usar o código do aplicativo autenticador'}
          </button>
          <button
            type="button"
            className="text-left text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => {
              setStep('credentials')
              setCode('')
              setError(null)
            }}
          >
            Voltar para o login
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
