import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckCircle2Icon, CopyIcon, KeyRoundIcon, Link2Icon, Loader2Icon, RefreshCwIcon, StoreIcon } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState, formatDateTime, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api, errorMessage } from '@/lib/api'
import { int } from '@/lib/atendimento'
import { useAuth } from '@/lib/auth'

interface Field {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  help?: string
  optional?: boolean
}
interface LojaView {
  def: { key: string; name: string; oauth: boolean; fields: Field[]; appFields: Field[]; supports: { customers: boolean; orders: boolean; carts: boolean; cartLink: boolean; products: boolean }; howTo: string }
  enabled: boolean
  values: Record<string, string>
  saved: Record<string, boolean>
  importCustomers: boolean
  importOrders: boolean
  importCarts: boolean
  importProducts: boolean
  abandonHours: number
  appReady: boolean
  app: Record<string, string> | null
  redirectUri: string | null
  connected: boolean | null
  state: { running: boolean; lastRunAt: string | null; lastOkAt: string | null; lastError: string | null; connectedAt: string | null; productsAt: string | null; totals: { customers: number; leadsCreated: number; orders: number; carts: number; products: number } }
}

/** Integração com uma loja virtual (Tray, Nuvemshop, Loja Integrada): conexão, o que importar e a situação. */
export function LojaIntegracaoPage() {
  const { loja = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['loja', loja], queryFn: () => api.get<LojaView>(`/lojas/${loja}`), enabled: !!loja, refetchInterval: (x) => (x.state.data?.state.running ? 5000 : false) })
  useEffect(() => {
    if (params.get('conectado')) toast.success('Loja conectada. Ligue a integração e salve para começar a importar.')
    else if (params.get('erro')) toast.error(params.get('erro'))
    if (params.get('conectado') || params.get('erro')) setParams({}, { replace: true })
  }, [params, setParams])
  const name = q.data?.def.name ?? 'loja virtual'
  return (
    <RequirePermission module={`loja_${loja}`}>
      <PageHeader title={`Integração ${name}`} description={`Clientes viram leads, pedidos marcam a venda, carrinhos vão para Carrinhos abandonados e produtos para o Catálogo. Só leitura: o CRM não altera nada na ${name}.`} />
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {!q.data && !q.error && <TableSkeleton />}
      {q.data && <Conteudo loja={loja} v={q.data} />}
    </RequirePermission>
  )
}

