import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, PackageSearchIcon, PlugZapIcon, RefreshCwIcon, SearchIcon, ShieldCheckIcon } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, ErrorState, formatDateTime, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { brl, int } from '@/lib/atendimento'
import { useAuth } from '@/lib/auth'

type VpnStatus = 'publico' | 'liberado' | 'aguardando' | 'bloqueado'

interface TrierConfig {
  enabled: boolean
  baseUrl: string
  hasToken: boolean
  ecommerceOnly: boolean
  useEcommerceValues: boolean
  importCost: boolean
  fullEveryHours: number
  incrementalMinutes: number
  vpn: { status: VpnStatus; allowed: string | null }
  state: {
    lastFullAt: string | null
    lastIncrementalAt: string | null
    running: 'full' | 'incremental' | null
    runningSince: string | null
    lastError: string | null
    lastErrorAt: string | null
    lastOkAt: string | null
    products: number
    removed: number
  }
}

interface TrierItem {
  code: string
  ean: string | null
  name: string
  brand: string | null
  department: string | null
  groupName: string | null
  category: string | null
  typeName: string | null
  activeIngredient: string | null
  active: boolean
  ecommerce: boolean
  price: number | null
  stock: number | null
  syncedAt: string
}

interface TrierList {
  total: number
  page: number
  pageSize: number
  items: TrierItem[]
  sync: TrierConfig['state'] & { enabled: boolean }
}

interface VpnRow {
  tenantId: string
  company: string
  baseUrl: string
  requested: string
  status: VpnStatus
  allowed: string | null
  allowedBy: string | null
  allowedAt: string | null
}

const VPN_LABEL: Record<VpnStatus, string> = {
  publico: 'Endereço público',
  liberado: 'Acesso pela VPN: liberado',
  aguardando: 'Acesso pela VPN: aguardando liberação da plataforma',
  bloqueado: 'Endereço bloqueado',
}

/** Integração Trier (ERP de farmácias): produtos copiados, configuração e, na plataforma, o acesso pela VPN. */
export function TrierPage() {
  const { me, can } = useAuth()
  const platform = !!me?.company?.isPlatform && can('plataforma', 'view')
  return (
    <RequirePermission module="erp_trier">
      <PageHeader title="Integração Trier" description="Produtos, estoque e preço de venda do ERP Trier (farmácias), copiados pela API da Trier." />
      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          {platform && <TabsTrigger value="vpn">Acesso pela VPN (plataforma)</TabsTrigger>}
        </TabsList>
        <TabsContent value="produtos" className="mt-4">
          <Products />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <ConfigTab />
        </TabsContent>
        {platform && (
          <TabsContent value="vpn" className="mt-4">
            <VpnPlatform />
          </TabsContent>
        )}
      </Tabs>
    </RequirePermission>
  )
}

