import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2Icon, CheckIcon, ExternalLinkIcon, GlobeIcon, Loader2Icon, MailIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Can, EmptyState, ErrorState, formatDate, formatDateTime, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { usePageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'

interface Plan {
  id: string
  name: string
  description: string
  priceCents: number
  systems: string[]
  maxUsers: number
  maxWhatsapp: number
  trialDays: number
  public: boolean
  active: boolean
  sortOrder: number
  companies: number
}
interface Company {
  id: string
  name: string
  slug: string
  url: string
  status: string
  statusLabel: string
  plan: { id: string; name: string; priceCents: number } | null
  trialEndsAt: string | null
  paidUntil: string | null
  users: number
  whatsapp: number
  extraUsers: number
  extraWhatsapp: number
  extraSystems: string[]
  document: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  domains: { host: string; verifiedAt: string | null }[]
  createdAt: string
  access: { blocked: boolean; reason: string | null; warning: string | null }
}
interface System {
  key: string
  label: string
  onRequest: boolean
}
interface Summary {
  total: number
  byStatus: Record<string, number>
  mrrCents: number
  overdueCents: number
  overdueCount: number
  platformDomain: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  TESTE: { label: 'Em teste', cls: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200' },
  AGUARDANDO_PAGAMENTO: { label: 'Aguardando pagamento', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200' },
  ATIVA: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200' },
  ATRASADA: { label: 'Pagamento atrasado', cls: 'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200' },
  SUSPENSA: { label: 'Suspensa', cls: 'bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200' },
  CANCELADA: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground' },
}
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const slugOf = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function StatusBadge({ s, label }: { s: string; label?: string }) {
  return <span className={cn('inline-flex rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', STATUS[s]?.cls ?? 'bg-muted')}>{label ?? STATUS[s]?.label ?? s}</span>
}

export function PlataformaPage() {
  usePageTitle('Plataforma')
  const [tab, setTab] = useState('empresas')
  const summary = useQuery({ queryKey: ['plataforma-resumo'], queryFn: () => api.get<Summary>('/plataforma/resumo') })
  const systems = useQuery({ queryKey: ['plataforma-sistemas'], queryFn: () => api.get<System[]>('/plataforma/sistemas'), staleTime: Infinity })
  const plans = useQuery({ queryKey: ['plataforma-planos'], queryFn: () => api.get<Plan[]>('/plataforma/planos') })
  const s = summary.data
  return (
    <RequirePermission module="plataforma">
      <PageHeader title="Plataforma" description="Empresas clientes, planos e cobranças da sgmulticonecta. Cada empresa usa o sistema no endereço dela, com os sistemas do plano." />
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Empresas', String(s.total)],
            ['Ativas', String(s.byStatus.ATIVA ?? 0)],
            ['Em teste', String(s.byStatus.TESTE ?? 0)],
            ['Atrasadas ou suspensas', String((s.byStatus.ATRASADA ?? 0) + (s.byStatus.SUSPENSA ?? 0))],
            ['Receita mensal (ativas)', brl(s.mrrCents)],
          ].map(([k, v]) => (
            <Card key={k} className="gap-1 px-4 py-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-xl font-semibold tabular-nums">{v}</p>
            </Card>
          ))}
        </div>
      )}
      {s && !s.platformDomain && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">PLATFORM_DOMAIN não configurado no servidor: as empresas ainda não têm endereço próprio (vale só a empresa padrão).</p>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3">
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
        </TabsList>
        <TabsContent value="empresas">
          <Companies plans={plans.data ?? []} systems={systems.data ?? []} />
        </TabsContent>
        <TabsContent value="planos">{plans.error ? <ErrorState error={plans.error} /> : <Plans plans={plans.data} systems={systems.data ?? []} />}</TabsContent>
        <TabsContent value="cobrancas">{tab === 'cobrancas' && <Payments />}</TabsContent>
        <TabsContent value="site">{tab === 'site' && <SiteContact />}</TabsContent>
      </Tabs>
    </RequirePermission>
  )
}

// ---------- Empresas ----------