function Conteudo({ loja, v }: { loja: string; v: LojaView }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const edit = can(`loja_${loja}`, 'edit')
  const [enabled, setEnabled] = useState(v.enabled)
  const [values, setValues] = useState(v.values)
  const [opts, setOpts] = useState({ importCustomers: v.importCustomers, importOrders: v.importOrders, importCarts: v.importCarts, importProducts: v.importProducts })
  const [hours, setHours] = useState(String(v.abandonHours))
  useEffect(() => {
    setEnabled(v.enabled)
    setValues(v.values)
    setOpts({ importCustomers: v.importCustomers, importOrders: v.importOrders, importCarts: v.importCarts, importProducts: v.importProducts })
    setHours(String(v.abandonHours))
  }, [v])
  const refresh = () => qc.invalidateQueries({ queryKey: ['loja', loja] })
  const save = useMutation({
    mutationFn: () => api.put(`/lojas/${loja}`, { enabled, values, ...opts, abandonHours: Number(hours) || 2 }),
    onSuccess: () => (toast.success('Configuração salva.'), void refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>(`/lojas/${loja}/testar`), onSuccess: (r) => (r.ok ? toast.success : toast.error)(r.message), onError: (e) => toast.error(errorMessage(e)) })
  const sync = useMutation({ mutationFn: () => api.post<{ started: boolean; message: string }>(`/lojas/${loja}/sincronizar`), onSuccess: (r) => ((r.started ? toast.success : toast.info)(r.message), void refresh()), onError: (e) => toast.error(errorMessage(e)) })
  const connect = useMutation({ mutationFn: () => api.post<{ url: string }>(`/lojas/${loja}/conectar`), onSuccess: (r) => window.location.assign(r.url), onError: (e) => toast.error(errorMessage(e)) })
  const s = v.state
  const sup = v.def.supports
  const submit = (e: FormEvent) => (e.preventDefault(), save.mutate())
  const opt = (k: keyof typeof opts, label: string, ok: boolean, note?: string) => (
    <label className={`flex items-start gap-2 text-sm ${ok ? '' : 'opacity-50'}`}>
      <Switch checked={ok && opts[k]} onCheckedChange={(x) => setOpts((o) => ({ ...o, [k]: x }))} disabled={!edit || !ok} />
      <span>
        {label}
        {(note || !ok) && <span className="block text-xs text-muted-foreground">{ok ? note : `A ${v.def.name} não oferece isso pela API.`}</span>}
      </span>
    </label>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ['Clientes lidos', s.totals.customers],
          ['Leads criados', s.totals.leadsCreated],
          ['Pedidos', s.totals.orders],
          ['Carrinhos', s.totals.carts],
          ['Produtos', s.totals.products],
        ].map(([l, n]) => (
          <Card key={l as string}>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="text-2xl font-bold">{int.format(n as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {s.running ? (
          <Badge variant="secondary">
            <Loader2Icon className="animate-spin" aria-hidden /> Sincronizando…
          </Badge>
        ) : v.enabled ? (
          <Badge variant="secondary">Ligada</Badge>
        ) : (
          <Badge variant="outline">Desligada</Badge>
        )}
        <span className="text-muted-foreground">{s.lastOkAt ? `Última sincronização OK em ${formatDateTime(s.lastOkAt)}` : 'Ainda sem sincronização'}</span>
        {s.lastError && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangleIcon className="size-4" aria-hidden /> {s.lastError}
          </span>
        )}
        <span className="ml-auto flex gap-3">
          <Link to="/carrinhos" className="underline">
            Carrinhos abandonados
          </Link>
          <Link to="/catalogo" className="underline">
            Catálogo
          </Link>
        </span>
      </div>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StoreIcon className="size-4" aria-hidden /> Conexão com a {v.def.name}
            </CardTitle>
            <CardDescription className="whitespace-pre-line">{v.def.howTo}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {v.def.oauth && !v.appReady && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">O aplicativo da SG Multiconecta na {v.def.name} ainda não está configurado pela plataforma. Fale com a SG Multiconecta.</p>}
            {v.def.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`lj-${f.key}`}>
                  {f.label} {f.optional && <span className="text-muted-foreground">(opcional)</span>}
                  {f.secret && v.saved[f.key] && (
                    <Badge variant="secondary" className="ml-2">
                      guardado
                    </Badge>
                  )}
                </Label>
                <Input id={`lj-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="off" disabled={!edit} placeholder={f.secret && v.saved[f.key] ? 'Em branco mantém o guardado' : f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues((x) => ({ ...x, [f.key]: e.target.value }))} />
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
            {v.def.oauth && (
              <p className="flex items-center gap-2 text-sm">
                {v.connected ? <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden /> : <Link2Icon className="size-4" aria-hidden />}
                {v.connected ? `Loja conectada${s.connectedAt ? ` em ${formatDateTime(s.connectedAt)}` : ''}.` : 'Loja ainda não conectada: clique em Conectar e autorize na sua loja.'}
              </p>
            )}
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">O que importar</p>
              {opt('importCustomers', 'Clientes (viram leads com origem Ecommerce)', sup.customers)}
              {opt('importOrders', 'Pedidos (marcam a venda e o valor no lead)', sup.orders)}
              {opt('importCarts', 'Carrinhos (Carrinhos abandonados)', sup.carts, sup.cartLink ? 'Com o link para o cliente retomar a compra.' : `A ${v.def.name} não fornece o link de recuperação do carrinho.`)}
              {opt('importProducts', 'Produtos (Catálogo)', sup.products)}
              {sup.carts && (
                <div className="flex items-center gap-2 pt-1 text-sm">
                  <Label htmlFor="lj-h">Carrinho abandonado depois de</Label>
                  <Input id="lj-h" type="number" min={1} max={72} className="w-20" value={hours} disabled={!edit} onChange={(e) => setHours(e.target.value)} /> horas sem atividade
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!edit} /> Integração ligada (sincroniza a cada 15 minutos; produtos a cada 6 horas)
            </label>
          </CardContent>
          {edit && (
            <CardFooter className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2Icon className="animate-spin" aria-hidden />} Salvar
              </Button>
              {v.def.oauth && (
                <Button type="button" variant="outline" disabled={connect.isPending || !v.appReady} onClick={() => connect.mutate()}>
                  <Link2Icon aria-hidden /> {v.connected ? 'Conectar de novo' : 'Conectar'}
                </Button>
              )}
              <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
                {test.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <CheckCircle2Icon aria-hidden />} Testar conexão
              </Button>
              <Button type="button" variant="outline" disabled={sync.isPending || s.running} onClick={() => sync.mutate()}>
                <RefreshCwIcon aria-hidden /> Sincronizar agora
              </Button>
            </CardFooter>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como funciona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>A primeira sincronização traz os clientes e os pedidos dos últimos 2 anos; depois, só o que mudou.</p>
              <p>Os dados vão para as mesmas telas da loja virtual: Leads, Carrinhos abandonados e Catálogo, com os e-mails e as automações de carrinho.</p>
              <p>Credenciais e tokens ficam guardados criptografados. CPF e CNPJ dos clientes não são importados.</p>
            </CardContent>
          </Card>
          {v.app && <AppCard loja={loja} v={v} />}
        </div>
      </form>
    </div>
  )
}

/** Só a administração da plataforma: as chaves do aplicativo da SG na Tray/Nuvemshop e o endereço de retorno. */
function AppCard({ loja, v }: { loja: string; v: LojaView }) {
  const qc = useQueryClient()
  const [vals, setVals] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: () => api.put(`/lojas/${loja}/aplicativo`, { values: vals }),
    onSuccess: () => (toast.success('Aplicativo salvo.'), setVals({}), void qc.invalidateQueries({ queryKey: ['loja', loja] })),
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (!v.def.appFields.length) return null
  return (
    <Card className="border-violet-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" aria-hidden /> Aplicativo da SG na {v.def.name} (plataforma)
        </CardTitle>
        <CardDescription>Cadastrado uma vez pela SG Multiconecta no portal de parceiros da {v.def.name}. Vale para todas as empresas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {v.redirectUri && (
          <div className="space-y-1">
            <Label>Endereço de retorno (cadastre no aplicativo)</Label>
            <div className="flex gap-2">
              <Input readOnly value={v.redirectUri} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(v.redirectUri!).then(() => toast.success('Copiado.'))}>
                <CopyIcon aria-hidden />
              </Button>
            </div>
          </div>
        )}
        {v.def.appFields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`app-${f.key}`}>{f.label}</Label>
            <Input id={`app-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={v.app?.[f.key] || f.placeholder} value={vals[f.key] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [f.key]: e.target.value }))} />
          </div>
        ))}
        <Button type="button" size="sm" disabled={save.isPending || !Object.values(vals).some((x) => x.trim())} onClick={() => save.mutate()}>
          Salvar aplicativo
        </Button>
      </CardContent>
    </Card>
  )
}
