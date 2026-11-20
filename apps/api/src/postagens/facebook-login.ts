/**
 * Conexão de páginas do Facebook pelo login do Facebook (app da Meta da plataforma). A pessoa entra com o usuário e a
 * senha na tela do Facebook e escolhe as páginas; o CRM recebe só o acesso de cada página (o de página vindo de um
 * acesso de longa duração não vence enquanto a pessoa não tirar a permissão ou trocar a senha). Fetch injetável nos testes.
 */
import { GRAPH } from '../marketing/config'
import type { Fetcher } from './meta'

export const FB_DIALOG_URL = 'https://www.facebook.com/v23.0/dialog/oauth'
/** Só o que a publicação e as métricas das páginas usam. */
export const FB_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'read_insights']
/** Tela do CRM (endereço da empresa) que conclui a conexão. */
export const FB_CALLBACK_PATH = '/postagens/facebook/retorno'
/** Retorno do app da plataforma (um endereço só, no painel), que devolve a pessoa ao endereço da empresa. */
export const FB_PLATFORM_CALLBACK_PATH = '/facebook/retorno'
export const FB_APP_KEY = 'postagens_fb_app'
export const FB_TOKENS_KEY = 'postagens_fb_tokens'
export const FB_OAUTH_KEY = 'postagens_fb_oauth'

export interface FbApp {
  appId: string
  secretEnc: string | null
}
export interface FbPageToken {
  tokenEnc: string
  name: string
  issuedAt: string
  connectedBy: string
  lastError: string | null
}
export interface FbPage {
  id: string
  name: string
  token: string
}

export class FbLoginError extends Error {}

export function facebookAuthorizeUrl(appId: string, redirectUri: string, state: string) {
  const url = new URL(FB_DIALOG_URL)
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code', scope: FB_SCOPES.join(','), auth_type: 'rerequest' }).toString()
  return url.toString()
}

function fbMessage(status: number, body: Record<string, unknown> | null) {
  const e = body?.error as { message?: string } | undefined
  const msg = e?.message ?? `O Facebook respondeu ${status}.`
  if (/redirect_uri/i.test(msg)) return `O endereço de retorno não está cadastrado no app da Meta (Login do Facebook › Configurações). (${msg})`
  if (/client_secret|client_id|app/i.test(msg) && status === 400) return `ID ou chave secreta do app da Meta não conferem. (${msg})`
  return msg.slice(0, 300)
}

export class FacebookLogin {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async get(path: string, params: Record<string, string>) {
    const res = await this.fetcher(`${GRAPH}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !body || body.error) throw new FbLoginError(fbMessage(res.status, body))
    return body
  }

  /** Troca o code pelo acesso de longa duração e lê as páginas que a pessoa liberou, cada uma com o acesso dela. */
  async connect(app: { appId: string; secret: string }, code: string, redirectUri: string): Promise<FbPage[]> {
    const short = await this.get('oauth/access_token', { client_id: app.appId, client_secret: app.secret, redirect_uri: redirectUri, code: code.trim() })
    const shortToken = String(short.access_token ?? '')
    if (!shortToken) throw new FbLoginError('O Facebook não devolveu o acesso. Tente conectar de novo.')
    const long = await this.get('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.secret, fb_exchange_token: shortToken })
    const userToken = String(long.access_token ?? '')
    if (!userToken) throw new FbLoginError('O Facebook não devolveu o acesso de longa duração.')
    const pages: FbPage[] = []
    let after: string | null = null
    for (let i = 0; i < 10; i++) {
      const r = await this.get('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: userToken, ...(after ? { after } : {}) })
      for (const p of (r.data as { id?: string; name?: string; access_token?: string }[] | undefined) ?? []) {
        if (p.id && /^\d{5,25}$/.test(p.id) && p.access_token) pages.push({ id: p.id, name: p.name?.trim() || `Página ${p.id}`, token: p.access_token })
      }
      after = ((r.paging as { cursors?: { after?: string }; next?: string } | undefined)?.next && (r.paging as { cursors?: { after?: string } }).cursors?.after) || null
      if (!after) break
    }
    if (!pages.length) throw new FbLoginError('Nenhuma página liberada. No Facebook, escolha as páginas da empresa ao autorizar (a pessoa precisa ser administradora da página).')
    return pages
  }
}
