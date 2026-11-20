import { randomBytes } from 'node:crypto'
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { decrypt, encrypt, safeEqual } from '../common/crypto'
import type { RequestCtx } from '../common/decorators'
import { type Action, can } from '../common/permissions'
import type { AuthUser } from '../common/types'
import { TenantService } from '../prisma/prisma.module'
import { EmailAiService } from '../email/ia.service'
import { FilesService } from '../files/files.service'
import { Prisma } from '../generated/prisma/client'
import { DEFAULT_INTEGRATIONS, INTEGRATIONS_KEY, type IntegrationsConfig } from '../marketing/config'
import { auditPosts, planInsights } from '../marketing/ig-analise'
import { postTimes } from '../marketing/instagram'
import { beatSheet, checkCaption, hookScore, parseReels, reelsPrompt } from './conteudo-ig'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { videoMeta, YouTubeClient, youtubeAuthorizeUrl, YT_APP_KEY, YT_CALLBACK_PATH, YT_OAUTH_KEY, YT_PLATFORM_CALLBACK_PATH, YT_TOKENS_KEY, type YtApp, type YtToken } from './youtube'
import { FacebookLogin, FB_APP_KEY, FB_CALLBACK_PATH, FB_OAUTH_KEY, FB_PLATFORM_CALLBACK_PATH, FB_TOKENS_KEY, type FbApp, type FbPageToken, facebookAuthorizeUrl } from './facebook-login'
import { IG_CALLBACK_PATH, IG_PLATFORM_CALLBACK_PATH, tenantOfState, IG_GRAPH, IG_TOKENS_KEY, type IgApp, type IgToken, InstagramLogin, authorizeUrl, needsRenewal, POSTAGENS_ACCOUNTS_KEY } from './instagram-login'
import { type AccountMetrics, MetaPublisher, type PostMetrics } from './meta'
import {
  type Account,
  captionPrompt,
  cleanAccounts,
  engagementRate,
  groupTotals,
  type CleanPost,
  cleanCaption,
  cleanPost,
  detectPostFile,
  FORMATS,
  IMAGE_MAX_BYTES,
  imagePrompt,
  jpegSize,
  type MediaInfo,
  missingForApproval,
  networksOf,
  pendingAccounts,
  type PlanInput,
  parsePlan,
  planPrompt,
  type PostFormat,
  type PostInput,
  type PostResults,
  postSystem,
  VIDEO_MAX_BYTES,
  NETWORK_LABEL,
} from './postagens'

const TICK_MS = 60_000
const ACCOUNTS_KEY = POSTAGENS_ACCOUNTS_KEY
/** App do Instagram (ID e chave secreta) e os tokens das contas conectadas pelo login do Instagram. */
const IG_APP_KEY = 'postagens_ig_app'
const IG_OAUTH_KEY = 'postagens_ig_oauth'
/** Confere os tokens do Instagram a cada 6 horas (renova os que estão perto de vencer). */
const IG_RENEW_EVERY_MS = 6 * 3_600_000
/** Métricas guardadas por um tempo (cada consulta faz várias chamadas à Meta). */
const METRICS_TTL_MS = 3 * 3_600_000
/** Depois de publicada, a mídia ainda fica acessível por este tempo (a Meta pode baixar de novo ao processar). */
const PUBLIC_AFTER_MS = 2 * 86_400_000

/**
 * Postagens no Instagram e no Facebook: biblioteca de mídias, calendário, textos e imagens com a IA gratuita
 * (Gemini), aprovação e publicação na hora marcada pela Graph API (com o token do Marketing Inteligente).
 */
