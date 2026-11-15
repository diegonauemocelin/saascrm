import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckCircle2Icon, CopyIcon, Link2Icon, Loader2Icon, PackageSearchIcon, PlugZapIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, formatDateTime, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { brl, int } from '@/lib/atendimento'
import { useAuth } from '@/lib/auth'

interface ErpField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  help?: string
  url?: boolean
  optional?: boolean
}
interface ErpConfig {
  def: { key: string; name: string; segment: string; howTo: string; oauth: boolean; fields: ErpField[] }
  enabled: boolean
  values: Record<string, string>
  saved: Record<string, boolean>
  importCost: boolean
  fullEveryHours: number
  redirectUri: string | null
  state: { running: boolean; runningSince: string | null; lastFullAt: string | null; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null; products: number; removed: number; connectedAt: string | null }
}
interface ErpItem {
  code: string
  name: string
  ean: string | null
  brand: string | null
  category: string | null
  unit: string | null
  price: number | null
  stock: number | null
  cost: number | null
  active: boolean
  syncedAt: string
}
interface ErpList {
  total: number
  page: number
  pageSize: number
  rows: ErpItem[]
}

/** Integração com um ERP (Bling, Tiny, Omie, Linx, CIGAM): produtos copiados e configuração, no padrão da Trier. */
export function ErpIntegracaoPage() {
  const { erp = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const cfg = useQuery({ queryKey: ['erp', erp], queryFn: () => api.get<ErpConfig>(`/erps/${erp}`), enabled: !!erp, refetchInterval: (q) => (q.state.data?.state.running ? 5000 : false) })
  // Volta da autorização (OAuth): avisa e limpa o endereço.
  useEffect(() => {
    if (params.get('conectado')) toast.success('Acesso autorizado. A primeira cópia começa no próximo minuto.')
    else if (params.get('erro')) toast.error(params.get('erro'))
    if (params.get('conectado') || params.get('erro')) setParams({}, { replace: true })
  }, [params, setParams])
  const name = cfg.data?.def.name ?? 'ERP'
  return (
    <RequirePermission module={`erp_${erp}`}>
      <PageHeader title={`Integração ${name}`} description={cfg.data ? `${cfg.data.def.segment}. Produtos, preço, estoque e custo copiados do ${name} (só leitura: o CRM não altera nada no ERP).` : 'Produtos, preço e estoque copiados do ERP.'} />
      {cfg.error && <ErrorState error={cfg.error} onRetry={() => cfg.refetch()} />}
      {cfg.data && (
        <Tabs defaultValue={cfg.data.enabled ? 'produtos' : 'config'}>
          <TabsList>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>
          <TabsContent value="produtos" className="mt-4">
            <Products erp={erp} cfg={cfg.data} />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <ConfigTab erp={erp} cfg={cfg.data} />
          </TabsContent>
        </Tabs>
      )}
    </RequirePermission>
  )
}

function SyncStatus({ cfg }: { cfg: ErpConfig }) {
  const s = cfg.state
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {s.running ? (
        <Badge variant="secondary">
          <Loader2Icon className="animate-spin" aria-hidden /> Copiando…
        </Badge>
      ) : cfg.enabled ? (
        <Badge variant="secondary">Ligada</Badge>
      ) : (
        <Badge variant="outline">Desligada</Badge>
      )}
      <span className="text-muted-foreground">
        {int(s.products)} produto(s){s.lastFullAt ? ` · última cópia ${formatDateTime(s.lastFullAt)}` : ' · ainda sem cópia'}
      </span>
      {s.lastError && (
        <span className="flex items-center gap-1 text-destructive">
          <AlertTriangleIcon className="size-4" aria-hidden /> {s.lastError}
          {s.lastErrorAt ? ` (${formatDateTime(s.lastErrorAt)})` : ''}
        </span>
      )}
    </div>
  )
}