function Products() {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [ecommerce, setEcommerce] = useState('todos')
  const [inStock, setInStock] = useState(false)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const t = setTimeout(() => (setTerm(text.trim()), setPage(1)), 300)
    return () => clearTimeout(t)
  }, [text])
  const qs = new URLSearchParams({ ...(term ? { busca: term } : {}), ecommerce, ...(inStock ? { estoque: 'true' } : {}), pagina: String(page) }).toString()
  const q = useQuery({ queryKey: ['trier-produtos', qs], queryFn: () => api.get<TrierList>(`/trier/produtos?${qs}`), placeholderData: keepPreviousData })
  const d = q.data
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Código, EAN, nome, laboratório, departamento…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar produto" />
        </div>
        <Select value={ecommerce} onValueChange={(v) => (setEcommerce(v), setPage(1))}>
          <SelectTrigger className="w-56" aria-label="E-commerce">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os produtos</SelectItem>
            <SelectItem value="sim">Marcados para e-commerce</SelectItem>
            <SelectItem value="nao">Fora do e-commerce</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Switch checked={inStock} onCheckedChange={(v) => (setInStock(v), setPage(1))} aria-label="Só com estoque" /> Só com estoque
        </label>
      </div>
      {d && <SyncLine s={d.sync} />}
      {q.isLoading && <TableSkeleton rows={6} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && !d.total && <EmptyState icon={PackageSearchIcon} title="Nenhum produto" description={d.sync.enabled ? 'A cópia começa logo depois de ligar a integração (ou use “Copiar agora” na configuração).' : 'Configure e ligue a integração na aba Configuração.'} />}
      {d && d.total > 0 && (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Laboratório</TableHead>
                <TableHead>Departamento / grupo / categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="font-mono text-xs">
                    {p.code}
                    {p.ean && <div className="text-muted-foreground">{p.ean}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.ecommerce && <Badge variant="secondary">E-commerce</Badge>}
                      {p.typeName && <Badge variant="outline">{p.typeName}</Badge>}
                      {p.activeIngredient && <Badge variant="outline">Princípio ativo: {p.activeIngredient}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{p.brand ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[p.department, p.groupName, p.category].filter(Boolean).join(' › ') || '—'}</TableCell>
                  <TableCell className="text-right">{p.price === null ? '—' : brl.format(p.price)}</TableCell>
                  <TableCell className="text-right">{p.stock === null ? '—' : int.format(p.stock)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {d && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>
            {page} de {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}

function SyncLine({ s }: { s: TrierConfig['state'] & { enabled?: boolean } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>{int.format(s.products)} produtos</span>
      <span>Cópia completa: {formatDateTime(s.lastFullAt)}</span>
      <span>Alterados: {formatDateTime(s.lastIncrementalAt)}</span>
      {s.running && (
        <span className="flex items-center gap-1">
          <Loader2Icon className="size-3 animate-spin" /> {s.running === 'full' ? 'Copiando tudo…' : 'Lendo alterados…'}
        </span>
      )}
      {s.lastError && (
        <span className="flex items-center gap-1 text-destructive">
          <AlertTriangleIcon className="size-3" /> {s.lastError} ({formatDateTime(s.lastErrorAt)})
        </span>
      )}
    </div>
  )
}

function ConfigTab() {
  const q = useQuery({ queryKey: ['trier-config'], queryFn: () => api.get<TrierConfig>('/trier/config'), refetchInterval: 15_000 })
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <TableSkeleton rows={6} />
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ConfigEditor key={`${q.data.baseUrl}-${q.data.enabled}-${q.data.hasToken}`} initial={q.data} />
      <Card>
        <CardHeader>
          <CardTitle>Situação</CardTitle>
          <CardDescription>Cópia completa a cada {q.data.fullEveryHours} h e produtos/estoque alterados a cada {q.data.incrementalMinutes} min.</CardDescription>
        </CardHeader>
        <CardContent className="mt-2 space-y-3 text-sm">
          <VpnBadge status={q.data.vpn.status} />
          <SyncLine s={q.data.state} />
          {q.data.state.removed > 0 && <p className="text-xs text-muted-foreground">{int.format(q.data.state.removed)} produtos sumiram da Trier na última cópia completa (os anúncios vinculados ficam com estoque 0).</p>}
          {q.data.state.lastOkAt && <p className="text-xs text-muted-foreground">Último contato bem-sucedido: {formatDateTime(q.data.state.lastOkAt)}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function VpnBadge({ status }: { status: VpnStatus }) {
  if (status === 'publico') return null
  const ok = status === 'liberado'
  return (
    <p className={`flex items-start gap-1.5 text-sm ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
      {ok ? <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" /> : <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />}
      {VPN_LABEL[status]}
      {status === 'aguardando' && '. O endereço é de rede privada: a SG Multiconecta precisa liberar este IP e porta depois de ligar a VPN.'}
    </p>
  )
}

function ConfigEditor({ initial }: { initial: TrierConfig }) {
  const { can } = useAuth()
  const canEdit = can('erp_trier', 'edit')
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
  const [token, setToken] = useState('')
  const [ecommerceOnly, setEcommerceOnly] = useState(initial.ecommerceOnly)
  const [useEcommerce, setUseEcommerce] = useState(initial.useEcommerceValues)
  const [importCost, setImportCost] = useState(initial.importCost)
  const [fullHours, setFullHours] = useState(initial.fullEveryHours)
  const [incMinutes, setIncMinutes] = useState(initial.incrementalMinutes)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => api.put<TrierConfig>('/trier/config', { enabled, baseUrl, ...(token.trim() ? { token: token.trim() } : {}), ecommerceOnly, useEcommerceValues: useEcommerce, importCost, fullEveryHours: fullHours, incrementalMinutes: incMinutes }),
    onSuccess: (v) => {
      qc.setQueryData(['trier-config'], v)
      setToken('')
      toast.success('Integração com a Trier salva.')
    },
    onError: (err) => setError(errorMessage(err)),
  })
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>('/trier/config/testar'),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (err) => toast.error(errorMessage(err)),
  })
  const sync = useMutation({
    mutationFn: () => api.post<{ started: boolean; message: string }>('/trier/config/copiar-agora'),
    onSuccess: (r) => {
      toast.success(r.message)
      void qc.invalidateQueries({ queryKey: ['trier-config'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  return (
    <Card>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setError(null)
          save.mutate()
        }}
      >
        <CardHeader>
          <CardTitle>Trier (SGF): servidor e token</CardTitle>
          <CardDescription>
            O CRM chama o servidor da Trier na farmácia (só consultas de produtos e estoque). Pela internet, a farmácia precisa de IP fixo ou DDNS e da porta 4647 liberada no roteador; pela VPN, o endereço privado precisa ser liberado pela SG Multiconecta. O token é fornecido pela Trier e fica guardado criptografado.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="trier-url">Endereço do servidor da Trier</Label>
              <Input id="trier-url" placeholder="http://farmacia.ddns.net:4647/sgfpod1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <VpnBadge status={initial.vpn.status} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trier-token">Token da Trier</Label>
              <Input id="trier-token" type="password" autoComplete="off" placeholder={initial.hasToken ? 'Guardado (deixe em branco para manter)' : 'Cole o token fornecido pela Trier'} value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <Toggle label="Só produtos marcados para e-commerce na Trier" help="Na tela de publicar aparecem só os produtos com “integração e-commerce” na Trier." checked={ecommerceOnly} onChange={setEcommerceOnly} />
            <Toggle label="Usar preço e estoque de e-commerce quando houver" help="Senão, usa o preço de venda e o estoque gerais." checked={useEcommerce} onChange={setUseEcommerce} />
            <Toggle label="Importar custo do ERP" help="Guarda o custo médio da Trier para a margem em Preços e promoções (origem ERP). Não substitui custo digitado ou importado por planilha." checked={importCost} onChange={setImportCost} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="trier-full">Cópia completa a cada (horas)</Label>
                <Input id="trier-full" type="number" min={1} max={48} value={fullHours} onChange={(e) => setFullHours(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trier-inc">Alterados a cada (minutos)</Label>
                <Input id="trier-inc" type="number" min={10} max={120} value={incMinutes} onChange={(e) => setIncMinutes(Number(e.target.value))} />
              </div>
            </div>
            <Toggle label="Integração ligada" help="Com a integração ligada, a cópia roda sozinha." checked={enabled} onChange={setEnabled} />
          </fieldset>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        {canEdit && (
          <CardFooter className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />} Salvar
            </Button>
            <Button type="button" variant="outline" disabled={test.isPending || !initial.hasToken} onClick={() => test.mutate()}>
              {test.isPending ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} Testar conexão
            </Button>
            <Button type="button" variant="outline" disabled={sync.isPending || !initial.enabled} onClick={() => sync.mutate()}>
              <RefreshCwIcon /> Copiar agora
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  )
}

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" aria-label={label} />
      <span>
        <span className="text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  )
}

/** Plataforma: libera o IP:porta privado exato de cada empresa que acessa a Trier pela VPN. */
function VpnPlatform() {
  const { can } = useAuth()
  const q = useQuery({ queryKey: ['trier-vpn'], queryFn: () => api.get<VpnRow[]>('/trier/plataforma/vpn') })
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <TableSkeleton rows={3} />
  if (!q.data.length) return <EmptyState icon={ShieldCheckIcon} title="Nenhuma empresa aguardando" description="Empresas com a Trier num endereço de rede privada (VPN) aparecem aqui para a liberação." />
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso pela VPN</CardTitle>
        <CardDescription>Libere só depois de colocar a VPS na VPN da farmácia (veja docs/TRIER-VPN.md). A liberação vale para um IP e uma porta exatos; loopback, link-local e metadados de nuvem nunca são aceitos.</CardDescription>
      </CardHeader>
      <CardContent className="mt-2 space-y-3">
        {q.data.map((r) => (
          <VpnRowEditor key={`${r.tenantId}-${r.allowed}`} r={r} canEdit={can('plataforma', 'edit')} />
        ))}
      </CardContent>
    </Card>
  )
}

function VpnRowEditor({ r, canEdit }: { r: VpnRow; canEdit: boolean }) {
  const qc = useQueryClient()
  const [address, setAddress] = useState(r.allowed ?? r.requested)
  const set = useMutation({
    mutationFn: (endereco: string | null) => api.put(`/trier/plataforma/vpn/${r.tenantId}`, { endereco }),
    onSuccess: () => {
      toast.success('Liberação gravada.')
      void qc.invalidateQueries({ queryKey: ['trier-vpn'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.company}</span>
        <Badge variant={r.status === 'liberado' ? 'secondary' : 'outline'}>{VPN_LABEL[r.status]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Endereço configurado pela empresa: <span className="font-mono">{r.baseUrl}</span>
        {r.allowed && ` · liberado: ${r.allowed} por ${r.allowedBy ?? '—'} em ${formatDateTime(r.allowedAt)}`}
      </p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Input className="w-56 font-mono" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="IP e porta" placeholder="10.8.0.20:4647" />
          <Button size="sm" disabled={set.isPending} onClick={() => set.mutate(address)}>
            <CheckCircle2Icon /> Liberar este IP:porta
          </Button>
          {r.allowed && (
            <Button size="sm" variant="outline" disabled={set.isPending} onClick={() => set.mutate(null)}>
              Retirar liberação
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
