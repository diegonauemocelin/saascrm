import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, ExternalLinkIcon, ImagePlusIcon, Loader2Icon, PackagePlusIcon, SearchIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Can, EmptyState, ErrorState, formatDateTime, PageHeader, RequirePermission, TableSkeleton } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { brl, int } from '@/lib/atendimento'
import { useAuth } from '@/lib/auth'

type Status = 'RASCUNHO' | 'PENDENTE' | 'ENVIANDO' | 'PUBLICADO' | 'ERRO'
const STATUS_LABEL: Record<Status, string> = { RASCUNHO: 'Rascunho', PENDENTE: 'Na fila', ENVIANDO: 'Enviando', PUBLICADO: 'Publicado', ERRO: 'Erro' }
const LISTING: Record<string, string> = { gold_special: 'Clássico', gold_pro: 'Premium' }

interface Candidate {
  code: string
  name: string
  ean: string | null
  brand: string | null
  department: string | null
  groupName: string | null
  category: string | null
  price: number | null
  erpPrice: number | null
  stock: number | null
  publication: { id: string; status: Status; itemId: string | null; permalink: string | null; error: string | null } | null
}
interface CandidateList {
  total: number
  page: number
  pageSize: number
  items: Candidate[]
  hiddenMedicines: number
  noFilter: boolean
}

interface Attr {
  id: string
  value_id?: string
  value_name?: string
}
interface DraftView {
  publication: {
    id: string
    productCode: string
    status: Status
    mode: 'catalogo' | 'tradicional'
    catalogProductId: string | null
    catalogName: string | null
    categoryId: string | null
    categoryName: string | null
    title: string
    description: string | null
    listingType: string
    freeShipping: boolean
    attributes: Attr[]
    pictures: { id: string; url: string | null }[]
    price: number | null
    quantity: number | null
    itemId: string | null
    permalink: string | null
    error: string | null
    syncEnabled: boolean
  }
  product: { code: string; name: string; ean: string | null; brand: string | null } | null
  catalog: { id: string; name: string; picture: string | null }[]
  category: { id: string; name: string; maxTitle: number } | null
  required: { id: string; name: string; valueType: string | null; values: { id: string; name: string }[] }[]
  packageAttributes: string[]
  missing: string[]
  problems: string[]
  canPublish: boolean
}

interface Publication {
  id: string
  productCode: string
  title: string
  status: Status
  mode: string
  listingType: string
  itemId: string | null
  permalink: string | null
  error: string | null
  price: number | null
  quantity: number | null
  syncEnabled: boolean
  syncError: string | null
  syncedAt: string | null
  updatedAt: string
}

interface ConfigView {
  config: { keepSynced: boolean; markupPct: number; medicineWords: string[]; allowedDepartments: string[]; allowedGroups: string[]; allowedCategories: string[]; listingType: string }
  values: { departments: { value: string; count: number }[]; groups: { value: string; count: number }[]; categories: { value: string; count: number }[] }
}

const PACKAGE_LABEL: Record<string, string> = { SELLER_PACKAGE_HEIGHT: 'Altura do pacote (cm)', SELLER_PACKAGE_WIDTH: 'Largura do pacote (cm)', SELLER_PACKAGE_LENGTH: 'Comprimento do pacote (cm)', SELLER_PACKAGE_WEIGHT: 'Peso do pacote (g)' }

/** Marketplaces › Publicar do ERP: produtos da Trier no Mercado Livre, com preço e estoque seguindo o ERP. */
export function MarketplacePublicarPage() {
  return (
    <RequirePermission module="marketplace_publicar">
      <PageHeader title="Publicar do ERP" description="Anuncie no Mercado Livre os produtos do ERP (Trier) que a empresa liberou. Medicamentos nunca são publicados. Depois de publicado, preço e estoque seguem o ERP." />
      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="publicacoes">Publicações</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-4">
          <Candidates />
        </TabsContent>
        <TabsContent value="publicacoes" className="mt-4">
          <Publications />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <ConfigTab />
        </TabsContent>
      </Tabs>
    </RequirePermission>
  )
}

function StatusBadge({ s }: { s: Status }) {
  return <Badge variant={s === 'PUBLICADO' ? 'secondary' : s === 'ERRO' ? 'destructive' : 'outline'}>{STATUS_LABEL[s]}</Badge>
}