function Companies({ plans, systems }: { plans: Plan[]; systems: System[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todas')
  const [open, setOpen] = useState<Company | null>(null)
  const [creating, setCreating] = useState(false)
  const params = new URLSearchParams({ ...(search.trim() ? { busca: search.trim() } : {}), ...(status !== 'todas' ? { situacao: status } : {}) })
  const q = useQuery({ queryKey: ['plataforma-empresas', params.toString()], queryFn: () => api.get<Company[]>(`/plataforma/empresas?${params}`) })
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, endereço, e-mail ou CNPJ" className="pl-8" aria-label="Buscar empresas" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Can module="plataforma" action="create">
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> Nova empresa
          </Button>
        </Can>
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <TableSkeleton rows={5} />
      ) : !q.data.length ? (
        <EmptyState icon={Building2Icon} title="Nenhuma empresa" description="Cadastre a primeira empresa cliente em Nova empresa (ou ela se cadastra sozinha pela página de cadastro)." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Pago até / teste até</TableHead>
                <TableHead className="text-right">Usuários</TableHead>
                <TableHead className="text-right">WhatsApp</TableHead>
                <TableHead>Desde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                  <TableCell className="pl-4">
                    <span className="block font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.url.replace(/^https:\/\//, '')}</span>
                  </TableCell>
                  <TableCell>{c.plan ? `${c.plan.name} · ${brl(c.plan.priceCents)}` : <span className="text-muted-foreground">Sem plano</span>}</TableCell>
                  <TableCell>
                    <StatusBadge s={c.status} label={c.statusLabel} />
                  </TableCell>
                  <TableCell className="text-sm">{c.status === 'TESTE' ? `teste até ${formatDate(c.trialEndsAt)}` : c.paidUntil ? formatDate(c.paidUntil) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.users}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.whatsapp}</TableCell>
                  <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <NewCompanyDialog open={creating} onClose={() => setCreating(false)} plans={plans} />
      {open && <CompanySheet company={open} plans={plans} systems={systems} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NewCompanyDialog({ open, onClose, plans }: { open: boolean; onClose: () => void; plans: Plan[] }) {
  const qc = useQueryClient()
  const empty = { name: '', slug: '', planId: '', start: 'TESTE', trialDays: 7, adminName: '', adminEmail: '', document: '', contactPhone: '' }
  const [d, setD] = useState(empty)
  const [slugEdited, setSlugEdited] = useState(false)
  useEffect(() => {
    if (open) {
      setD(empty)
      setSlugEdited(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const create = useMutation({
    mutationFn: () => api.post<{ message: string; inviteSent: boolean }>('/plataforma/empresas', { ...d, planId: d.planId || null, trialDays: d.start === 'TESTE' ? d.trialDays : undefined }),
    onSuccess: (r) => {
      ;(r.inviteSent ? toast.success : toast.warning)(r.message, { duration: 15_000 })
      void qc.invalidateQueries({ queryKey: ['plataforma-empresas'] })
      void qc.invalidateQueries({ queryKey: ['plataforma-resumo'] })
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const domain = useQuery({ queryKey: ['plataforma-resumo'], queryFn: () => api.get<Summary>('/plataforma/resumo') }).data?.platformDomain
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>Cria a empresa com os perfis padrão e manda o convite para o administrador criar a senha.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Nome da empresa</Label>
            <Input id="c-name" value={d.name} maxLength={120} onChange={(e) => setD({ ...d, name: e.target.value, slug: slugEdited ? d.slug : slugOf(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-slug">Endereço</Label>
            <div className="flex items-center gap-1">
              <Input
                id="c-slug"
                value={d.slug}
                maxLength={30}
                onChange={(e) => {
                  setSlugEdited(true)
                  setD({ ...d, slug: slugOf(e.target.value) })
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">.{domain ?? 'seu-dominio'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={d.planId || 'nenhum'} onValueChange={(v) => setD({ ...d, planId: v === 'nenhum' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem plano</SelectItem>
                  {plans
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {brl(p.priceCents)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Começa</Label>
              <Select value={d.start} onValueChange={(v) => setD({ ...d, start: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TESTE">Em teste grátis</SelectItem>
                  <SelectItem value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</SelectItem>
                  <SelectItem value="ATIVA">Ativa (paga por fora)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {d.start === 'TESTE' && (
            <div className="space-y-1.5">
              <Label>Dias de teste</Label>
              <Select value={String(d.trialDays)} onValueChange={(v) => setD({ ...d, trialDays: Number(v) })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 7, 14, 30].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-an">Administrador (nome)</Label>
              <Input id="c-an" value={d.adminName} maxLength={120} onChange={(e) => setD({ ...d, adminName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-ae">E-mail do administrador</Label>
              <Input id="c-ae" type="email" value={d.adminEmail} maxLength={200} onChange={(e) => setD({ ...d, adminEmail: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-doc">CNPJ ou CPF</Label>
              <Input id="c-doc" value={d.document} maxLength={20} onChange={(e) => setD({ ...d, document: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-ph">Telefone</Label>
              <Input id="c-ph" value={d.contactPhone} maxLength={20} onChange={(e) => setD({ ...d, contactPhone: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !d.name.trim() || d.slug.length < 3 || !d.adminEmail.trim() || !d.adminName.trim()}>
            {create.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Criar empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CompanySheet({ company: c, plans, systems, onClose }: { company: Company; plans: Plan[]; systems: System[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const edit = can('plataforma', 'edit')
  const [f, setF] = useState({ name: c.name, planId: c.plan?.id ?? '', status: c.status, paidUntil: dateInput(c.paidUntil), trialEndsAt: dateInput(c.trialEndsAt), extraUsers: c.extraUsers, extraWhatsapp: c.extraWhatsapp, extraSystems: c.extraSystems, contactName: c.contactName ?? '', contactEmail: c.contactEmail ?? '', contactPhone: c.contactPhone ?? '', document: c.document ?? '', notes: c.notes ?? '' })
  const [host, setHost] = useState('')
  const [domains, setDomains] = useState(c.domains)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['plataforma-empresas'] })
    void qc.invalidateQueries({ queryKey: ['plataforma-resumo'] })
  }
  const save = useMutation({
    mutationFn: () =>
      api.put('/plataforma/empresas/' + c.id, {
        ...f,
        planId: f.planId || null,
        paidUntil: f.paidUntil ? new Date(`${f.paidUntil}T23:59:00-03:00`).toISOString() : null,
        trialEndsAt: f.trialEndsAt ? new Date(`${f.trialEndsAt}T23:59:00-03:00`).toISOString() : null,
      }),
    onSuccess: (r) => {
      const w = (r as { warning?: string | null }).warning
      if (w) toast.warning(w, { duration: 12_000 })
      else toast.success('Empresa salva.')
      refresh()
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const charge = useMutation({
    mutationFn: () => api.post<{ payUrl: string | null }>(`/plataforma/empresas/${c.id}/cobranca`),
    onSuccess: (r) => {
      toast.success(r.payUrl ? 'Cobrança no Asaas pronta. A fatura em aberto foi copiada para a área de transferência.' : 'Assinatura no Asaas conferida. Nenhuma fatura em aberto agora.')
      if (r.payUrl) void navigator.clipboard?.writeText(r.payUrl).catch(() => undefined)
      void qc.invalidateQueries({ queryKey: ['plataforma-cobrancas'] })
    },
    onError: (err) => toast.error(errorMessage(err), { duration: 12_000 }),
  })
  const invite = useMutation({
    mutationFn: () => api.post<{ message: string }>(`/plataforma/empresas/${c.id}/convite`),
    onSuccess: (r) => toast.success(r.message),
    onError: (err) => toast.error(errorMessage(err), { duration: 10_000 }),
  })
  const addDomain = useMutation({
    mutationFn: () => api.post<{ ok: boolean; host: string; message: string }>(`/plataforma/empresas/${c.id}/dominios`, { host }),
    onSuccess: (r) => {
      ;(r.ok ? toast.success : toast.warning)(r.message, { duration: 15_000 })
      setDomains([...domains, { host: r.host, verifiedAt: r.ok ? new Date().toISOString() : null }])
      setHost('')
      refresh()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const verify = useMutation({
    mutationFn: (h: string) => api.post<{ ok: boolean; host: string; message: string }>(`/plataforma/empresas/${c.id}/dominios/verificar`, { host: h }),
    onSuccess: (r) => {
      ;(r.ok ? toast.success : toast.warning)(r.message, { duration: 15_000 })
      setDomains(domains.map((d) => (d.host === r.host ? { ...d, verifiedAt: r.ok ? (d.verifiedAt ?? new Date().toISOString()) : null } : d)))
      refresh()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const removeDomain = useMutation({
    mutationFn: (h: string) => api.delete(`/plataforma/empresas/${c.id}/dominios/${encodeURIComponent(h)}`),
    onSuccess: (_r, h) => (setDomains(domains.filter((d) => d.host !== h)), refresh()),
    onError: (err) => toast.error(errorMessage(err)),
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {c.name} <StatusBadge s={c.status} label={c.statusLabel} />
          </SheetTitle>
          <SheetDescription>
            <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              {c.url.replace(/^https:\/\//, '')} <ExternalLinkIcon className="size-3.5" />
            </a>{' '}
            · {c.users} usuário(s) · {c.whatsapp} WhatsApp · desde {formatDate(c.createdAt)}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {(c.access.reason || c.access.warning) && <p className="rounded-md border bg-muted/40 p-2 text-sm">{c.access.reason ?? c.access.warning}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-name">Nome</Label>
              <Input id="e-name" value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={f.planId || 'nenhum'} onValueChange={(v) => set('planId', v === 'nenhum' ? '' : v)} disabled={!edit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem plano</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {brl(p.priceCents)}
                      {p.active ? '' : ' (desativado)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={f.status} onValueChange={(v) => set('status', v)} disabled={!edit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-paid">Pago até</Label>
              <Input id="e-paid" type="date" value={f.paidUntil} onChange={(e) => set('paidUntil', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-trial">Teste até</Label>
              <Input id="e-trial" type="date" value={f.trialEndsAt} onChange={(e) => set('trialEndsAt', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-xu">Usuários adicionais</Label>
              <Input id="e-xu" type="number" min={0} value={f.extraUsers} onChange={(e) => set('extraUsers', Number(e.target.value) || 0)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-xw">WhatsApp adicionais</Label>
              <Input id="e-xw" type="number" min={0} value={f.extraWhatsapp} onChange={(e) => set('extraWhatsapp', Number(e.target.value) || 0)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-cn">Contato</Label>
              <Input id="e-cn" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-ce">E-mail de cobrança</Label>
              <Input id="e-ce" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-cp">Telefone</Label>
              <Input id="e-cp" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-doc">CNPJ ou CPF</Label>
              <Input id="e-doc" value={f.document} onChange={(e) => set('document', e.target.value)} disabled={!edit} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Sistemas sob consulta liberados para esta empresa</Label>
              <div className="grid gap-1.5">
                {systems
                  .filter((x) => x.onRequest)
                  .map((x) => (
                    <label key={x.key} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={f.extraSystems.includes(x.key)} onCheckedChange={(v) => set('extraSystems', v ? [...f.extraSystems, x.key] : f.extraSystems.filter((k) => k !== x.key))} disabled={!edit} /> {x.label}
                    </label>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">Sem a liberação, o item aparece no menu da empresa com o selo “Sob consulta”.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-notes">Observação interna</Label>
              <Textarea id="e-notes" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} disabled={!edit} />
            </div>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <GlobeIcon className="size-4" /> Domínio próprio
            </p>
            <p className="text-xs text-muted-foreground">O cliente cria no DNS do domínio dele um registro CNAME apontando para {c.url.replace(/^https:\/\//, '')}. Depois de conferido, os links do sistema passam a usar o domínio dele.</p>
            {domains.map((d) => (
              <div key={d.host} className="flex items-center gap-2 text-sm">
                <span className="font-medium">{d.host}</span>
                <Badge variant={d.verifiedAt ? 'secondary' : 'outline'}>{d.verifiedAt ? 'conferido' : 'aguardando DNS'}</Badge>
                {edit && (
                  <>
                    <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => verify.mutate(d.host)} disabled={verify.isPending}>
                      <RefreshCwIcon /> Conferir
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => removeDomain.mutate(d.host)} aria-label={`Remover ${d.host}`}>
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {edit && (
              <div className="flex gap-2">
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="crm.empresa.com.br" />
                <Button variant="outline" onClick={() => addDomain.mutate()} disabled={!host.trim() || addDomain.isPending}>
                  <PlusIcon /> Adicionar
                </Button>
              </div>
            )}
          </div>
          {edit && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Salvar
              </Button>
              <Button variant="outline" onClick={() => invite.mutate()} disabled={invite.isPending}>
                <MailIcon /> Reenviar convite ao administrador
              </Button>
              <Button variant="outline" onClick={() => charge.mutate()} disabled={charge.isPending}>
                {charge.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Gerar ou conferir a cobrança no Asaas
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------- Planos ----------

function Plans({ plans, systems }: { plans?: Plan[]; systems: System[] }) {
  const [open, setOpen] = useState<Plan | 'novo' | null>(null)
  if (!plans) return <TableSkeleton rows={3} />
  return (
    <div className="space-y-3">
      <Can module="plataforma" action="create">
        <Button onClick={() => setOpen('novo')}>
          <PlusIcon /> Novo plano
        </Button>
      </Can>
      {!plans.length && <EmptyState icon={Building2Icon} title="Nenhum plano" description="Crie os planos com o valor mensal, os sistemas liberados e os limites." />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className={cn('cursor-pointer gap-2 p-4 hover:shadow-md', !p.active && 'opacity-60')} onClick={() => setOpen(p)}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="text-lg font-semibold tabular-nums">
                {brl(p.priceCents)}
                <span className="text-xs font-normal text-muted-foreground">/mês</span>
              </p>
            </div>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <p className="text-sm">
              {p.maxUsers} usuários · {p.maxWhatsapp} WhatsApp · {p.trialDays ? `${p.trialDays} dias de teste` : 'sem teste'}
            </p>
            <div className="flex flex-wrap gap-1">
              {p.systems.map((s) => (
                <Badge key={s} variant="secondary">
                  {systems.find((x) => x.key === s)?.label.split(' (')[0] ?? s}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {p.companies} empresa(s) · {p.active ? (p.public ? 'aparece no cadastro' : 'só pela plataforma') : 'desativado'}
            </p>
          </Card>
        ))}
      </div>
      {open && <PlanDialog plan={open === 'novo' ? null : open} systems={systems} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PlanDialog({ plan, systems, onClose }: { plan: Plan | null; systems: System[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ name: plan?.name ?? '', description: plan?.description ?? '', price: plan ? (plan.priceCents / 100).toFixed(2).replace('.', ',') : '', systems: plan?.systems ?? [], maxUsers: plan?.maxUsers ?? 5, maxWhatsapp: plan?.maxWhatsapp ?? 1, trialDays: plan?.trialDays ?? 7, public: plan?.public ?? true, active: plan?.active ?? true, sortOrder: plan?.sortOrder ?? 0 })
  const save = useMutation({
    mutationFn: () => {
      const priceCents = Math.round(Number(f.price.replace(/\./g, '').replace(',', '.')) * 100)
      const body = { name: f.name, description: f.description, priceCents, systems: f.systems, maxUsers: f.maxUsers, maxWhatsapp: f.maxWhatsapp, trialDays: f.trialDays, public: f.public, active: f.active, sortOrder: f.sortOrder }
      return plan ? api.put(`/plataforma/planos/${plan.id}`, body) : api.post('/plataforma/planos', body)
    },
    onSuccess: () => {
      toast.success('Plano salvo.')
      void qc.invalidateQueries({ queryKey: ['plataforma-planos'] })
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? `Plano ${plan.name}` : 'Novo plano'}</DialogTitle>
          <DialogDescription>Valor fixo por mês, os sistemas liberados e os limites. Mudanças valem na hora para as empresas do plano.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nome</Label>
              <Input id="p-name" maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Profissional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Valor mensal (R$)</Label>
              <Input id="p-price" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="297,00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Descrição (aparece no cadastro)</Label>
            <Textarea id="p-desc" rows={2} maxLength={400} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sistemas liberados</Label>
            <p className="text-xs text-muted-foreground">Sempre liberados: Início, Leads, Cadastros, Usuários, Perfis, Configurações, Sugestões e Auditoria.</p>
            <div className="grid gap-1.5">
              {systems.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={f.systems.includes(s.key)} onCheckedChange={(v) => set('systems', v ? [...f.systems, s.key] : f.systems.filter((x) => x !== s.key))} /> {s.label}
                  {s.onRequest && <span className="text-xs text-muted-foreground">(sob consulta)</span>}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-u">Usuários</Label>
              <Input id="p-u" type="number" min={1} value={f.maxUsers} onChange={(e) => set('maxUsers', Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-w">WhatsApp</Label>
              <Input id="p-w" type="number" min={0} value={f.maxWhatsapp} onChange={(e) => set('maxWhatsapp', Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Teste grátis</Label>
              <Select value={String(f.trialDays)} onValueChange={(v) => set('trialDays', Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 3, 7, 14, 30].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n ? `${n} dias` : 'Sem teste'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.public} onCheckedChange={(v) => set('public', v)} /> Aparece no cadastro
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.active} onCheckedChange={(v) => set('active', v)} /> Ativo
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.name.trim() || !f.price.trim()}>
            {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Salvar plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Cobranças ----------

function Payments() {
  const q = useQuery({ queryKey: ['plataforma-cobrancas'], queryFn: () => api.get<{ id: string; valueCents: number; status: string; billingType: string | null; dueDate: string; paidAt: string | null; invoiceUrl: string | null; tenant: { name: string; slug: string } }[]>('/plataforma/cobrancas') })
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <TableSkeleton rows={4} />
  if (!q.data.length) return <EmptyState icon={Building2Icon} title="Nenhuma cobrança ainda" description="As mensalidades geradas no Asaas aparecem aqui, com a situação de cada uma." />
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Empresa</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Forma</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Pago em</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="pl-4">{p.tenant.name}</TableCell>
              <TableCell>{formatDate(p.dueDate)}</TableCell>
              <TableCell className="text-right tabular-nums">{brl(p.valueCents)}</TableCell>
              <TableCell>{p.billingType ?? '—'}</TableCell>
              <TableCell>{p.status}</TableCell>
              <TableCell>{p.paidAt ? formatDateTime(p.paidAt) : '—'}</TableCell>
              <TableCell>
                {p.invoiceUrl && (
                  <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                    Fatura <ExternalLinkIcon className="size-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

interface SiteContactData {
  whatsapp: string
  email: string
  instagram: string
}

/** Contato do site de apresentação: os planos aparecem lá sem preço, com "consultar valores" por estes canais. */
function SiteContact() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['plataforma-site'], queryFn: () => api.get<SiteContactData>('/plataforma/site') })
  const [f, setF] = useState<SiteContactData | null>(null)
  useEffect(() => {
    if (q.data) setF(q.data)
  }, [q.data])
  const save = useMutation({
    mutationFn: (d: SiteContactData) => api.put<SiteContactData>('/plataforma/site', { ...d }),
    onSuccess: (d) => {
      qc.setQueryData(['plataforma-site'], d)
      toast.success('Contato do site salvo.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  if (q.error) return <ErrorState error={q.error} />
  if (!f) return <TableSkeleton />
  return (
    <Card className="max-w-xl gap-4 p-5">
      <div>
        <p className="font-medium">Contato do site de apresentação</p>
        <p className="text-sm text-muted-foreground">No site, os planos aparecem sob consulta. O botão "Consultar valores" abre o WhatsApp com a mensagem pronta; o e-mail e o Instagram ficam no rodapé.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-wa">WhatsApp comercial (com DDD)</Label>
        <Input id="st-wa" inputMode="tel" placeholder="(49) 99999-9999" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-em">E-mail comercial</Label>
        <Input id="st-em" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-ig">Instagram (opcional)</Label>
        <Input id="st-ig" placeholder="@sgmulticonecta" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} />
      </div>
      <Can module="plataforma" action="edit">
        <Button className="self-start" onClick={() => save.mutate(f)} disabled={save.isPending}>
          {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Salvar
        </Button>
      </Can>
    </Card>
  )
}
