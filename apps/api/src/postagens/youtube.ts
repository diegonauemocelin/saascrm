/**
 * YouTube pelo login do Google (app da plataforma no Google Cloud): a pessoa entra com a conta Google do canal e
 * autoriza; o CRM guarda só o acesso de renovação. Publica vídeos e Shorts (vídeo vertical curto, com #Shorts) e lê os
 * números do canal e de cada vídeo. Funções puras e cliente com fetch injetável, testados em test/youtube.spec.ts.
 */
import type { Fetcher } from './meta'

export const YT_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const YT_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const YT_API = 'https://www.googleapis.com/youtube/v3'
export const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'
/** Enviar vídeos e ler o canal e as estatísticas. */
export const YT_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']
export const YT_CALLBACK_PATH = '/postagens/youtube/retorno'
export const YT_PLATFORM_CALLBACK_PATH = '/youtube/retorno'
export const YT_APP_KEY = 'postagens_yt_app'
export const YT_TOKENS_KEY = 'postagens_yt_tokens'
export const YT_OAUTH_KEY = 'postagens_yt_oauth'
/** ID do canal: "UC" + 22 caracteres. */
export const YT_CHANNEL_ID = /^UC[\w-]{22}$/

export interface YtApp {
  clientId: string
  secretEnc: string | null
}
export interface YtToken {
  refreshEnc: string
  title: string
  issuedAt: string
  connectedBy: string
  lastError: string | null
}

export class YouTubeError extends Error {}

export function youtubeAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL(YT_AUTH_URL)
  // offline + consent: o Google devolve o acesso de renovação (refresh_token) mesmo se já autorizou antes
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: YT_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', state }).toString()
  return url.toString()
}

/** Título e descrição do vídeo: Shorts leva #Shorts; o YouTube aceita título até 100 caracteres e descrição até 5.000. */
export function videoMeta(p: { title: string; caption: string; shorts: boolean }) {
  const base = (p.title.trim() || p.caption.trim().split('\n')[0] || 'Vídeo').replace(/[<>]/g, '')
  const title = p.shorts && !/#shorts/i.test(base) ? `${base.slice(0, 91).trim()} #Shorts` : base.slice(0, 100)
  const description = p.caption.replace(/[<>]/g, '').slice(0, 5000)
  return { title, description }
}

function ytMessage(status: number, body: Record<string, unknown> | null) {
  const e = body?.error as { message?: string; errors?: { reason?: string }[] } | string | undefined
  const msg = typeof e === 'string' ? `${e}${body?.error_description ? `: ${String(body.error_description)}` : ''}` : (e?.message ?? `O YouTube respondeu ${status}.`)
  const reason = typeof e === 'object' ? e?.errors?.[0]?.reason : undefined
  if (/redirect_uri/i.test(msg)) return `O endereço de retorno não está cadastrado no app do Google (Credenciais › Cliente OAuth). (${msg})`
  if (/invalid_grant/i.test(msg)) return 'O acesso ao canal foi retirado ou venceu: conecte o YouTube de novo na aba Contas.'
  if (reason === 'quotaExceeded') return 'A cota diária da API do YouTube acabou: tente de novo amanhã.'
  if (reason === 'uploadLimitExceeded') return 'O canal atingiu o limite de envios do dia no YouTube.'
  return msg.slice(0, 300)
}

export class YouTubeClient {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async json(url: string, init?: RequestInit) {
    const res = await this.fetcher(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000), redirect: 'error' })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !body || body.error) throw new YouTubeError(ytMessage(res.status, body))
    return { res, body }
  }

  /** Troca o code pelos acessos e lê o canal (ID e nome). */
  async connect(app: { clientId: string; secret: string }, code: string, redirectUri: string) {
    const { body: t } = await this.json(YT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: app.clientId, client_secret: app.secret, code: code.trim(), grant_type: 'authorization_code', redirect_uri: redirectUri }).toString(),
    })
    const refresh = String(t.refresh_token ?? '')
    const access = String(t.access_token ?? '')
    if (!refresh || !access) throw new YouTubeError('O Google não devolveu o acesso ao canal. Conecte de novo e aceite todas as permissões.')
    const channel = await this.channel(access)
    return { refresh, ...channel }
  }

  /** Acesso de 1 hora a partir do de renovação. */
  async access(app: { clientId: string; secret: string }, refresh: string) {
    const { body } = await this.json(YT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: app.clientId, client_secret: app.secret, refresh_token: refresh, grant_type: 'refresh_token' }).toString(),
    })
    const access = String(body.access_token ?? '')
    if (!access) throw new YouTubeError('O Google não renovou o acesso ao canal.')
    return access
  }

  /** Canal da conta autorizada, com inscritos, visualizações e vídeos. */
  async channel(access: string) {
    const { body } = await this.json(`${YT_API}/channels?${new URLSearchParams({ part: 'snippet,statistics', mine: 'true' })}`, { headers: { Authorization: `Bearer ${access}` } })
    const c = (body.items as { id?: string; snippet?: { title?: string }; statistics?: Record<string, string> }[] | undefined)?.[0]
    if (!c?.id || !YT_CHANNEL_ID.test(c.id)) throw new YouTubeError('Esta conta Google não tem canal no YouTube. Crie o canal e conecte de novo.')
    const s = c.statistics ?? {}
    return { channelId: c.id, title: c.snippet?.title?.trim() || 'Canal do YouTube', subscribers: s.hiddenSubscriberCount ? null : Number(s.subscriberCount ?? 0), views: Number(s.viewCount ?? 0), videos: Number(s.videoCount ?? 0) }
  }

  /** Visualizações, curtidas e comentários de um vídeo. */
  async videoStats(access: string, videoId: string) {
    const { body } = await this.json(`${YT_API}/videos?${new URLSearchParams({ part: 'statistics', id: videoId })}`, { headers: { Authorization: `Bearer ${access}` } })
    const s = (body.items as { statistics?: Record<string, string> }[] | undefined)?.[0]?.statistics
    if (!s) throw new YouTubeError('Vídeo não encontrado no YouTube (apagado ou privado).')
    return { views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0) }
  }

  /** Envia o vídeo (envio retomável do YouTube): primeiro os dados, depois o arquivo. Público. */
  async upload(access: string, v: { title: string; description: string; bytes: Buffer; mime: string }) {
    const meta = { snippet: { title: v.title, description: v.description, categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }
    const start = await this.fetcher(`${YT_UPLOAD}?${new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' })}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': v.mime, 'X-Upload-Content-Length': String(v.bytes.length) },
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    })
    if (!start.ok) throw new YouTubeError(ytMessage(start.status, (await start.json().catch(() => null)) as Record<string, unknown> | null))
    const location = start.headers.get('location')
    if (!location?.startsWith('https://')) throw new YouTubeError('O YouTube não abriu o envio do vídeo.')
    const { body } = await this.json(location, { method: 'PUT', headers: { 'Content-Type': v.mime, 'Content-Length': String(v.bytes.length) }, body: new Uint8Array(v.bytes), signal: AbortSignal.timeout(15 * 60_000) })
    const id = String(body.id ?? '')
    if (!id) throw new YouTubeError('O YouTube não devolveu o vídeo enviado.')
    return { id, permalink: `https://www.youtube.com/watch?v=${id}`, at: new Date().toISOString() }
  }
}