function Products({ erp, cfg }: { erp: string; cfg: ErpConfig }) {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [inStock, setInStock] = useState(false)
  const [inactive, setInactive] = useState(false)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const t = setTimeout(() => (setTerm(text.trim()), setPage(1)), 300)
    return () => clearTimeout(t)
  }, [text])
  const qs = new URLSearchParams({ ...(term ? { busca: term } : {}), ...(inStock ? { estoque: 'true' } : {}), ...(inactive ? { inativos: 'true' } : {}), pagina: String(page) }).toString()
  const q = useQuery({ queryKey: ['erp-produtos', erp, qs], queryFn: () => api.get<ErpList>(`/erps/${erp}/produtos?${qs}`), placeholderData: keepPreviousData })
  const d = q.data
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1
  const showCost = cfg.importCost
  return (
    <div className="space-y-4">
      <SyncStatus cfg={cfg} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Código, EAN, nome, marca, categoria…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar produto" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={inStock} onCheckedChange={(v) => (setInStock(v), setPage(1))} /> Só com estoque
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={inactive} onCheckedChange={(v) => (setInactive(v), setPage(1))} /> Mostrar inativos
        </label>
      </div>
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {!d && !q.error && <TableSkeleton />}
      {d && !d.rows.length && <EmptyState icon={PackageSearchIcon} title={cfg.state.products ? 'Nenhum produto com esse filtro' : 'Nenhum produto copiado ainda'} description={cfg.state.products ? 'Mude a busca ou os filtros.' : 'Configure a integração (aba Configuração), teste a conexão e clique em Copiar agora.'} />}
      {d && d.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Marca / categoria</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  {showCost && <TableHead className="text-right">Custo</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-xs">
                      {r.code}
                      {r.ean && <span className="block text-muted-foreground">{r.ean}</span>}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {r.name} {!r.active && <Badge variant="outline">inativo</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{[r.brand, r.category].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell className="text-right">{r.price === null ? '—' : brl(r.price)}</TableCell>
                    <TableCell className="text-right">{r.stock === null ? '—' : `${r.stock.toLocaleString('pt-BR')}${r.unit ? ` ${r.unit}` : ''}`}</TableCell>
                    {showCost && <TableCell className="text-right">{r.cost === null ? '—' : brl(r.cost)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {int(d.total)} produto(s) · página {d.page} de {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ConfigTab({ erp, cfg }: { erp: string; cfg: ErpConfig }) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const edit = can(`erp_${erp}`, 'edit')
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [values, setValues] = useState<Record<string, string>>(cfg.values)
  const [importCost, setImportCost] = useState(cfg.importCost)
  const [hours, setHours] = useState(String(cfg.fullEveryHours))
  useEffect(() => {
    setEnabled(cfg.enabled)
    setValues(cfg.values)
    setImportCost(cfg.importCost)
    setHours(String(cfg.fullEveryHours))
  }, [cfg])
  const refresh = () => qc.invalidateQueries({ queryKey: ['erp', erp] })
  const save = useMutation({
    mutationFn: () => api.put(`/erps/${erp}`, { enabled, values, importCost, fullEveryHours: Number(hours) || 6 }),
    onSuccess: () => {
      toast.success('Configuração salva.')
      void refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>(`/erps/${erp}/testar`),
    onSuccess: (r) => (r.ok ? toast.success : toast.error)(r.message),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const sync = useMutation({
    mutationFn: () => api.post<{ started: boolean; message: string }>(`/erps/${erp}/copiar-agora`),
    onSuccess: (r) => {
      ;(r.started ? toast.success : toast.info)(r.message)
      void refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const connect = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/erps/${erp}/conectar`),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZapIcon className="size-4" aria-hidden /> Acesso ao {cfg.def.name}
          </CardTitle>
          <CardDescription className="whitespace-pre-line">{cfg.def.howTo}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!edit} /> Integração ligada
          </label>
          {cfg.def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`erp-${f.key}`}>
                {f.label} {f.optional && <span className="text-muted-foreground">(opcional)</span>}
                {f.secret && cfg.saved[f.key] && (
                  <Badge variant="secondary" className="ml-2">
                    guardado
                  </Badge>
                )}
              </Label>
              <Input
                id={`erp-${f.key}`}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                disabled={!edit}
                placeholder={f.secret && cfg.saved[f.key] ? 'Em branco mantém o guardado' : f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={importCost} onCheckedChange={setImportCost} disabled={!edit} /> Importar o custo do ERP (Preços e promoções do Mercado Livre)
          </label>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="erp-hours">Cópia completa a cada (horas)</Label>
            <Input id="erp-hours" type="number" min={1} max={48} value={hours} disabled={!edit} onChange={(e) => setHours(e.target.value)} />
          </div>
          {cfg.def.oauth && cfg.redirectUri && (
            <div className="space-y-1.5 rounded-md border p-3 text-sm">
              <p className="font-medium">Endereço de retorno (cadastre no aplicativo do {cfg.def.name})</p>
              <div className="flex gap-2">
                <Input readOnly value={cfg.redirectUri} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copiar endereço" onClick={() => void navigator.clipboard.writeText(cfg.redirectUri!).then(() => toast.success('Copiado.'))}>
                  <CopyIcon aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{cfg.state.connectedAt ? `Acesso autorizado em ${formatDateTime(cfg.state.connectedAt)}.` : 'Ainda não autorizado: salve as credenciais e clique em Conectar.'}</p>
            </div>
          )}
        </CardContent>
        {edit && (
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" aria-hidden />} Salvar
            </Button>
            {cfg.def.oauth && (
              <Button type="button" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate()}>
                <Link2Icon aria-hidden /> {cfg.state.connectedAt ? 'Conectar de novo' : 'Conectar'}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <CheckCircle2Icon aria-hidden />} Testar conexão
            </Button>
            <Button type="button" variant="outline" disabled={sync.isPending || cfg.state.running} onClick={() => sync.mutate()}>
              <RefreshCwIcon aria-hidden /> Copiar agora
            </Button>
          </CardFooter>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Situação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <SyncStatus cfg={cfg} />
          <p className="text-muted-foreground">Último acesso OK: {cfg.state.lastOkAt ? formatDateTime(cfg.state.lastOkAt) : '—'}</p>
          {cfg.state.removed > 0 && <p className="text-muted-foreground">{int(cfg.state.removed)} produto(s) que saíram do ERP ficam fora da lista.</p>}
          <p className="text-xs text-muted-foreground">Só leitura: o CRM consulta o {cfg.def.name} e não altera produtos, preços nem estoque. As credenciais ficam criptografadas.</p>
        </CardContent>
      </Card>
    </form>
  )
}