@Injectable()
export class PostagensService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PostagensService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly metricsCache = new Map<string, { at: number; data: unknown }>()
  private lastRenew = 0
  igLogin = new InstagramLogin()
  fbLogin = new FacebookLogin()
  youtube = new YouTubeClient()

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly ai: EmailAiService,
    private readonly tenants: TenantService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  assertCan(user: AuthUser, action: Action) {
    if (!can(user.permissions, user.role.isSystem, 'postagens', action)) throw new ForbiddenException('Você não tem permissão para esta ação.')
  }

  private async integrations(tenantId: string) {
    const c = await this.settings.get<IntegrationsConfig>(tenantId, INTEGRATIONS_KEY, DEFAULT_INTEGRATIONS)
    return { ...DEFAULT_INTEGRATIONS, ...c, metaOrganic: { ...DEFAULT_INTEGRATIONS.metaOrganic, ...c.metaOrganic }, metaAds: { ...DEFAULT_INTEGRATIONS.metaAds, ...c.metaAds } }
  }

  /**
   * Contas de publicação (Instagram e páginas). Sem lista cadastrada, usa o Instagram e a página do Marketing
   * Inteligente.
   */
  async accounts(tenantId: string): Promise<Account[]> {
    const saved = (await this.settings.get<{ accounts: Account[] }>(tenantId, ACCOUNTS_KEY, { accounts: [] })).accounts ?? []
    if (saved.length) return saved
    const c = await this.integrations(tenantId)
    const out: Account[] = []
    if (/^\d{5,25}$/.test(c.metaOrganic.instagramId)) out.push({ id: `ig-${c.metaOrganic.instagramId}`, network: 'instagram', externalId: c.metaOrganic.instagramId, name: 'Instagram', group: 'Oficial' })
    if (/^\d{5,25}$/.test(c.metaOrganic.pageId)) out.push({ id: `fb-${c.metaOrganic.pageId}`, network: 'facebook', externalId: c.metaOrganic.pageId, name: 'Página do Facebook', group: 'Oficial' })
    return out
  }

  async saveAccounts(user: AuthUser, list: unknown, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const accounts = cleanAccounts(list)
    if ('error' in accounts) throw new BadRequestException(accounts.error)
    await this.settings.set(user.tenantId, ACCOUNTS_KEY, { accounts })
    // conta do Instagram tirada da lista: o acesso dela é apagado
    const tokens = await this.igTokens(user.tenantId)
    const kept = Object.fromEntries(Object.entries(tokens).filter(([id]) => accounts.some((a) => a.via === 'instagram' && a.externalId === id)))
    if (Object.keys(kept).length !== Object.keys(tokens).length) await this.settings.set(user.tenantId, IG_TOKENS_KEY, kept)
    // página do Facebook tirada da lista: o acesso dela também
    const fb = await this.fbTokens(user.tenantId)
    const fbKept = Object.fromEntries(Object.entries(fb).filter(([id]) => accounts.some((a) => a.via === 'facebook' && a.externalId === id)))
    if (Object.keys(fbKept).length !== Object.keys(fb).length) await this.settings.set(user.tenantId, FB_TOKENS_KEY, fbKept)
    const yt = await this.ytTokens(user.tenantId)
    const ytKept = Object.fromEntries(Object.entries(yt).filter(([id]) => accounts.some((a) => a.network === 'youtube' && a.externalId === id)))
    if (Object.keys(ytKept).length !== Object.keys(yt).length) await this.settings.set(user.tenantId, YT_TOKENS_KEY, ytKept)
    await this.audit.byUser(user, ctx, 'postagens.contas', 'settings', ACCOUNTS_KEY, { contas: accounts.map((a) => `${a.network}:${a.name}`) })
    return { accounts }
  }

  // ---------- Contas conectadas pelo login do Instagram ----------

  /** Endereço de retorno do login do Instagram com o app próprio da empresa (no endereço dela). */
  async igRedirectUri(tenantId: string) {
    return `${await this.tenants.url(tenantId)}${IG_CALLBACK_PATH}`
  }

  private async platformTenantId() {
    return (await this.prisma.tenant.findFirst({ where: { isPlatform: true }, select: { id: true } }))?.id ?? null
  }

  /**
   * App da Meta usado para conectar: o da plataforma (SG Multiconecta, cadastrado no painel da plataforma) para todas as
   * empresas, que só fazem o login no Instagram; o próprio da empresa só se ela cadastrou um. O retorno do app da
   * plataforma é um endereço só (IG_PLATFORM_CALLBACK_PATH no painel), que devolve a pessoa ao endereço da empresa.
   */
  private async igAppFor(tenantId: string): Promise<{ app: IgApp; platform: boolean; redirectUri: string } | null> {
    const pid = await this.platformTenantId()
    const own = await this.igApp(tenantId)
    if (own.appId && own.secretEnc) {
      return { app: own, platform: tenantId === pid, redirectUri: tenantId === pid ? `${await this.tenants.url(tenantId)}${IG_PLATFORM_CALLBACK_PATH}` : await this.igRedirectUri(tenantId) }
    }
    if (!pid || pid === tenantId) return null
    const p = await this.igApp(pid)
    if (!p.appId || !p.secretEnc) return null
    return { app: p, platform: true, redirectUri: `${await this.tenants.url(pid)}${IG_PLATFORM_CALLBACK_PATH}` }
  }

  /** Página de retorno do painel: para onde mandar a pessoa (o endereço da empresa que começou a conexão). */
  async igDestination(state: string) {
    const tenantId = tenantOfState(state)
    if (!tenantId) throw new BadRequestException('Autorização inválida. Clique em Conectar conta do Instagram de novo.')
    const pending = await this.settings.get<{ state?: string; expiresAt?: string }>(tenantId, IG_OAUTH_KEY, {})
    if (!pending.state || !safeEqual(pending.state, state) || Date.parse(pending.expiresAt ?? '') < Date.now()) {
      throw new BadRequestException('Autorização inválida ou expirada. Clique em Conectar conta do Instagram de novo.')
    }
    return { url: `${await this.tenants.url(tenantId)}${IG_CALLBACK_PATH}` }
  }

  private async igApp(tenantId: string): Promise<IgApp> {
    return { appId: '', secretEnc: null, ...(await this.settings.get<Partial<IgApp>>(tenantId, IG_APP_KEY, {})) }
  }

  private async igTokens(tenantId: string) {
    return this.settings.get<Record<string, IgToken>>(tenantId, IG_TOKENS_KEY, {})
  }

  /** ID e chave secreta do app do Instagram (Meta for Developers › app › Instagram › Configurar o login da empresa). */
  async saveIgApp(user: AuthUser, appId: string, secret: string | undefined, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const c = await this.igApp(user.tenantId)
    if (!/^\d{5,25}$/.test(appId.trim())) throw new BadRequestException('O ID do app do Instagram tem só números.')
    if (!secret?.trim() && !c.secretEnc) throw new BadRequestException('Informe a chave secreta do app do Instagram.')
    await this.settings.set(user.tenantId, IG_APP_KEY, { appId: appId.trim(), secretEnc: secret?.trim() ? encrypt(secret.trim()) : c.secretEnc })
    await this.audit.byUser(user, ctx, 'postagens.instagram_app', 'settings', IG_APP_KEY, { appId: appId.trim(), chaveNova: !!secret?.trim() })
    return { ok: true }
  }

  /** Botão "Conectar conta do Instagram": endereço do login do Instagram. */
  async startInstagram(user: AuthUser) {
    this.assertCan(user, 'edit')
    const sel = await this.igAppFor(user.tenantId)
    if (!sel) throw new BadRequestException('A conexão com o Instagram ainda não está liberada nesta plataforma. Fale com o suporte.')
    const state = `${user.tenantId}.${randomBytes(24).toString('base64url')}`
    await this.settings.set(user.tenantId, IG_OAUTH_KEY, { state, userId: user.id, redirectUri: sel.redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() })
    return { url: authorizeUrl(sel.app.appId, sel.redirectUri, state) }
  }

  /** Volta do Instagram: a tela do CRM manda o code e o state; a conta entra (ou é atualizada) na lista. */
  async completeInstagram(user: AuthUser, code: string, state: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const pending = await this.settings.get<{ state?: string; userId?: string; redirectUri?: string; expiresAt?: string }>(user.tenantId, IG_OAUTH_KEY, {})
    if (!pending.state || !safeEqual(pending.state, state) || pending.userId !== user.id || Date.parse(pending.expiresAt ?? '') < Date.now()) {
      throw new BadRequestException('Autorização inválida ou expirada. Clique em Conectar conta do Instagram de novo.')
    }
    await this.settings.set(user.tenantId, IG_OAUTH_KEY, {})
    const sel = await this.igAppFor(user.tenantId)
    if (!sel?.app.secretEnc) throw new BadRequestException('A conexão com o Instagram ainda não está liberada nesta plataforma. Fale com o suporte.')
    let r
    try {
      r = await this.igLogin.connect({ appId: sel.app.appId, secret: decrypt(sel.app.secretEnc) }, code, pending.redirectUri ?? sel.redirectUri)
    } catch (err) {
      throw new BadRequestException((err as Error).message)
    }
    if (r.accountType === 'PERSONAL') throw new BadRequestException(`A conta @${r.username} é pessoal. No Instagram, mude para conta profissional (Empresa ou Criador de conteúdo) e conecte de novo.`)
    const tokens = await this.igTokens(user.tenantId)
    const now = new Date().toISOString()
    tokens[r.userId] = { tokenEnc: encrypt(r.token), username: r.username, expiresAt: r.expiresAt, issuedAt: now, connectedBy: user.name, lastError: null }
    await this.settings.set(user.tenantId, IG_TOKENS_KEY, tokens)
    const accounts = await this.accounts(user.tenantId)
    const name = r.username ? `@${r.username}` : `Instagram ${r.userId}`
    const i = accounts.findIndex((a) => a.network === 'instagram' && a.externalId === r.userId)
    if (i >= 0) accounts[i] = { ...accounts[i]!, name, via: 'instagram' }
    else accounts.push({ id: `ig-${r.userId}`, network: 'instagram', externalId: r.userId, name, group: accounts[0]?.group ?? 'Oficial', via: 'instagram' })
    if (accounts.length > 30) throw new BadRequestException('Limite de 30 contas atingido: tire uma conta da lista antes de conectar outra.')
    await this.settings.set(user.tenantId, ACCOUNTS_KEY, { accounts })
    this.metricsCache.delete(user.tenantId)
    await this.audit.byUser(user, ctx, 'postagens.instagram_conectado', 'settings', IG_TOKENS_KEY, { conta: name, id: r.userId })
    return { username: r.username, accounts }
  }

  // ---------- Páginas conectadas pelo login do Facebook (app da plataforma) ----------

  private async fbApp(tenantId: string): Promise<FbApp> {
    return { appId: '', secretEnc: null, ...(await this.settings.get<Partial<FbApp>>(tenantId, FB_APP_KEY, {})) }
  }

  private async fbTokens(tenantId: string) {
    return this.settings.get<Record<string, FbPageToken>>(tenantId, FB_TOKENS_KEY, {})
  }

  /** App da Meta do login do Facebook: o da plataforma (cadastrado no painel) para todas as empresas. */
  private async fbAppFor(): Promise<{ app: FbApp; redirectUri: string } | null> {
    const pid = await this.platformTenantId()
    if (!pid) return null
    const app = await this.fbApp(pid)
    if (!app.appId || !app.secretEnc) return null
    return { app, redirectUri: `${await this.tenants.url(pid)}${FB_PLATFORM_CALLBACK_PATH}` }
  }

  /** Painel da plataforma: ID e chave secreta do app da Meta (Login do Facebook). */
  async saveFbApp(user: AuthUser, appId: string, secret: string | undefined, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    if ((await this.platformTenantId()) !== user.tenantId) throw new BadRequestException('O app do Facebook é cadastrado só no painel da plataforma.')
    const c = await this.fbApp(user.tenantId)
    if (!/^\d{5,25}$/.test(appId.trim())) throw new BadRequestException('O ID do app da Meta tem só números.')
    if (!secret?.trim() && !c.secretEnc) throw new BadRequestException('Informe a chave secreta do app da Meta.')
    await this.settings.set(user.tenantId, FB_APP_KEY, { appId: appId.trim(), secretEnc: secret?.trim() ? encrypt(secret.trim()) : c.secretEnc })
    await this.audit.byUser(user, ctx, 'postagens.facebook_app', 'settings', FB_APP_KEY, { appId: appId.trim(), chaveNova: !!secret?.trim() })
    return { ok: true }
  }

  /** Botão "Conectar páginas do Facebook": endereço do login do Facebook. */
  async startFacebook(user: AuthUser) {
    this.assertCan(user, 'edit')
    const sel = await this.fbAppFor()
    if (!sel) throw new BadRequestException('A conexão com o Facebook ainda não está liberada nesta plataforma. Fale com o suporte.')
    const state = `${user.tenantId}.${randomBytes(24).toString('base64url')}`
    await this.settings.set(user.tenantId, FB_OAUTH_KEY, { state, userId: user.id, redirectUri: sel.redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() })
    return { url: facebookAuthorizeUrl(sel.app.appId, sel.redirectUri, state) }
  }

  /** Volta do Facebook: as páginas liberadas entram (ou são atualizadas) na lista. */
  async completeFacebook(user: AuthUser, code: string, state: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const pending = await this.settings.get<{ state?: string; userId?: string; redirectUri?: string; expiresAt?: string }>(user.tenantId, FB_OAUTH_KEY, {})
    if (!pending.state || !safeEqual(pending.state, state) || pending.userId !== user.id || Date.parse(pending.expiresAt ?? '') < Date.now()) {
      throw new BadRequestException('Autorização inválida ou expirada. Clique em Conectar páginas do Facebook de novo.')
    }
    await this.settings.set(user.tenantId, FB_OAUTH_KEY, {})
    const sel = await this.fbAppFor()
    if (!sel?.app.secretEnc) throw new BadRequestException('A conexão com o Facebook ainda não está liberada nesta plataforma. Fale com o suporte.')
    let pages
    try {
      pages = await this.fbLogin.connect({ appId: sel.app.appId, secret: decrypt(sel.app.secretEnc) }, code, pending.redirectUri ?? sel.redirectUri)
    } catch (err) {
      throw new BadRequestException((err as Error).message)
    }
    const tokens = await this.fbTokens(user.tenantId)
    const accounts = await this.accounts(user.tenantId)
    const now = new Date().toISOString()
    for (const pg of pages) {
      tokens[pg.id] = { tokenEnc: encrypt(pg.token), name: pg.name, issuedAt: now, connectedBy: user.name, lastError: null }
      const i = accounts.findIndex((a) => a.network === 'facebook' && a.externalId === pg.id)
      if (i >= 0) accounts[i] = { ...accounts[i]!, name: pg.name, via: 'facebook' }
      else accounts.push({ id: `fb-${pg.id}`, network: 'facebook', externalId: pg.id, name: pg.name, group: accounts[0]?.group ?? 'Oficial', via: 'facebook' })
    }
    if (accounts.length > 30) throw new BadRequestException('Limite de 30 contas atingido: tire contas da lista antes de conectar outras.')
    await this.settings.set(user.tenantId, FB_TOKENS_KEY, tokens)
    await this.settings.set(user.tenantId, ACCOUNTS_KEY, { accounts })
    this.metricsCache.delete(user.tenantId)
    await this.audit.byUser(user, ctx, 'postagens.facebook_conectado', 'settings', FB_TOKENS_KEY, { paginas: pages.map((p) => p.name) })
    return { pages: pages.map((p) => p.name), accounts }
  }

  /** Retorno no painel da plataforma: endereço da empresa que começou (Instagram, Facebook ou YouTube). */
  async oauthDestination(network: 'instagram' | 'facebook' | 'youtube', state: string) {
    if (network === 'instagram') return this.igDestination(state)
    const tenantId = tenantOfState(state)
    if (!tenantId) throw new BadRequestException('Autorização inválida. Clique em Conectar de novo.')
    const pending = await this.settings.get<{ state?: string; expiresAt?: string }>(tenantId, network === 'youtube' ? YT_OAUTH_KEY : FB_OAUTH_KEY, {})
    if (!pending.state || !safeEqual(pending.state, state) || Date.parse(pending.expiresAt ?? '') < Date.now()) {
      throw new BadRequestException('Autorização inválida ou expirada. Clique em Conectar de novo.')
    }
    return { url: `${await this.tenants.url(tenantId)}${network === 'youtube' ? YT_CALLBACK_PATH : FB_CALLBACK_PATH}` }
  }

  // ---------- Canais do YouTube pelo login do Google (app da plataforma) ----------

  private async ytApp(tenantId: string): Promise<YtApp> {
    return { clientId: '', secretEnc: null, ...(await this.settings.get<Partial<YtApp>>(tenantId, YT_APP_KEY, {})) }
  }

  private async ytTokens(tenantId: string) {
    return this.settings.get<Record<string, YtToken>>(tenantId, YT_TOKENS_KEY, {})
  }

  private async ytAppFor(): Promise<{ app: YtApp; redirectUri: string } | null> {
    const pid = await this.platformTenantId()
    if (!pid) return null
    const app = await this.ytApp(pid)
    if (!app.clientId || !app.secretEnc) return null
    return { app, redirectUri: `${await this.tenants.url(pid)}${YT_PLATFORM_CALLBACK_PATH}` }
  }

  /** Painel da plataforma: cliente OAuth do Google (Google Cloud › Credenciais) com a API do YouTube ligada. */
  async saveYtApp(user: AuthUser, clientId: string, secret: string | undefined, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    if ((await this.platformTenantId()) !== user.tenantId) throw new BadRequestException('O app do Google é cadastrado só no painel da plataforma.')
    const c = await this.ytApp(user.tenantId)
    if (!/^[\w.-]{10,200}\.apps\.googleusercontent\.com$/.test(clientId.trim())) throw new BadRequestException('O ID do cliente do Google termina em .apps.googleusercontent.com.')
    if (!secret?.trim() && !c.secretEnc) throw new BadRequestException('Informe a chave secreta do cliente do Google.')
    await this.settings.set(user.tenantId, YT_APP_KEY, { clientId: clientId.trim(), secretEnc: secret?.trim() ? encrypt(secret.trim()) : c.secretEnc })
    await this.audit.byUser(user, ctx, 'postagens.youtube_app', 'settings', YT_APP_KEY, { clientId: clientId.trim(), chaveNova: !!secret?.trim() })
    return { ok: true }
  }

  async startYoutube(user: AuthUser) {
    this.assertCan(user, 'edit')
    const sel = await this.ytAppFor()
    if (!sel) throw new BadRequestException('A conexão com o YouTube ainda não está liberada nesta plataforma. Fale com o suporte.')
    const state = `${user.tenantId}.${randomBytes(24).toString('base64url')}`
    await this.settings.set(user.tenantId, YT_OAUTH_KEY, { state, userId: user.id, redirectUri: sel.redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() })
    return { url: youtubeAuthorizeUrl(sel.app.clientId, sel.redirectUri, state) }
  }

  async completeYoutube(user: AuthUser, code: string, state: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const pending = await this.settings.get<{ state?: string; userId?: string; redirectUri?: string; expiresAt?: string }>(user.tenantId, YT_OAUTH_KEY, {})
    if (!pending.state || !safeEqual(pending.state, state) || pending.userId !== user.id || Date.parse(pending.expiresAt ?? '') < Date.now()) {
      throw new BadRequestException('Autorização inválida ou expirada. Clique em Conectar canal do YouTube de novo.')
    }
    await this.settings.set(user.tenantId, YT_OAUTH_KEY, {})
    const sel = await this.ytAppFor()
    if (!sel?.app.secretEnc) throw new BadRequestException('A conexão com o YouTube ainda não está liberada nesta plataforma. Fale com o suporte.')
    let r
    try {
      r = await this.youtube.connect({ clientId: sel.app.clientId, secret: decrypt(sel.app.secretEnc) }, code, pending.redirectUri ?? sel.redirectUri)
    } catch (err) {
      throw new BadRequestException((err as Error).message)
    }
    const tokens = await this.ytTokens(user.tenantId)
    tokens[r.channelId] = { refreshEnc: encrypt(r.refresh), title: r.title, issuedAt: new Date().toISOString(), connectedBy: user.name, lastError: null }
    const accounts = await this.accounts(user.tenantId)
    const i = accounts.findIndex((a) => a.network === 'youtube' && a.externalId === r.channelId)
    if (i >= 0) accounts[i] = { ...accounts[i]!, name: r.title, via: 'youtube' }
    else accounts.push({ id: `yt-${r.channelId}`, network: 'youtube', externalId: r.channelId, name: r.title, group: accounts[0]?.group ?? 'Oficial', via: 'youtube' })
    if (accounts.length > 30) throw new BadRequestException('Limite de 30 contas atingido: tire uma conta da lista antes de conectar outra.')
    await this.settings.set(user.tenantId, YT_TOKENS_KEY, tokens)
    await this.settings.set(user.tenantId, ACCOUNTS_KEY, { accounts })
    this.metricsCache.delete(user.tenantId)
    await this.audit.byUser(user, ctx, 'postagens.youtube_conectado', 'settings', YT_TOKENS_KEY, { canal: r.title, id: r.channelId })
    return { channel: r.title, accounts }
  }

  /** Acesso de 1 hora ao canal (renovado a partir do guardado). */
  private async ytAccess(tenantId: string, channelId: string, cache: Map<string, string>) {
    const hit = cache.get(channelId)
    if (hit) return hit
    const t = (await this.ytTokens(tenantId))[channelId]
    if (!t) throw new Error('Canal sem conexão com o YouTube: clique em Conectar canal do YouTube na aba Contas.')
    const sel = await this.ytAppFor()
    if (!sel?.app.secretEnc) throw new Error('A conexão com o YouTube não está liberada nesta plataforma.')
    try {
      const access = await this.youtube.access({ clientId: sel.app.clientId, secret: decrypt(sel.app.secretEnc) }, decrypt(t.refreshEnc))
      cache.set(channelId, access)
      return access
    } catch (err) {
      const tokens = await this.ytTokens(tenantId)
      if (tokens[channelId]) {
        tokens[channelId] = { ...tokens[channelId]!, lastError: (err as Error).message.slice(0, 300) }
        await this.settings.set(tenantId, YT_TOKENS_KEY, tokens)
      }
      throw err
    }
  }

  /** Renova os tokens do Instagram perto de vencer (todas as empresas). */
  async renewInstagramTokens(now = Date.now()) {
    const rows = await this.prisma.tenantSetting.findMany({ where: { key: IG_TOKENS_KEY }, select: { tenantId: true } })
    for (const { tenantId } of rows) {
      const tokens = await this.igTokens(tenantId)
      let changed = false
      for (const [id, t] of Object.entries(tokens)) {
        if (!needsRenewal(t, now)) continue
        try {
          const r = await this.igLogin.refresh(decrypt(t.tokenEnc))
          tokens[id] = { ...t, tokenEnc: encrypt(r.token), expiresAt: r.expiresAt, issuedAt: new Date(now).toISOString(), lastError: null }
        } catch (err) {
          tokens[id] = { ...t, lastError: (err as Error).message.slice(0, 300) }
          this.logger.warn(`Instagram @${t.username}: não renovou o acesso (${(err as Error).message})`)
        }
        changed = true
      }
      if (changed) await this.settings.set(tenantId, IG_TOKENS_KEY, tokens)
    }
  }

  /**
   * Quem publica por uma conta: o token da própria conta (conectada pelo login do Instagram) ou o token da Meta
   * (Marketing Inteligente).
   */
  private async publisherFor(tenantId: string, a: Account, cache: Map<string, MetaPublisher>) {
    const key = a.via === 'instagram' ? `ig:${a.externalId}` : a.via === 'facebook' ? `fb:${a.externalId}` : 'meta'
    const hit = cache.get(key)
    if (hit) return hit
    let p: MetaPublisher
    if (a.via === 'instagram') {
      const t = (await this.igTokens(tenantId))[a.externalId]
      if (!t) throw new Error('Conta sem conexão com o Instagram: clique em Conectar conta do Instagram na aba Contas.')
      if (Date.parse(t.expiresAt) < Date.now()) throw new Error('A conexão desta conta com o Instagram venceu: conecte de novo na aba Contas.')
      p = new MetaPublisher(decrypt(t.tokenEnc), fetch, 5_000, IG_GRAPH)
    } else if (a.via === 'facebook') {
      const t = (await this.fbTokens(tenantId))[a.externalId]
      if (!t) throw new Error('Página sem conexão com o Facebook: clique em Conectar páginas do Facebook na aba Contas.')
      const pt = decrypt(t.tokenEnc)
      p = new MetaPublisher(pt, fetch, 5_000, undefined, pt)
    } else {
      const c = await this.integrations(tenantId)
      if (!c.metaAds.tokenEnc) throw new Error('Token da Meta não cadastrado (Configurações › Marketing Inteligente).')
      p = new MetaPublisher(decrypt(c.metaAds.tokenEnc))
    }
    cache.set(key, p)
    return p
  }

  /** Contas que o token da Meta alcança (para escolher quais cadastrar). */
  async discoverAccounts(user: AuthUser) {
    this.assertCan(user, 'edit')
    const c = await this.integrations(user.tenantId)
    if (!c.metaAds.tokenEnc) throw new BadRequestException('Cadastre o token da Meta em Configurações › Marketing Inteligente.')
    try {
      return { found: await new MetaPublisher(decrypt(c.metaAds.tokenEnc)).discover() }
    } catch (err) {
      throw new BadRequestException((err as Error).message)
    }
  }

  /** Conexão com a Meta para publicar: o token do Marketing Inteligente e as contas cadastradas aqui. */
  async config(user: AuthUser) {
    this.assertCan(user, 'view')
    const c = await this.integrations(user.tenantId)
    const app = await this.igApp(user.tenantId)
    const tokens = await this.igTokens(user.tenantId)
    const sel = await this.igAppFor(user.tenantId)
    const isPlatform = (await this.platformTenantId()) === user.tenantId
    return {
      hasToken: !!c.metaAds.tokenEnc,
      instagram: {
        appId: app.appId,
        hasSecret: !!app.secretEnc,
        // Empresa cliente: conecta pelo app da plataforma (sem app próprio). Painel da plataforma: cadastra o app.
        ready: !!sel,
        platformApp: !!sel?.platform && !isPlatform,
        isPlatform,
        redirectUri: isPlatform ? `${await this.tenants.url(user.tenantId)}${IG_PLATFORM_CALLBACK_PATH}` : await this.igRedirectUri(user.tenantId),
        connections: Object.fromEntries(Object.entries(tokens).map(([id, t]) => [id, { username: t.username, expiresAt: t.expiresAt, connectedBy: t.connectedBy, lastError: t.lastError }])),
      },
      facebook: {
        ready: !!(await this.fbAppFor()),
        isPlatform,
        appId: isPlatform ? (await this.fbApp(user.tenantId)).appId : '',
        hasSecret: isPlatform ? !!(await this.fbApp(user.tenantId)).secretEnc : false,
        redirectUri: isPlatform ? `${await this.tenants.url(user.tenantId)}${FB_PLATFORM_CALLBACK_PATH}` : '',
        connections: Object.fromEntries(Object.entries(await this.fbTokens(user.tenantId)).map(([id, t]) => [id, { name: t.name, connectedBy: t.connectedBy, lastError: t.lastError }])),
      },
      youtube: {
        ready: !!(await this.ytAppFor()),
        isPlatform,
        clientId: isPlatform ? (await this.ytApp(user.tenantId)).clientId : '',
        hasSecret: isPlatform ? !!(await this.ytApp(user.tenantId)).secretEnc : false,
        redirectUri: isPlatform ? `${await this.tenants.url(user.tenantId)}${YT_PLATFORM_CALLBACK_PATH}` : '',
        connections: Object.fromEntries(Object.entries(await this.ytTokens(user.tenantId)).map(([id, t]) => [id, { name: t.title, connectedBy: t.connectedBy, lastError: t.lastError }])),
      },
      accounts: await this.accounts(user.tenantId),
      hasAi: await this.ai.available(user.tenantId),
      canApprove: can(user.permissions, user.role.isSystem, 'postagens', 'edit'),
      publicBase: await this.tenants.url(user.tenantId),
    }
  }

  /** Botão "Testar publicação": permissões do token, Instagram e página. */
  async test(user: AuthUser) {
    this.assertCan(user, 'edit')
    const c = await this.integrations(user.tenantId)
    const accounts = await this.accounts(user.tenantId)
    const viaMeta = accounts.filter((a) => !a.via)
    const viaIg = accounts.filter((a) => a.via === 'instagram')
    const viaFb = accounts.filter((a) => a.via === 'facebook')
    const viaYt = accounts.filter((a) => a.network === 'youtube')
    if (!c.metaAds.tokenEnc && !viaIg.length && !viaFb.length && !viaYt.length) throw new BadRequestException('Conecte uma conta do Instagram, do Facebook ou do YouTube na aba Contas.')
    const checks: { name: string; ok: boolean; message: string }[] = []
    if (c.metaAds.tokenEnc && (viaMeta.length || (!viaIg.length && !viaFb.length && !viaYt.length))) checks.push(...(await new MetaPublisher(decrypt(c.metaAds.tokenEnc)).check(viaMeta)))
    const cache = new Map<string, MetaPublisher>()
    for (const a of viaIg) {
      try {
        const r = await (await this.publisherFor(user.tenantId, a, cache)).instagramCheck(a)
        checks.push({ ...r, message: `${r.message} · conectada pelo login do Instagram` })
      } catch (err) {
        checks.push({ name: `Instagram ${a.name}`, ok: false, message: (err as Error).message })
      }
    }
    for (const a of viaFb) {
      try {
        await (await this.publisherFor(user.tenantId, a, cache)).facebookMetrics(a.externalId)
        checks.push({ name: `Facebook ${a.name}`, ok: true, message: 'Página conectada pelo login do Facebook' })
      } catch (err) {
        checks.push({ name: `Facebook ${a.name}`, ok: false, message: (err as Error).message })
      }
    }
    const ytCache = new Map<string, string>()
    for (const a of viaYt) {
      try {
        const ch = await this.youtube.channel(await this.ytAccess(user.tenantId, a.externalId, ytCache))
        checks.push({ name: `YouTube ${a.name}`, ok: true, message: `Canal ${ch.title} conectado pelo login do Google` })
      } catch (err) {
        checks.push({ name: `YouTube ${a.name}`, ok: false, message: (err as Error).message })
      }
    }
    return { checks }
  }

  // ---------- Métricas ----------

  /**
   * Métricas de cada conta (últimos 28 dias), somadas por grupo, o perfil dos seguidores (Instagram) e os números das
   * postagens publicadas pelo CRM nos últimos 60 dias. Guardadas por 3 horas; "Atualizar" busca de novo.
   */
  async metrics(user: AuthUser, refresh: boolean) {
    this.assertCan(user, 'view')
    const hit = this.metricsCache.get(user.tenantId)
    if (!refresh && hit && Date.now() - hit.at < METRICS_TTL_MS) return hit.data
    const c = await this.integrations(user.tenantId)
    const accounts = await this.accounts(user.tenantId)
    if (!c.metaAds.tokenEnc && !accounts.some((a) => a.via)) throw new BadRequestException('Conecte uma conta do Instagram, do Facebook ou do YouTube na aba Contas.')
    const cache = new Map<string, MetaPublisher>()
    const ytCache = new Map<string, string>()
    const rows: (Account & AccountMetrics & { engagement: number | null; error: string | null })[] = []
    for (const a of accounts) {
      try {
        if (a.network === 'youtube') {
          const ch = await this.youtube.channel(await this.ytAccess(user.tenantId, a.externalId, ytCache))
          const m: AccountMetrics = { followers: ch.subscribers, posts: ch.videos, reach: ch.views, engaged: null, interactions: null, likes: null, comments: null, saves: null, shares: null, demographics: null, warnings: ['YouTube: alcance = visualizações totais do canal'] }
          rows.push({ ...a, ...m, engagement: null, error: null })
          continue
        }
        const meta = await this.publisherFor(user.tenantId, a, cache)
        const m = a.network === 'instagram' ? await meta.instagramMetrics(a.externalId) : await meta.facebookMetrics(a.externalId)
        rows.push({ ...a, ...m, engagement: engagementRate(m), error: null })
      } catch (err) {
        rows.push({ ...a, followers: null, posts: null, reach: null, engaged: null, interactions: null, likes: null, comments: null, saves: null, shares: null, demographics: null, warnings: [], engagement: null, error: (err as Error).message.slice(0, 300) })
      }
    }
    const since = new Date(Date.now() - 60 * 86_400_000)
    const published = await this.prisma.socialPost.findMany({ where: { tenantId: user.tenantId, publishedAt: { gte: since } }, orderBy: { publishedAt: 'desc' }, take: 30, select: { id: true, title: true, format: true, publishedAt: true, results: true, mediaIds: true } })
    const posts: { postId: string; title: string; format: string; publishedAt: Date | null; mediaId: string | null; accountId: string; account: string; network: string; group: string; permalink: string | null; metrics: PostMetrics | null; engagement: number | null; error: string | null }[] = []
    for (const p of published) {
      for (const [accountId, r] of Object.entries((p.results as PostResults | null) ?? {})) {
        if (!r.id) continue
        const a = accounts.find((x) => x.id === accountId)
        const base = { postId: p.id, title: p.title, format: p.format, publishedAt: p.publishedAt, mediaId: p.mediaIds[0] ?? null, accountId, account: a?.name ?? r.name ?? accountId, network: a?.network ?? r.network ?? 'instagram', group: a?.group ?? 'Geral', permalink: r.permalink ?? null }
        try {
          if (base.network === 'youtube') {
            if (!a) throw new Error('Canal removido da lista de contas.')
            const v = await this.youtube.videoStats(await this.ytAccess(user.tenantId, a.externalId, ytCache), r.id)
            const m: PostMetrics = { reach: v.views, likes: v.likes, comments: v.comments, saves: null, shares: null, interactions: v.likes + v.comments }
            posts.push({ ...base, metrics: m, engagement: engagementRate({ followers: rows.find((x) => x.id === a.id)?.followers ?? null, reach: m.reach, interactions: m.interactions }), error: null })
            continue
          }
          const meta = await this.publisherFor(user.tenantId, a ?? { id: accountId, network: base.network as 'instagram' | 'facebook', externalId: '', name: base.account, group: base.group }, cache)
          const m = await meta.postMetrics(base.network as 'instagram' | 'facebook', r.id, a?.network === 'facebook' ? a.externalId : undefined)
          posts.push({ ...base, metrics: m, engagement: engagementRate({ followers: a ? (rows.find((x) => x.id === a.id)?.followers ?? null) : null, reach: m.reach, interactions: m.interactions }), error: null })
        } catch (err) {
          posts.push({ ...base, metrics: null, engagement: null, error: (err as Error).message.slice(0, 200) })
        }
      }
    }
    const data = { at: new Date().toISOString(), accounts: rows, groups: groupTotals(rows), posts }
    this.metricsCache.set(user.tenantId, { at: Date.now(), data })
    return data
  }

  // ---------- Biblioteca de mídias ----------

  async media(user: AuthUser, q: { kind?: string; page?: number }) {
    this.assertCan(user, 'view')
    const where: Prisma.SocialMediaWhereInput = { tenantId: user.tenantId, ...(q.kind === 'imagem' || q.kind === 'video' ? { kind: q.kind } : {}) }
    const page = Math.max(1, q.page ?? 1)
    const [total, items] = await Promise.all([
      this.prisma.socialMedia.count({ where }),
      this.prisma.socialMedia.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 60, take: 60, select: { id: true, kind: true, mime: true, name: true, source: true, width: true, height: true, size: true, createdByName: true, createdAt: true } }),
    ])
    return { total, page, items }
  }

  /**
   * Nova mídia: imagem JPEG (o navegador converte e enquadra antes de enviar) ou vídeo MP4/MOV. O tipo é conferido
   * pelos bytes, não pelo nome do arquivo.
   */
  async addMedia(user: AuthUser, file: Express.Multer.File | undefined, d: { name?: string; source?: string; width?: number; height?: number }) {
    this.assertCan(user, 'create')
    if (!file?.buffer?.length) throw new BadRequestException('Escolha um arquivo.')
    const type = detectPostFile(file.buffer)
    if (!type) throw new BadRequestException('Formato não aceito: imagem JPEG ou vídeo MP4.')
    if (type.kind === 'imagem' && file.size > IMAGE_MAX_BYTES) throw new BadRequestException('Imagem maior que 8 MB (limite do Instagram).')
    if (type.kind === 'video' && file.size > VIDEO_MAX_BYTES) throw new BadRequestException('Vídeo maior que 64 MB. Diminua o vídeo (ou envie pelo celular).')
    const size = type.kind === 'imagem' ? jpegSize(file.buffer) : null
    const w = size?.width ?? (Number.isFinite(d.width) ? Math.round(d.width!) : null)
    const h = size?.height ?? (Number.isFinite(d.height) ? Math.round(d.height!) : null)
    const asset = await this.files.saveBuffer(user.tenantId, 'postagem', file.buffer, type.mime, type.ext)
    const source = ['upload', 'arte', 'catalogo', 'ia', 'video'].includes(d.source ?? '') ? d.source! : 'upload'
    const name = (d.name ?? file.originalname ?? '').trim().slice(0, 120) || (type.kind === 'imagem' ? 'Imagem' : 'Vídeo')
    return this.prisma.socialMedia.create({
      data: { tenantId: user.tenantId, fileId: asset.id, kind: type.kind, mime: type.mime, name, source, width: w, height: h, size: file.size, createdById: user.id, createdByName: user.name.slice(0, 120) },
      select: { id: true, kind: true, mime: true, name: true, source: true, width: true, height: true, size: true, createdByName: true, createdAt: true },
    })
  }

  async mediaFile(user: AuthUser, id: string) {
    this.assertCan(user, 'view')
    const m = await this.prisma.socialMedia.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!m) throw new NotFoundException()
    const { content } = await this.files.read(m.fileId)
    return { mime: m.mime, content }
  }

  async removeMedia(user: AuthUser, id: string, ctx: RequestCtx) {
    this.assertCan(user, 'delete')
    const m = await this.prisma.socialMedia.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!m) throw new NotFoundException('Mídia não encontrada.')
    const used = await this.prisma.socialPost.count({ where: { tenantId: user.tenantId, mediaIds: { has: id }, status: { in: ['EM_APROVACAO', 'APROVADO', 'PUBLICANDO'] } } })
    if (used) throw new BadRequestException('Esta mídia está numa postagem em aprovação ou agendada. Tire da postagem antes de apagar.')
    await this.prisma.socialMedia.delete({ where: { id } })
    await this.files.remove(m.fileId)
    await this.audit.byUser(user, ctx, 'postagens.midia_apagada', 'social_media', id, { nome: m.name })
    return { ok: true }
  }

  /** Produtos do catálogo da loja (com foto), para usar a foto numa postagem. */
  async products(user: AuthUser, search?: string) {
    this.assertCan(user, 'view')
    const s = search?.trim()
    return this.prisma.storeProduct.findMany({
      where: { tenantId: user.tenantId, active: true, image: { not: null }, ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s } }, { brand: { contains: s, mode: 'insensitive' } }] } : {}) },
      orderBy: { name: 'asc' },
      take: 40,
      select: { id: true, code: true, name: true, brand: true, url: true },
    })
  }

  /**
   * Foto de um produto do catálogo, baixada pelo servidor (a tela não pode ler imagens de outro site para montar a arte).
   * Só o endereço cadastrado do produto, só https e no máximo 8 MB.
   */
  async productImage(user: AuthUser, id: string) {
    this.assertCan(user, 'create')
    const p = await this.prisma.storeProduct.findFirst({ where: { id, tenantId: user.tenantId }, select: { image: true } })
    if (!p?.image || !/^https:\/\//i.test(p.image)) throw new NotFoundException('Produto sem foto.')
    const res = await fetch(p.image, { signal: AbortSignal.timeout(20_000), redirect: 'follow' }).catch(() => null)
    if (!res?.ok) throw new BadRequestException('Não foi possível baixar a foto do produto.')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > IMAGE_MAX_BYTES) throw new BadRequestException('Foto do produto maior que 8 MB.')
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new BadRequestException('A foto do produto não é uma imagem comum (JPEG, PNG ou WEBP).')
    return { mime, content: buf }
  }

  // ---------- Postagens ----------

  private shape(p: Prisma.SocialPostGetPayload<object>) {
    return {
      id: p.id,
      title: p.title,
      caption: p.caption,
      accountIds: p.accountIds,
      networks: p.networks,
      format: p.format,
      mediaIds: p.mediaIds,
      scheduledAt: p.scheduledAt,
      status: p.status,
      results: p.results,
      error: p.error,
      reviewNote: p.reviewNote,
      createdByName: p.createdByName,
      updatedByName: p.updatedByName,
      submittedAt: p.submittedAt,
      approvedByName: p.approvedByName,
      approvedAt: p.approvedAt,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }
  }

  /** Calendário: as postagens do período (pela data marcada; sem data, pela criação) e as que aguardam aprovação. */
  async list(user: AuthUser, q: { from?: string; to?: string; status?: string }) {
    this.assertCan(user, 'view')
    const from = q.from && Number.isFinite(Date.parse(q.from)) ? new Date(q.from) : new Date(Date.now() - 31 * 86_400_000)
    const to = q.to && Number.isFinite(Date.parse(q.to)) ? new Date(q.to) : new Date(Date.now() + 62 * 86_400_000)
    const where: Prisma.SocialPostWhereInput = {
      tenantId: user.tenantId,
      ...(q.status ? { status: q.status } : { OR: [{ scheduledAt: { gte: from, lte: to } }, { scheduledAt: null, createdAt: { gte: from } }, { publishedAt: { gte: from, lte: to } }] }),
    }
    const rows = await this.prisma.socialPost.findMany({ where, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }], take: 500 })
    const counts = await this.prisma.socialPost.groupBy({ by: ['status'], where: { tenantId: user.tenantId, status: { in: ['EM_APROVACAO', 'ERRO'] } }, _count: true })
    return { items: rows.map((r) => this.shape(r)), waiting: counts.find((c) => c.status === 'EM_APROVACAO')?._count ?? 0, errors: counts.find((c) => c.status === 'ERRO')?._count ?? 0 }
  }

  private async load(user: AuthUser, id: string) {
    const p = await this.prisma.socialPost.findFirst({ where: { id, tenantId: user.tenantId } })
    if (!p) throw new NotFoundException('Postagem não encontrada.')
    return p
  }

  async get(user: AuthUser, id: string) {
    this.assertCan(user, 'view')
    return this.shape(await this.load(user, id))
  }

  private async mediaInfo(tenantId: string, ids: string[]): Promise<MediaInfo[]> {
    if (!ids.length) return []
    const rows = await this.prisma.socialMedia.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, kind: true, width: true, height: true } })
    return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ id: r.id, kind: r.kind as MediaInfo['kind'], width: r.width, height: r.height }))
  }

  private async clean(tenantId: string, d: PostInput): Promise<CleanPost> {
    const c = cleanPost(d, await this.accounts(tenantId))
    if ('error' in c) throw new BadRequestException(c.error)
    return c
  }

  /** O que está gravado na postagem, como entrada para as regras. */
  private stored(p: Prisma.SocialPostGetPayload<object>): PostInput {
    return { title: p.title, caption: p.caption, accountIds: p.accountIds, format: p.format, mediaIds: p.mediaIds, scheduledAt: p.scheduledAt?.toISOString() ?? null }
  }

  async create(user: AuthUser, d: PostInput, ctx: RequestCtx) {
    this.assertCan(user, 'create')
    const c = await this.clean(user.tenantId, d)
    const media = await this.mediaInfo(user.tenantId, c.mediaIds)
    const p = await this.prisma.socialPost.create({
      data: { tenantId: user.tenantId, ...c, mediaIds: media.map((m) => m.id), publicToken: randomBytes(24).toString('base64url'), createdById: user.id, createdByName: user.name.slice(0, 120) },
    })
    await this.audit.byUser(user, ctx, 'postagens.criada', 'social_post', p.id, { titulo: p.title })
    return this.shape(p)
  }

  /**
   * Salva o conteúdo. Postagem aprovada que muda de conteúdo volta para aprovação (o que foi aprovado era outra coisa);
   * só a data muda sem nova aprovação quando quem muda pode aprovar.
   */
  async update(user: AuthUser, id: string, d: PostInput, ctx: RequestCtx) {
    this.assertCan(user, 'create')
    const p = await this.load(user, id)
    if (p.status === 'PUBLICANDO' || p.status === 'PUBLICADO') throw new BadRequestException('Postagem já publicada (ou publicando): não dá mais para mudar.')
    const c = await this.clean(user.tenantId, d)
    const media = await this.mediaInfo(user.tenantId, c.mediaIds)
    const content = c.caption !== p.caption || c.format !== p.format || c.accountIds.join() !== p.accountIds.join() || media.map((m) => m.id).join() !== p.mediaIds.join()
    const approver = can(user.permissions, user.role.isSystem, 'postagens', 'edit')
    const back = p.status === 'APROVADO' && (content || !approver)
    const r = await this.prisma.socialPost.update({
      where: { id },
      data: { ...c, mediaIds: media.map((m) => m.id), updatedByName: user.name.slice(0, 120), ...(back ? { status: 'EM_APROVACAO', approvedById: null, approvedByName: null, approvedAt: null, submittedAt: new Date() } : {}), ...(p.status === 'ERRO' ? { status: 'RASCUNHO', error: null } : {}) },
    })
    await this.audit.byUser(user, ctx, 'postagens.alterada', 'social_post', id, { titulo: r.title, voltouParaAprovacao: back })
    return { ...this.shape(r), message: back ? 'Salvo. Como a postagem mudou, ela voltou para aprovação.' : 'Salvo.' }
  }

  async remove(user: AuthUser, id: string, ctx: RequestCtx) {
    this.assertCan(user, 'delete')
    const p = await this.load(user, id)
    if (p.status === 'PUBLICANDO') throw new BadRequestException('A postagem está sendo publicada agora. Aguarde terminar.')
    await this.prisma.socialPost.delete({ where: { id } })
    await this.audit.byUser(user, ctx, 'postagens.apagada', 'social_post', id, { titulo: p.title, situacao: p.status })
    return { ok: true, message: p.status === 'PUBLICADO' ? 'Apagada do CRM. A publicação continua no Instagram/Facebook (apague por lá, se quiser).' : 'Postagem apagada.' }
  }

  /** Manda para aprovação (confere se está completa). */
  async submit(user: AuthUser, id: string, ctx: RequestCtx) {
    this.assertCan(user, 'create')
    const p = await this.load(user, id)
    if (!['RASCUNHO', 'ERRO'].includes(p.status)) throw new BadRequestException('Só rascunhos vão para aprovação.')
    const c = await this.clean(user.tenantId, this.stored(p))
    const missing = missingForApproval(c, await this.mediaInfo(user.tenantId, c.mediaIds))
    if (missing.length) throw new BadRequestException(`Falta completar: ${missing.join(' ')}`)
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'EM_APROVACAO', submittedAt: new Date(), reviewNote: null, error: null } })
    await this.audit.byUser(user, ctx, 'postagens.enviada_aprovacao', 'social_post', id, { titulo: p.title })
    return { ok: true, message: 'Enviada para aprovação.' }
  }

  /** Aprovar: fica agendada (sem data, ou com a data já chegando, sai no próximo minuto). */
  async approve(user: AuthUser, id: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const p = await this.load(user, id)
    if (p.status !== 'EM_APROVACAO') throw new BadRequestException('Esta postagem não está aguardando aprovação.')
    const c = await this.clean(user.tenantId, this.stored(p))
    const missing = missingForApproval(c, await this.mediaInfo(user.tenantId, c.mediaIds))
    if (missing.length) throw new BadRequestException(`Não dá para aprovar: ${missing.join(' ')}`)
    // Token da Meta só é preciso para contas que não foram conectadas pelo login (Instagram ou Facebook).
    const accounts = await this.accounts(user.tenantId)
    const needsMeta = c.accountIds.some((aid) => !accounts.find((a) => a.id === aid)?.via)
    const conn = await this.integrations(user.tenantId)
    if (needsMeta && !conn.metaAds.tokenEnc) throw new BadRequestException('Conecte as contas pelo login do Instagram ou do Facebook na aba Contas antes de aprovar.')
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'APROVADO', approvedById: user.id, approvedByName: user.name.slice(0, 120), approvedAt: new Date(), reviewNote: null } })
    await this.audit.byUser(user, ctx, 'postagens.aprovada', 'social_post', id, { titulo: p.title, quando: p.scheduledAt?.toISOString() ?? 'assim que aprovada' })
    return { ok: true, message: p.scheduledAt && p.scheduledAt.getTime() > Date.now() + 60_000 ? `Aprovada: sai em ${p.scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.` : 'Aprovada: sai no próximo minuto.' }
  }

  /** Devolver para ajustes, com o motivo. */
  async reject(user: AuthUser, id: string, note: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const p = await this.load(user, id)
    if (!['EM_APROVACAO', 'APROVADO'].includes(p.status)) throw new BadRequestException('Só postagens em aprovação ou agendadas podem voltar para rascunho.')
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'RASCUNHO', reviewNote: note.trim().slice(0, 500) || null, approvedById: null, approvedByName: null, approvedAt: null } })
    await this.audit.byUser(user, ctx, 'postagens.devolvida', 'social_post', id, { titulo: p.title, motivo: note.slice(0, 200) })
    return { ok: true, message: p.status === 'APROVADO' ? 'Agendamento cancelado: a postagem voltou para rascunho.' : 'Devolvida para ajustes.' }
  }

  /** Publicar agora (aprovada ou com erro: tenta de novo só as redes que faltaram). */
  async publishNow(user: AuthUser, id: string, ctx: RequestCtx) {
    this.assertCan(user, 'edit')
    const p = await this.load(user, id)
    if (!['APROVADO', 'ERRO'].includes(p.status)) throw new BadRequestException(p.status === 'EM_APROVACAO' ? 'Aprove a postagem antes de publicar.' : 'Esta postagem não pode ser publicada agora.')
    if (p.status === 'ERRO' && !p.approvedAt) throw new BadRequestException('Aprove a postagem antes de publicar.')
    const claimed = await this.prisma.socialPost.updateMany({ where: { id, status: p.status }, data: { status: 'PUBLICANDO' } })
    if (!claimed.count) throw new BadRequestException('A postagem já está sendo publicada.')
    await this.audit.byUser(user, ctx, 'postagens.publicar_agora', 'social_post', id, { titulo: p.title })
    const r = await this.publish(id)
    return { ok: r.status === 'PUBLICADO', status: r.status, message: r.status === 'PUBLICADO' ? 'Publicada.' : `Não publicou: ${r.error ?? 'erro'}` }
  }

  // ---------- Publicação ----------

  /** A cada minuto: publica as aprovadas cuja hora chegou (sem data = assim que aprovadas). */
  async tick() {
    if (this.running) return
    this.running = true
    try {
      // Empresas de demonstração não publicam (as contas delas são fictícias).
      const demo = (await this.prisma.tenant.findMany({ where: { isDemo: true }, select: { id: true } })).map((t) => t.id)
      const due = await this.prisma.socialPost.findMany({ where: { status: 'APROVADO', tenantId: { notIn: demo }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }, orderBy: { scheduledAt: 'asc' }, take: 10, select: { id: true } })
      for (const d of due) {
        const claimed = await this.prisma.socialPost.updateMany({ where: { id: d.id, status: 'APROVADO' }, data: { status: 'PUBLICANDO' } })
        if (claimed.count) await this.publish(d.id)
      }
      // Ficou "publicando" (o servidor reiniciou no meio): volta como erro para alguém conferir e tentar de novo.
      await this.prisma.socialPost.updateMany({ where: { status: 'PUBLICANDO', updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } }, data: { status: 'ERRO', error: 'A publicação foi interrompida. Confira no Instagram/Facebook se saiu e, se não, publique de novo.' } })
      if (Date.now() - this.lastRenew > IG_RENEW_EVERY_MS) {
        this.lastRenew = Date.now()
        await this.renewInstagramTokens()
      }
    } catch (err) {
      this.logger.warn(`Postagens: ${(err as Error).message}`)
    } finally {
      this.running = false
    }
  }

  /** Endereço público de uma mídia da postagem (a Meta baixa daqui); base = endereço da empresa. */
  mediaUrl(base: string, token: string, mediaId: string) {
    return `${base}/api/public/postagens/${token}/${mediaId}`
  }

  private async publish(id: string) {
    const p = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } })
    const results: PostResults = { ...((p.results as PostResults | null) ?? {}) }
    let error: string | null = null
    try {
      const cache = new Map<string, MetaPublisher>()
      const media = await this.prisma.socialMedia.findMany({ where: { tenantId: p.tenantId, id: { in: p.mediaIds } }, select: { id: true, kind: true, fileId: true, mime: true } })
      const ytCache = new Map<string, string>()
      const ordered = p.mediaIds.map((m) => media.find((x) => x.id === m)).filter((m): m is NonNullable<typeof m> => !!m)
      if (!ordered.length) throw new Error('As mídias da postagem foram apagadas da biblioteca.')
      const base = await this.tenants.url(p.tenantId)
      const input = { format: p.format as PostFormat, caption: p.caption, media: ordered.map((m) => ({ kind: m.kind as 'imagem' | 'video', url: this.mediaUrl(base, p.publicToken, m.id) })) }
      const accounts = await this.accounts(p.tenantId)
      // Uma conta por vez: cada uma tem o seu resultado (e a nova tentativa pula as que já saíram).
      for (const id of pendingAccounts(p.accountIds, results)) {
        const a = accounts.find((x) => x.id === id)
        try {
          if (!a) throw new Error('Conta removida da lista de contas de Postagens.')
          let r
          if (a.network === 'youtube') {
            // YouTube recebe o arquivo (não baixa pelo endereço): um vídeo; Reels sai como Shorts.
            const video = ordered.find((m) => m.kind === 'video')
            if (!video) throw new Error('YouTube: a postagem precisa de um vídeo.')
            const { content } = await this.files.read(video.fileId)
            r = await this.youtube.upload(await this.ytAccess(p.tenantId, a.externalId, ytCache), { ...videoMeta({ title: p.title, caption: p.caption, shorts: p.format === 'REELS' }), bytes: content, mime: video.mime || 'video/mp4' })
          } else {
            const meta = await this.publisherFor(p.tenantId, a, cache)
            r = a.network === 'instagram' ? await meta.instagram(a.externalId, input) : await meta.facebook(a.externalId, input)
          }
          results[id] = { ...r, network: a.network, name: a.name }
        } catch (err) {
          results[id] = { error: (err as Error).message.slice(0, 400), at: new Date().toISOString(), network: a?.network, name: a?.name ?? id }
        }
      }
      const failed = p.accountIds.filter((id) => !results[id]?.id)
      if (failed.length) error = failed.map((id) => `${NETWORK_LABEL[results[id]?.network ?? 'instagram']} ${results[id]?.name ?? ''}: ${results[id]?.error ?? 'não publicou'}`).join(' · ')
    } catch (err) {
      error = (err as Error).message.slice(0, 400)
    }
    const done = !error
    const r = await this.prisma.socialPost.update({ where: { id }, data: { status: done ? 'PUBLICADO' : 'ERRO', results: results as unknown as Prisma.InputJsonValue, error, ...(done ? { publishedAt: new Date() } : {}) } })
    await this.audit.log({ tenantId: p.tenantId, action: done ? 'postagens.publicada' : 'postagens.erro', entity: 'social_post', entityId: id, data: { titulo: p.title, erro: error } })
    if (error) this.logger.warn(`Postagem não publicada (${p.title}): ${error}`)
    return r
  }

  /** Mídia para a Meta baixar: só de postagem aprovada, publicando, com erro ou publicada há pouco. */
  async publicMedia(token: string, mediaId: string) {
    const p = await this.prisma.socialPost.findFirst({ where: { publicToken: token, mediaIds: { has: mediaId } }, select: { tenantId: true, status: true, publishedAt: true } })
    const open = p && (['APROVADO', 'PUBLICANDO', 'ERRO'].includes(p.status) || (p.status === 'PUBLICADO' && p.publishedAt && Date.now() - p.publishedAt.getTime() < PUBLIC_AFTER_MS))
    if (!p || !open) throw new NotFoundException()
    const m = await this.prisma.socialMedia.findFirst({ where: { id: mediaId, tenantId: p.tenantId } })
    if (!m) throw new NotFoundException()
    const { content } = await this.files.read(m.fileId)
    return { mime: m.mime, content }
  }

  // ---------- IA ----------

  private async system(tenantId: string) {
    const b = await this.settings.branding(tenantId)
    return postSystem(b.shortName || b.appName, await this.ai.about(tenantId))
  }

  /** Prévia do feed e conferência da legenda (tamanho, primeira linha, gancho, hashtags, um pedido, palavras de busca). */
  checkCaption(user: AuthUser, d: { caption?: string; keywords?: string[] }) {
    this.assertCan(user, 'view')
    return checkCaption((d.caption ?? '').slice(0, 5000), d.keywords ?? [])
  }

  /** Nota de cada abertura (melhor primeiro) e o tempo das falas do roteiro. */
  checkReels(user: AuthUser, d: { hooks?: string[]; lines?: { text: string; screen?: string }[]; seconds?: number }) {
    this.assertCan(user, 'view')
    const hooks = (d.hooks ?? []).filter((h) => h.trim()).slice(0, 6).map(hookScore).sort((a, b) => b.score - a.score)
    return { hooks, sheet: beatSheet((d.lines ?? []).slice(0, 20), Math.min(90, Math.max(7, Number(d.seconds) || 30))) }
  }

  /** Roteiro de Reels com a IA: 3 aberturas com nota, as falas com o tempo de cada uma e a legenda. */
  async aiReels(user: AuthUser, d: { topic?: string; productId?: string; seconds?: number; instruction?: string }) {
    this.assertCan(user, 'create')
    const product = d.productId ? await this.prisma.storeProduct.findFirst({ where: { id: d.productId, tenantId: user.tenantId }, select: { name: true, brand: true, code: true } }) : null
    if (!d.topic?.trim() && !product) throw new BadRequestException('Escreva o tema do Reels (ex.: sinais de que o filtro de ar da JS200 precisa de troca).')
    const seconds = Math.min(90, Math.max(7, Number(d.seconds) || 30))
    const raw = await this.ai.complete(user.tenantId, await this.system(user.tenantId), reelsPrompt({ topic: (d.topic ?? '').slice(0, 500), seconds, product, instruction: d.instruction?.slice(0, 400) }), 3000)
    const r = parseReels(raw)
    if (!r) throw new BadRequestException('A IA não devolveu um roteiro válido. Tente de novo.')
    return { ...this.checkReels(user, { hooks: r.hooks, lines: r.lines, seconds }), lines: r.lines, caption: r.caption, seconds }
  }

  /** O que deu resultado no Instagram nos últimos 90 dias (para o plano da semana): formatos, dias, horários e posts. */
  private async results(tenantId: string) {
    const since = new Date(Date.now() - 90 * 86_400_000)
    const posts = await this.prisma.mktSocialPost.findMany({
      where: { tenantId, network: 'instagram', publishedAt: { gte: since } },
      select: { postId: true, profileId: true, publishedAt: true, format: true, caption: true, permalink: true, reach: true, likes: true, comments: true, shares: true, saves: true },
      take: 2000,
    })
    if (!posts.length) return { text: '', findings: [] as string[] }
    const audit = auditPosts(posts, posts)
    const times = postTimes(posts).best.map((b) => b.label)
    return { text: planInsights(audit, times), findings: audit.measured >= 3 ? [...audit.findings, ...(times.length ? [`Horários com mais alcance: ${times.join('; ')}.`] : [])] : [] }
  }

  async aiCaption(user: AuthUser, d: { topic?: string; network?: string; format?: string; productId?: string; current?: string; instruction?: string; keywords?: string[] }) {
    this.assertCan(user, 'create')
    const product = d.productId ? await this.prisma.storeProduct.findFirst({ where: { id: d.productId, tenantId: user.tenantId }, select: { name: true, brand: true, code: true, url: true } }) : null
    const prompt = captionPrompt({ topic: (d.topic ?? '').slice(0, 500), network: d.network === 'facebook' ? 'Facebook' : d.network === 'ambos' ? 'Instagram e Facebook' : 'Instagram', format: (FORMATS as readonly string[]).includes(d.format ?? '') ? d.format! : 'FEED', product, current: d.current?.slice(0, 2200), instruction: d.instruction?.slice(0, 400), keywords: (d.keywords ?? []).slice(0, 10) })
    if (!d.topic?.trim() && !product && !d.current?.trim()) throw new BadRequestException('Escreva o tema, escolha um produto ou escreva a legenda para a IA melhorar.')
    const raw = await this.ai.complete(user.tenantId, await this.system(user.tenantId), prompt, 1500)
    return { caption: cleanCaption(raw) }
  }

  async aiPlan(user: AuthUser, d: Partial<PlanInput> & { accountIds?: string[] }) {
    this.assertCan(user, 'create')
    const day = /^\d{4}-\d{2}-\d{2}$/
    if (!day.test(d.from ?? '') || !day.test(d.to ?? '') || d.from! > d.to!) throw new BadRequestException('Escolha o período (de / até).')
    if (Date.parse(d.to!) - Date.parse(d.from!) > 62 * 86_400_000) throw new BadRequestException('Período de no máximo 2 meses por vez.')
    const input: PlanInput = {
      from: d.from!,
      to: d.to!,
      perWeek: Math.min(14, Math.max(1, Math.round(Number(d.perWeek) || 3))),
      themes: (d.themes ?? '').slice(0, 800),
      networks: networksOf(d.accountIds ?? [], await this.accounts(user.tenantId)),
      formats: (d.formats ?? []).filter((f): f is PostFormat => (FORMATS as readonly string[]).includes(f)),
      times: (d.times ?? []).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0, 6),
    }
    if (!input.networks.length) input.networks = ['instagram', 'facebook']
    if (!input.formats.length) input.formats = ['FEED', 'STORIES']
    // Com base no que deu resultado: a análise dos posts dos últimos 90 dias vai junto no pedido.
    const results = await this.results(user.tenantId)
    input.results = results.text
    const raw = await this.ai.complete(user.tenantId, await this.system(user.tenantId), planPrompt(input), 8000)
    const items = parsePlan(raw, input)
    if (!items.length) throw new BadRequestException('A IA não devolveu um calendário válido. Tente de novo (ou diminua o período).')
    return { items, basedOn: results.findings }
  }

  /** Cria os rascunhos do calendário sugerido (sem mídia: escolha as imagens em cada um). */
  async createDrafts(user: AuthUser, d: { items: { date: string; time: string; format: string; title: string; caption: string; imageIdea?: string }[]; accountIds: string[] }, ctx: RequestCtx) {
    this.assertCan(user, 'create')
    const list = (d.items ?? []).slice(0, 40)
    let n = 0
    for (const it of list) {
      const at = Date.parse(`${it.date}T${it.time}:00-03:00`)
      const c = await this.clean(user.tenantId, { title: it.title, caption: it.caption, format: it.format, accountIds: d.accountIds, scheduledAt: Number.isFinite(at) ? new Date(at).toISOString() : null })
      await this.prisma.socialPost.create({ data: { tenantId: user.tenantId, ...c, reviewNote: it.imageIdea ? `Ideia de imagem: ${it.imageIdea.slice(0, 400)}` : null, publicToken: randomBytes(24).toString('base64url'), createdById: user.id, createdByName: user.name.slice(0, 120) } })
      n++
    }
    await this.audit.byUser(user, ctx, 'postagens.calendario_ia', 'social_post', undefined, { rascunhos: n })
    return { ok: true, created: n, message: `${n} rascunho(s) criado(s) no calendário. Escolha a imagem de cada um e mande para aprovação.` }
  }

  /** Imagem com a IA gratuita (volta para a tela, que enquadra, converte em JPEG e guarda na biblioteca). */
  async aiImage(user: AuthUser, d: { idea?: string; format?: string }) {
    this.assertCan(user, 'create')
    const idea = (d.idea ?? '').trim().slice(0, 600)
    if (idea.length < 5) throw new BadRequestException('Descreva a imagem (ex.: equipe entregando um pedido ao cliente, foto realista).')
    const format = (FORMATS as readonly string[]).includes(d.format ?? '') ? (d.format as PostFormat) : 'FEED'
    return this.ai.image(user.tenantId, imagePrompt(idea, format), format === 'FEED' ? '1:1' : '9:16')
  }
}
