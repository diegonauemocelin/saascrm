/**
 * TikTok pelo login do TikTok (app da plataforma no TikTok for Developers): a pessoa entra na conta e autoriza; o CRM
 * guarda o acesso de renovação (1 ano). Publica vídeos (Content Posting API, envio do arquivo) e lê os números da conta
 * e dos vídeos. Cliente com fetch injetável, testado em test/tiktok.spec.ts.
 *
 * Enquanto o app da plataforma não passar pela auditoria do TikTok, os vídeos só podem sair como privados (SELF_ONLY).
 */
import type { Fetcher } from './meta'

export const TT_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/'
export const TT_API = 'https://open.tiktokapis.com/v2'
export const TT_SCOPES = ['user.info.basic', 'user.info.stats', 'video.publish', 'video.list']
export const TT_CALLBACK_PATH = '/postagens/tiktok/retorno'
export const TT_PLATFORM_CALLBACK_PATH = '/tiktok/retorno'
export const TT_APP_KEY = 'postagens_tt_app'
export const TT_TOKENS_KEY = 'postagens_tt_tokens'
export const TT_OAUTH_KEY = 'postagens_tt_oauth'
/** open_id da conta no TikTok. */
export const TT_OPEN_ID = /^[\w.-]{10,100}$/

export interface TtApp {
  clientKey: string
  secretEnc: string | null
}
export interface TtToken {
  refreshEnc: string
  name: string
  issuedAt: string
  /** O acesso de renovação vence em 1 ano; renova a cada uso. */
  refreshExpiresAt: string
  connectedBy: string
  lastError: string | null
}

export class TikTokError extends Error {}

export function tiktokAuthorizeUrl(clientKey: string, redirectUri: string, state: string) {
  const url = new URL(TT_AUTH_URL)
  url.search = new URLSearchParams({ client_key: clientKey, scope: TT_SCOPES.join(','), response_type: 'code', redirect_uri: redirectUri, state }).toString()
  return url.toString()
}