function Candidates() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [situacao, setSituacao] = useState('sem_anuncio')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    const t = setTimeout(() => (setTerm(text.trim()), setPage(1)), 300)
    return () => clearTimeout(t)
  }, [text])
  const qs = new URLSearchParams({ ...(term ? { busca: term } : {}), situacao, pagina: String(page) }).toString()
  const q = useQuery({ queryKey: ['publicar-produtos', qs], queryFn: () => api.get<CandidateList>(`/marketplace-publicar/produtos?${qs}`), placeholderData: keepPreviousData })
  const prepare = useMutation({
    mutationFn: (codigo: string) => api.post<DraftView>('/marketplace-publicar/rascunhos', { codigo }),
    onSuccess: (v) => {
      qc.setQueryData(['publicar-rascunho', v.publication.id], v)
      setOpen(v.publication.id)
      void qc.invalidateQueries({ queryKey: ['publicar-produtos'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const publish = useMutation({
    mutationFn: (ids: string[]) => api.post<{ queued: number; refused: { id: string; reason: string }[] }>('/marketplace-publicar/publicar', { ids }),
    onSuccess: (r) => {
      if (r.queued) toast.success(`${r.queued} anúncio(s) na fila de envio.`)
      for (const x of r.refused.slice(0, 3)) toast.error(x.reason)
      setSelected(new Set())
      void qc.invalidateQueries({ queryKey: ['publicar-produtos'] })
      void qc.invalidateQueries({ queryKey: ['publicar-publicacoes'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const d = q.data
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1
  const drafts = d?.items.filter((c) => c.publication && !c.publication.itemId && ['RASCUNHO', 'ERRO'].includes(c.publication.status)) ?? []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Código, EAN, nome, laboratório…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar" />
        </div>
        <Select value={situacao} onValueChange={(v) => (setSituacao(v), setPage(1))}>
          <SelectTrigger className="w-48" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sem_anuncio">Sem anúncio</SelectItem>
            <SelectItem value="publicados">Já publicados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        {can('marketplace_publicar', 'edit') && (
          <Button disabled={!selected.size || publish.isPending} onClick={() => publish.mutate([...selected])}>
            <SendIcon /> Publicar selecionados ({selected.size})
          </Button>
        )}
      </div>
      {d && d.hiddenMedicines > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangleIcon className="size-3.5" /> {int.format(d.hiddenMedicines)} produto(s) dentro do filtro não aparecem porque parecem medicamento (não podem ser anunciados no Mercado Livre).
        </p>
      )}
      {q.isLoading && <TableSkeleton rows={6} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d?.noFilter && <EmptyState icon={PackagePlusIcon} title="Escolha o que pode ser publicado" description="Na aba Configuração, marque os departamentos, grupos ou categorias da Trier liberados para o Mercado Livre (ex.: higiene e perfumaria)." />}
      {d && !d.noFilter && !d.total && <EmptyState icon={PackagePlusIcon} title="Nenhum produto" description="Nenhum produto liberado nesta situação. Confira o filtro na Configuração e se os produtos estão marcados para e-commerce na Trier." />}
      {d && d.total > 0 && (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Selecionar rascunhos"
                    checked={drafts.length > 0 && drafts.every((c) => selected.has(c.publication!.id))}
                    onCheckedChange={(v) => setSelected(v ? new Set(drafts.map((c) => c.publication!.id)) : new Set())}
                  />
                </TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Laboratório</TableHead>
                <TableHead className="text-right">Preço no anúncio</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead>Anúncio</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.map((c) => {
                const pub = c.publication
                const selectable = !!pub && !pub.itemId && ['RASCUNHO', 'ERRO'].includes(pub.status)
                return (
                  <TableRow key={c.code}>
                    <TableCell>
                      {selectable && (
                        <Checkbox
                          aria-label="Selecionar"
                          checked={selected.has(pub.id)}
                          onCheckedChange={(v) => {
                            const n = new Set(selected)
                            if (v) n.add(pub.id)
                            else n.delete(pub.id)
                            setSelected(n)
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.code}
                        {c.ean ? ` · EAN ${c.ean}` : ' · sem EAN'} · {[c.department, c.groupName, c.category].filter(Boolean).join(' › ')}
                      </div>
                    </TableCell>
                    <TableCell>{c.brand ?? '—'}</TableCell>
                    <TableCell className="text-right">{c.price === null ? '—' : brl.format(c.price)}</TableCell>
                    <TableCell className="text-right">{c.stock === null ? '—' : int.format(c.stock)}</TableCell>
                    <TableCell>
                      {pub ? (
                        <div className="space-y-0.5">
                          <StatusBadge s={pub.status} />
                          {pub.permalink && (
                            <a className="flex items-center gap-1 text-xs text-primary hover:underline" href={pub.permalink} target="_blank" rel="noreferrer">
                              {pub.itemId} <ExternalLinkIcon className="size-3" />
                            </a>
                          )}
                          {pub.error && <p className="max-w-64 text-xs text-destructive">{pub.error}</p>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Can module="marketplace_publicar" action="edit">
                        <Button size="sm" variant="outline" disabled={prepare.isPending} onClick={() => (pub ? setOpen(pub.id) : prepare.mutate(c.code))}>
                          {prepare.isPending && prepare.variables === c.code && <Loader2Icon className="animate-spin" />}
                          {pub ? 'Revisar' : 'Montar anúncio'}
                        </Button>
                      </Can>
                    </TableCell>
                  </TableRow>
                )
              })}
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
      {open && <DraftDialog id={open} onClose={() => setOpen(null)} onPublish={(id) => publish.mutate([id])} />}
    </div>
  )
}

function DraftDialog({ id, onClose, onPublish }: { id: string; onClose: () => void; onPublish: (id: string) => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['publicar-rascunho', id], queryFn: () => api.get<DraftView>(`/marketplace-publicar/rascunhos/${id}`) })
  const set = (v: DraftView) => qc.setQueryData(['publicar-rascunho', id], v)
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.put<DraftView>(`/marketplace-publicar/rascunhos/${id}`, patch),
    onSuccess: (v) => {
      set(v)
      void qc.invalidateQueries({ queryKey: ['publicar-produtos'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const upload = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData()
      f.append('foto', file)
      return api.post<DraftView>(`/marketplace-publicar/rascunhos/${id}/fotos`, f)
    },
    onSuccess: set,
    onError: (err) => toast.error(errorMessage(err)),
  })
  const removePic = useMutation({ mutationFn: (pic: string) => api.delete<DraftView>(`/marketplace-publicar/rascunhos/${id}/fotos/${pic}`), onSuccess: set, onError: (err) => toast.error(errorMessage(err)) })
  const remove = useMutation({
    mutationFn: () => api.delete(`/marketplace-publicar/rascunhos/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['publicar-produtos'] })
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const d = q.data
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Anúncio no Mercado Livre</DialogTitle>
          <DialogDescription>{d?.product ? `${d.product.code} — ${d.product.name}` : 'Carregando…'}</DialogDescription>
        </DialogHeader>
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {!d && !q.error && <TableSkeleton rows={5} />}
        {d && <DraftForm key={`${d.publication.categoryId}-${d.publication.mode}`} d={d} saving={save.isPending} onSave={(p) => save.mutate(p)} onUpload={(f) => upload.mutate(f)} uploading={upload.isPending} onRemovePicture={(p) => removePic.mutate(p)} />}
        {d && (
          <DialogFooter className="flex flex-wrap gap-2">
            {!d.publication.itemId && ['RASCUNHO', 'ERRO'].includes(d.publication.status) && (
              <Button variant="ghost" className="mr-auto text-destructive" onClick={() => remove.mutate()}>
                <Trash2Icon /> Descartar rascunho
              </Button>
            )}
            <Button
              disabled={!d.canPublish}
              onClick={() => {
                onPublish(id)
                onClose()
              }}
            >
              <SendIcon /> Publicar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DraftForm({ d, saving, onSave, onUpload, uploading, onRemovePicture }: { d: DraftView; saving: boolean; onSave: (p: Record<string, unknown>) => void; onUpload: (f: File) => void; uploading: boolean; onRemovePicture: (id: string) => void }) {
  const p = d.publication
  const locked = !!p.itemId || ['PENDENTE', 'ENVIANDO'].includes(p.status)
  const [title, setTitle] = useState(p.title)
  const [description, setDescription] = useState(p.description ?? '')
  const [attrs, setAttrs] = useState<Record<string, Attr>>(Object.fromEntries(p.attributes.map((a) => [a.id, a])))
  const [catQuery, setCatQuery] = useState(d.product?.name ?? '')
  const cats = useMutation({ mutationFn: (q: string) => api.get<{ id: string; name: string; domain: string | null }[]>(`/marketplace-publicar/categorias?q=${encodeURIComponent(q)}`), onError: (err) => toast.error(errorMessage(err)) })
  const maxTitle = d.category?.maxTitle ?? 60
  const setAttr = (id: string, a: Partial<Attr>) => setAttrs({ ...attrs, [id]: { id, ...a } })
  const attrList = () => Object.values(attrs).map((a) => ({ id: a.id, value_id: a.value_id ?? '', value_name: a.value_name ?? '' }))
  return (
    <fieldset disabled={locked} className="space-y-4">
      {p.error && <p className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{p.error}</p>}
      {d.problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md border border-amber-500/40 p-2 pl-6 text-sm text-amber-800 dark:text-amber-300">
          {d.problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Label>Tipo de publicação</Label>
        {d.catalog.length > 0 ? (
          <div className="space-y-1.5">
            {d.catalog.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="modo" checked={p.mode === 'catalogo' && p.catalogProductId === c.id} onChange={() => onSave({ mode: 'catalogo', catalogProductId: c.id })} />
                {c.picture && <img src={c.picture} alt="" className="size-10 rounded object-contain" />}
                Catálogo: {c.name} <span className="text-xs text-muted-foreground">({c.id}; usa as fotos do catálogo)</span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="modo" checked={p.mode === 'tradicional'} onChange={() => onSave({ mode: 'tradicional', catalogProductId: null })} /> Anúncio tradicional (fotos e atributos próprios)
            </label>
            {p.mode === 'catalogo' && <p className="text-xs text-muted-foreground">Confira se o produto do catálogo é exatamente o mesmo (marca, volume, versão): diferença gera reclamação.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{d.product?.ean ? 'Nenhum produto de catálogo ativo com este EAN: anúncio tradicional.' : 'Produto sem EAN válido: anúncio tradicional.'}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <p className="text-sm">{d.category ? `${d.category.name} (${d.category.id})` : 'Nenhuma categoria escolhida.'}</p>
        {p.mode === 'tradicional' && (
          <div className="flex gap-2">
            <Input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Descreva o produto para sugerir a categoria" aria-label="Buscar categoria" />
            <Button type="button" variant="outline" disabled={cats.isPending || !catQuery.trim()} onClick={() => cats.mutate(catQuery)}>
              {cats.isPending && <Loader2Icon className="animate-spin" />} Sugerir
            </Button>
          </div>
        )}
        {cats.data && (
          <div className="flex flex-wrap gap-1.5">
            {cats.data.map((c) => (
              <Button key={c.id} type="button" size="sm" variant={c.id === p.categoryId ? 'default' : 'outline'} onClick={() => onSave({ categoryId: c.id })}>
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pub-title">
          Título ({title.length}/{maxTitle})
        </Label>
        <Input id="pub-title" value={title} maxLength={maxTitle} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Tipo de anúncio</Label>
          <Select value={p.listingType} onValueChange={(v) => onSave({ listingType: v })}>
            <SelectTrigger aria-label="Tipo de anúncio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gold_special">Clássico</SelectItem>
              <SelectItem value="gold_pro">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Preço (do ERP)</Label>
          <p className="pt-2 text-sm">{p.price === null ? 'Sem preço no ERP' : brl.format(p.price)}</p>
        </div>
        <div className="space-y-1.5">
          <Label>Estoque (do ERP)</Label>
          <p className="pt-2 text-sm">{p.quantity === null ? '—' : int.format(p.quantity)}</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={p.freeShipping} onCheckedChange={(v) => onSave({ freeShipping: v })} aria-label="Frete grátis" /> Oferecer frete grátis (Mercado Envios)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={p.syncEnabled} onCheckedChange={(v) => onSave({ syncEnabled: v })} aria-label="Seguir o ERP" /> Preço e estoque seguem o ERP neste anúncio
      </label>
      {d.required.length > 0 && (
        <div className="space-y-2">
          <Label>Atributos obrigatórios da categoria</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.required.map((a) => {
              const cur = attrs[a.id]
              return (
                <div key={a.id} className="space-y-1">
                  <span className={`text-xs ${d.missing.includes(a.id) ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {a.name} ({a.id})
                  </span>
                  {a.values.length > 0 ? (
                    <Select value={cur?.value_id ?? ''} onValueChange={(v) => setAttr(a.id, { value_id: v, value_name: a.values.find((x) => x.id === v)?.name })}>
                      <SelectTrigger aria-label={a.name}>
                        <SelectValue placeholder={cur?.value_name ?? 'Escolha'} />
                      </SelectTrigger>
                      <SelectContent>
                        {a.values.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={cur?.value_name ?? ''} onChange={(e) => setAttr(a.id, { value_name: e.target.value })} aria-label={a.name} placeholder={a.valueType === 'number_unit' ? 'ex.: 200 ml' : ''} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label>Medidas do pacote (inteiros; recomendadas e exigidas no Mercado Envios)</Label>
        <div className="grid gap-3 sm:grid-cols-4">
          {d.packageAttributes.map((id) => (
            <div key={id} className="space-y-1">
              <span className="text-xs text-muted-foreground">{PACKAGE_LABEL[id] ?? id}</span>
              <Input inputMode="numeric" value={(attrs[id]?.value_name ?? '').replace(/\D/g, '')} onChange={(e) => setAttr(id, { value_name: e.target.value.replace(/\D/g, '') ? `${e.target.value.replace(/\D/g, '')} ${id.endsWith('WEIGHT') ? 'g' : 'cm'}` : '' })} aria-label={PACKAGE_LABEL[id] ?? id} />
            </div>
          ))}
        </div>
      </div>
      {p.mode === 'tradicional' && (
        <div className="space-y-2">
          <Label>Fotos (JPG ou PNG, 1200 × 1200 px recomendado; a Trier não fornece fotos)</Label>
          <div className="flex flex-wrap gap-2">
            {p.pictures.map((pic) => (
              <div key={pic.id} className="relative">
                {pic.url ? <img src={pic.url} alt="" className="size-20 rounded border object-contain" /> : <div className="flex size-20 items-center justify-center rounded border text-xs">{pic.id}</div>}
                {!locked && (
                  <button type="button" className="absolute -top-2 -right-2 rounded-full bg-background p-0.5 shadow" onClick={() => onRemovePicture(pic.id)} aria-label="Remover foto">
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!locked && p.pictures.length < 10 && (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed text-xs text-muted-foreground">
                {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />} Enviar
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onUpload(f)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="pub-desc">Descrição (texto simples)</Label>
        <Textarea id="pub-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {!locked && (
        <Button type="button" variant="outline" disabled={saving} onClick={() => onSave({ title, description: description.trim() || null, attributes: attrList() })}>
          {saving && <Loader2Icon className="animate-spin" />} Salvar revisão
        </Button>
      )}
      {p.permalink && (
        <a className="flex items-center gap-1 text-sm text-primary hover:underline" href={p.permalink} target="_blank" rel="noreferrer">
          Ver anúncio {p.itemId} <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </fieldset>
  )
}

function Publications() {
  const [status, setStatus] = useState('todos')
  const [page, setPage] = useState(1)
  const qs = new URLSearchParams({ ...(status !== 'todos' ? { status } : {}), pagina: String(page) }).toString()
  const q = useQuery({ queryKey: ['publicar-publicacoes', qs], queryFn: () => api.get<{ total: number; page: number; pageSize: number; counts: Record<string, number>; items: Publication[] }>(`/marketplace-publicar/publicacoes?${qs}`), placeholderData: keepPreviousData, refetchInterval: 10_000 })
  const d = q.data
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['todos', 'RASCUNHO', 'PENDENTE', 'ENVIANDO', 'PUBLICADO', 'ERRO'] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => (setStatus(s), setPage(1))}>
            {s === 'todos' ? 'Todas' : STATUS_LABEL[s]}
            {s !== 'todos' && d?.counts[s] ? ` (${d.counts[s]})` : ''}
          </Button>
        ))}
      </div>
      {q.isLoading && <TableSkeleton rows={5} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {d && !d.total && <EmptyState icon={SendIcon} title="Nenhuma publicação" description="Monte o anúncio na aba Produtos." />}
      {d && d.total > 0 && (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anúncio</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead>Seguindo o ERP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Produto {r.productCode} · {r.mode === 'catalogo' ? 'Catálogo' : 'Tradicional'} · {LISTING[r.listingType] ?? r.listingType}
                      {r.permalink && (
                        <>
                          {' · '}
                          <a className="text-primary hover:underline" href={r.permalink} target="_blank" rel="noreferrer">
                            {r.itemId}
                          </a>
                        </>
                      )}
                    </div>
                    {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge s={r.status} />
                  </TableCell>
                  <TableCell className="text-right">{r.price === null ? '—' : brl.format(r.price)}</TableCell>
                  <TableCell className="text-right">{r.quantity === null ? '—' : int.format(r.quantity)}</TableCell>
                  <TableCell className="text-xs">
                    {r.syncEnabled ? 'Sim' : 'Não'}
                    {r.syncedAt && <div className="text-muted-foreground">{formatDateTime(r.syncedAt)}</div>}
                    {r.syncError && <div className="text-destructive">{r.syncError}</div>}
                  </TableCell>
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

function ConfigTab() {
  const q = useQuery({ queryKey: ['publicar-config'], queryFn: () => api.get<ConfigView>('/marketplace-publicar/configuracao') })
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <TableSkeleton rows={6} />
  return <ConfigEditor key={JSON.stringify(q.data.config)} v={q.data} />
}

function ConfigEditor({ v }: { v: ConfigView }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [c, setC] = useState(v.config)
  const [words, setWords] = useState(v.config.medicineWords.join(', '))
  const save = useMutation({
    mutationFn: () => api.put<ConfigView>('/marketplace-publicar/configuracao', { ...c, medicineWords: words.split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean) }),
    onSuccess: (r) => {
      qc.setQueryData(['publicar-config'], r)
      void qc.invalidateQueries({ queryKey: ['publicar-produtos'] })
      toast.success('Configuração salva.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const toggle = (key: 'allowedDepartments' | 'allowedGroups' | 'allowedCategories', value: string) => setC({ ...c, [key]: c[key].includes(value) ? c[key].filter((x) => x !== value) : [...c[key], value] })
  const list = (title: string, key: 'allowedDepartments' | 'allowedGroups' | 'allowedCategories', values: { value: string; count: number }[]) => (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      {values.length ? (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
          {values.map((x) => (
            <label key={x.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={c[key].includes(x.value)} onCheckedChange={() => toggle(key, x.value)} aria-label={x.value} /> {x.value} <span className="text-xs text-muted-foreground">({int.format(x.count)})</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem valores ainda (aparecem depois da primeira cópia da Trier).</p>
      )}
    </div>
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de publicação</CardTitle>
        <CardDescription>Só aparecem para publicar os produtos dos departamentos, grupos ou categorias marcados abaixo (nada marcado = nada aparece). Medicamentos ficam sempre de fora: o Mercado Livre não permite anunciá-los.</CardDescription>
      </CardHeader>
      <CardContent className="mt-4 space-y-4">
        <fieldset disabled={!can('marketplace_publicar', 'edit')} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {list('Departamentos', 'allowedDepartments', v.values.departments)}
            {list('Grupos', 'allowedGroups', v.values.groups)}
            {list('Categorias', 'allowedCategories', v.values.categories)}
          </div>
          <label className="flex items-start gap-3">
            <Switch checked={c.keepSynced} onCheckedChange={(x) => setC({ ...c, keepSynced: x })} className="mt-0.5" aria-label="Manter preço e estoque sincronizados" />
            <span>
              <span className="text-sm font-medium">Manter preço e estoque sincronizados</span>
              <span className="block text-xs text-muted-foreground">Quando a Trier muda preço ou estoque, o anúncio é atualizado (estoque 0 pausa o anúncio no Mercado Livre).</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pub-markup">Acréscimo sobre o preço do ERP (%)</Label>
              <Input id="pub-markup" type="number" step="0.1" min={-50} max={300} value={c.markupPct} onChange={(e) => setC({ ...c, markupPct: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de anúncio padrão</Label>
              <Select value={c.listingType} onValueChange={(x) => setC({ ...c, listingType: x })}>
                <SelectTrigger aria-label="Tipo de anúncio padrão">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold_special">Clássico</SelectItem>
                  <SelectItem value="gold_pro">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-words">Palavras que indicam medicamento (tipo, classificação, grupo, departamento ou categoria)</Label>
            <Textarea id="pub-words" rows={3} value={words} onChange={(e) => setWords(e.target.value)} />
            <p className="text-xs text-muted-foreground">Produto com princípio ativo ou manipulado é sempre tratado como medicamento. Lista vazia volta ao padrão.</p>
          </div>
        </fieldset>
      </CardContent>
      {can('marketplace_publicar', 'edit') && (
        <CardFooter className="mt-4">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2Icon className="animate-spin" />} Salvar
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
