import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useBranding } from '@/lib/branding'
import { usePageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'

interface PublicPlan {
  id: string
  name: string
  description: string
  maxUsers: number
  maxWhatsapp: number
  trialDays: number
  systems: string[]
}

/** Link "Consultar valores": WhatsApp comercial do site (Plataforma → Site), com a mensagem pronta. */
const consultLink = (whatsapp: string, plan: string) => {
  const n = whatsapp.replace(/\D/g, '')
  return n ? `https://wa.me/${n.length <= 11 ? `55${n}` : n}?text=${encodeURIComponent(`Olá! Quero saber os valores do plano ${plan}.`)}` : null
}
const slugOf = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

/**
 * Cadastro de uma empresa nova (no domínio da plataforma): escolhe o plano, os dados da empresa e do administrador.
 * Com teste grátis, já pode usar; sem teste, o acesso libera quando o pagamento da primeira mensalidade é confirmado.
 */
export function CadastroPage() {
  usePageTitle('Cadastro')
  const branding = useBranding()
  const plans = useQuery({ queryKey: ['cadastro-planos'], queryFn: () => api.get<PublicPlan[]>('/public/cadastro/planos') })
  const site = useQuery({ queryKey: ['public-site'], queryFn: () => api.get<{ contact: { whatsapp: string; email: string } }>('/public/site'), retry: false })
  const whatsapp = site.data?.contact.whatsapp ?? ''
  // Link de um plano específico (ex.: página de apresentação): /cadastro?plano=<id>
  const [params] = useSearchParams()
  const [planId, setPlanId] = useState(params.get('plano') ?? '')
  const [f, setF] = useState({ company: '', slug: '', document: '', adminName: '', email: '', phone: '', password: '', password2: '' })
  const [slugEdited, setSlugEdited] = useState(false)
  const [terms, setTerms] = useState(false)
  const [slugState, setSlugState] = useState<{ available: boolean; url: string | null } | null>(null)
  useEffect(() => {
    if (plans.data?.length && !plans.data.some((p) => p.id === planId)) setPlanId(plans.data.find((p) => p.trialDays)?.id ?? plans.data[0]!.id)
  }, [plans.data, planId])
  useEffect(() => {
    if (f.slug.length < 3) return setSlugState(null)
    const t = setTimeout(() => {
      api.get<{ available: boolean; url: string | null }>(`/public/cadastro/endereco?slug=${encodeURIComponent(f.slug)}`).then(setSlugState, () => setSlugState(null))
    }, 400)
    return () => clearTimeout(t)
  }, [f.slug])
  const signup = useMutation({
    mutationFn: () => api.post<{ url: string; trialDays: number; payUrl: string | null; message: string }>('/public/cadastro', { company: f.company, slug: f.slug, planId, document: f.document, adminName: f.adminName, email: f.email, phone: f.phone || undefined, password: f.password }),
    onError: (err) => toast.error(errorMessage(err), { duration: 10_000 }),
  })
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }))
  const plan = plans.data?.find((p) => p.id === planId)
  const ready = !!plan && f.company.trim().length > 1 && f.slug.length >= 3 && slugState?.available !== false && f.document.replace(/\D/g, '').length >= 11 && f.adminName.trim().length > 1 && /\S+@\S+\.\S+/.test(f.email) && f.password.length >= 12 && f.password === f.password2 && terms

  if (signup.data) {
    const r = signup.data
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-lg gap-4 p-6 text-center">
          <CheckIcon className="mx-auto size-10 text-emerald-600" />
          <h1 className="text-xl font-semibold">Cadastro feito!</h1>
          <p className="text-sm text-muted-foreground">{r.message}</p>
          <p className="text-sm">
            Endereço da sua empresa:{' '}
            <a href={`${r.url}/login`} className="font-medium underline">
              {r.url.replace(/^https:\/\//, '')}
            </a>
          </p>
          <p className="text-xs text-muted-foreground">Se o endereço não abrir na hora, aguarde até 5 minutos: o certificado de segurança (HTTPS) dele está sendo preparado.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {r.payUrl && (
              <Button asChild>
                <a href={r.payUrl} target="_blank" rel="noreferrer">
                  Pagar a primeira mensalidade <ExternalLinkIcon />
                </a>
              </Button>
            )}
            <Button variant={r.payUrl ? 'outline' : 'default'} asChild>
              <a href={`${r.url}/login`}>Entrar no sistema</a>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Comece a usar o {branding.appName}</h1>
          <p className="text-muted-foreground">Escolha o plano, cadastre a empresa e o administrador. Cada empresa tem o seu endereço próprio.</p>
          <p className="mt-1 text-sm">
            Já tem cadastro?{' '}
            <Link to="/login" className="font-medium underline">
              Entrar na minha empresa
            </Link>
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.data?.map((p) => (
            <button key={p.id} type="button" onClick={() => setPlanId(p.id)} className={cn('flex flex-col items-start rounded-xl border bg-card p-4 text-left shadow-sm transition', planId === p.id ? 'ring-2 ring-primary' : 'hover:shadow-md')}>
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="text-xl font-semibold text-primary">Sob consulta</p>
              {p.trialDays > 0 && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{p.trialDays} dias grátis para testar</p>}
              {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
              <ul className="mt-2 space-y-0.5 text-sm">
                <li>
                  {p.maxUsers} usuário(s) · {p.maxWhatsapp} número(s) de WhatsApp
                </li>
                {p.systems.map((s) => (
                  <li key={s} className="flex gap-1.5">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {s}
                  </li>
                ))}
              </ul>
            </button>
          ))}
          {plans.data && !plans.data.length && <p className="text-center text-sm text-muted-foreground md:col-span-3">Nenhum plano disponível para cadastro agora. Fale com a SG Multiconecta.</p>}
        </div>
        {plan && consultLink(whatsapp, plan.name) && (
          <p className="text-center text-sm">
            Valores sob consulta.{' '}
            <a href={consultLink(whatsapp, plan.name)!} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
              Consultar valores do plano {plan.name} no WhatsApp
            </a>
          </p>
        )}
        <Card className="gap-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-co">Nome da empresa</Label>
              <Input id="s-co" maxLength={120} value={f.company} onChange={(e) => setF((x) => ({ ...x, company: e.target.value, slug: slugEdited ? x.slug : slugOf(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-slug">Endereço da empresa</Label>
              <Input
                id="s-slug"
                maxLength={30}
                value={f.slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  set('slug', slugOf(e.target.value))
                }}
              />
              {slugState && <p className={cn('text-xs', slugState.available ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>{slugState.available ? `Disponível: ${slugState.url?.replace(/^https:\/\//, '') ?? f.slug}` : 'Já está em uso. Escolha outro.'}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-doc">CNPJ ou CPF</Label>
              <Input id="s-doc" maxLength={20} inputMode="numeric" value={f.document} onChange={(e) => set('document', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-ph">Telefone (WhatsApp)</Label>
              <Input id="s-ph" maxLength={20} inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-an">Seu nome (administrador)</Label>
              <Input id="s-an" maxLength={120} value={f.adminName} onChange={(e) => set('adminName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-em">Seu e-mail</Label>
              <Input id="s-em" type="email" maxLength={200} value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-pw">Senha (mínimo 12 caracteres)</Label>
              <Input id="s-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-pw2">Repita a senha</Label>
              <Input id="s-pw2" type="password" autoComplete="new-password" value={f.password2} onChange={(e) => set('password2', e.target.value)} />
              {f.password2 && f.password !== f.password2 && <p className="text-xs text-destructive">As senhas não são iguais.</p>}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
            <span>Li e aceito os termos de uso e a política de privacidade. Entendo que, sem teste grátis, o acesso é liberado quando o pagamento da primeira mensalidade for confirmado, e que a falta de pagamento bloqueia o acesso.</span>
          </label>
          <Button size="lg" onClick={() => signup.mutate()} disabled={!ready || signup.isPending}>
            {signup.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {plan?.trialDays ? `Começar o teste grátis de ${plan.trialDays} dias` : 'Cadastrar e pagar a primeira mensalidade'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Já tem cadastro?{' '}
            <Link to="/login" className="underline">
              Entre pelo endereço da sua empresa
            </Link>
            . Dúvidas: {branding.supportEmail || 'fale com a SG Multiconecta'}.
          </p>
        </Card>
      </div>
    </div>
  )
}