/** Privacidade da postagem: pública se a conta permitir (app auditado); senão a mais aberta que ela aceitar. */
export function pickPrivacy(options: string[]) {
  for (const p of ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']) if (options.includes(p)) return p
  return 'SELF_ONLY'
}

function ttMessage(status: number, body: Record<string, unknown> | null) {
  const e = body?.error as { code?: string; message?: string } | string | undefined
  const code = typeof e === 'object' ? e?.code : e
  const msg = typeof e === 'object' ? e?.message || code : `${String(e ?? '')}${body?.error_description ? `: ${String(body.error_description)}` : ''}`
  if (/redirect_uri/i.test(String(msg))) return `O endereço de retorno não está cadastrado no app do TikTok (Login Kit › Redirect URI). (${msg})`
  if (code === 'invalid_grant' || /refresh_token/i.test(String(msg))) return 'O acesso ao TikTok foi retirado ou venceu: conecte o TikTok de novo na aba Contas.'
  if (code === 'spam_risk_too_many_posts') return 'O TikTok limitou as postagens desta conta por hoje.'
  if (code === 'unaudited_client_can_only_post_to_private_accounts') return 'O app da plataforma ainda não foi aprovado pelo TikTok: só dá para postar em conta privada.'
  return String(msg || `O TikTok respondeu ${status}.`).slice(0, 300)
}

export class TikTokClient {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    /** Espera entre as consultas da publicação (menor nos testes). */
    private readonly pollMs = 5_000,
  ) {}

  private async json(url: string, init?: RequestInit) {
    const res = await this.fetcher(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000), redirect: 'error' })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const err = body?.error as { code?: string } | string | undefined
    const failed = typeof err === 'object' ? !!err?.code && err.code !== 'ok' : !!err
    if (!res.ok || !body || failed) throw new TikTokError(ttMessage(res.status, body))
    return body
  }

  private token(app: { clientKey: string; secret: string }, params: Record<string, string>) {
    return this.json(`${TT_API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: app.clientKey, client_secret: app.secret, ...params }).toString(),
    })
  }

  /** Troca o code pelos acessos e lê a conta. */
  async connect(app: { clientKey: string; secret: string }, code: string, redirectUri: string) {
    const t = await this.token(app, { code: code.trim(), grant_type: 'authorization_code', redirect_uri: redirectUri })
    const access = String(t.access_token ?? '')
    const refresh = String(t.refresh_token ?? '')
    if (!access || !refresh) throw new TikTokError('O TikTok não devolveu o acesso. Conecte de novo e aceite todas as permissões.')
    const user = await this.user(access)
    return { refresh, refreshExpiresAt: new Date(Date.now() + (Number(t.refresh_expires_in) || 365 * 86_400) * 1000).toISOString(), ...user }
  }

  /** Acesso de 24 h a partir do de renovação (o TikTok devolve um de renovação novo). */
  async access(app: { clientKey: string; secret: string }, refresh: string) {
    const t = await this.token(app, { grant_type: 'refresh_token', refresh_token: refresh })
    const access = String(t.access_token ?? '')
    if (!access) throw new TikTokError('O TikTok não renovou o acesso.')
    return { access, refresh: String(t.refresh_token ?? refresh), refreshExpiresAt: new Date(Date.now() + (Number(t.refresh_expires_in) || 365 * 86_400) * 1000).toISOString() }
  }

  async user(access: string) {
    const b = await this.json(`${TT_API}/user/info/?${new URLSearchParams({ fields: 'open_id,display_name,follower_count,likes_count,video_count' })}`, { headers: { Authorization: `Bearer ${access}` } })
    const u = ((b.data as { user?: Record<string, unknown> } | undefined)?.user ?? {}) as Record<string, unknown>
    const openId = String(u.open_id ?? '')
    if (!TT_OPEN_ID.test(openId)) throw new TikTokError('O TikTok não informou a conta.')
    return { openId, name: String(u.display_name ?? '').trim() || 'Conta do TikTok', followers: Number(u.follower_count ?? 0), likes: Number(u.likes_count ?? 0), videos: Number(u.video_count ?? 0) }
  }

  /** Publica o vídeo: confere o que a conta permite, abre o envio, manda o arquivo e espera o TikTok processar. */
  async publish(access: string, v: { caption: string; bytes: Buffer }) {
    const auth = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8' }
    const info = await this.json(`${TT_API}/post/publish/creator_info/query/`, { method: 'POST', headers: auth, body: '{}' })
    const d = (info.data ?? {}) as { privacy_level_options?: string[]; comment_disabled?: boolean; max_video_post_duration_sec?: number }
    const size = v.bytes.length
    const init = await this.json(`${TT_API}/post/publish/video/init/`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        post_info: { title: v.caption.slice(0, 2200), privacy_level: pickPrivacy(d.privacy_level_options ?? []), disable_comment: !!d.comment_disabled, disable_duet: false, disable_stitch: false },
        // Um pedaço só: os vídeos da biblioteca têm até 64 MB.
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    })
    const data = (init.data ?? {}) as { publish_id?: string; upload_url?: string }
    if (!data.publish_id || !data.upload_url?.startsWith('https://')) throw new TikTokError('O TikTok não abriu o envio do vídeo.')
    const up = await this.fetcher(data.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` }, body: new Uint8Array(v.bytes), signal: AbortSignal.timeout(15 * 60_000), redirect: 'error' })
    if (!up.ok) throw new TikTokError(`O TikTok recusou o arquivo do vídeo (${up.status}).`)
    // Espera o TikTok publicar (alguns minutos): sai com o ID do vídeo quando ele aparece.
    for (let i = 0; i < 36; i++) {
      const s = await this.json(`${TT_API}/post/publish/status/fetch/`, { method: 'POST', headers: auth, body: JSON.stringify({ publish_id: data.publish_id }) })
      const st = (s.data ?? {}) as { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }
      if (st.status === 'FAILED') throw new TikTokError(`O TikTok não publicou o vídeo (${st.fail_reason ?? 'sem motivo'}).`)
      if (st.status === 'PUBLISH_COMPLETE') {
        const id = st.publicaly_available_post_id?.[0]
        return { id: id ? String(id) : data.publish_id, permalink: null, at: new Date().toISOString() }
      }
      await new Promise((r) => setTimeout(r, this.pollMs))
    }
    // Ainda processando: fica com o ID do envio (as métricas tentam de novo depois).
    return { id: data.publish_id, permalink: null, at: new Date().toISOString() }
  }

  /** Visualizações, curtidas, comentários e compartilhamentos de um vídeo publicado. */
  async videoStats(access: string, videoId: string) {
    const b = await this.json(`${TT_API}/video/query/?${new URLSearchParams({ fields: 'id,view_count,like_count,comment_count,share_count,share_url' })}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    })
    const v = ((b.data as { videos?: Record<string, unknown>[] } | undefined)?.videos ?? [])[0]
    if (!v) throw new TikTokError('Vídeo ainda não disponível no TikTok (processando, privado ou apagado).')
    return { views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0), comments: Number(v.comment_count ?? 0), shares: Number(v.share_count ?? 0), url: (v.share_url as string | undefined) ?? null }
  }
}
