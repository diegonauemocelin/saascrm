import type { ErpCtx } from './tipos'

/** Tokens OAuth guardados nos valores da integração (criptografados pelo serviço). */
export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/** Margem antes do vencimento para renovar o token de acesso. */
const RENEW_MS = 5 * 60_000

export function readTokens(values: Record<string, string>): OAuthTokens | null {
  if (!values.accessToken || !values.refreshToken) return null
  return { accessToken: values.accessToken, refreshToken: values.refreshToken, expiresAt: Number(values.expiresAt) || 0 }
}

/** Resposta do endpoint de token (access_token, refresh_token, expires_in em segundos). */
export function tokensFrom(body: string, now = Date.now()): OAuthTokens {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new Error('Resposta inválida do servidor de autorização.')
  }
  const access = typeof j.access_token === 'string' ? j.access_token : ''
  const refresh = typeof j.refresh_token === 'string' ? j.refresh_token : ''
  if (!access || !refresh) throw new Error('A autorização não devolveu os tokens. Clique em Conectar de novo.')
  const expires = Number(j.expires_in)
  return { accessToken: access, refreshToken: refresh, expiresAt: now + (Number.isFinite(expires) && expires > 0 ? expires * 1000 : 3_600_000) }
}

export async function saveTokens(ctx: ErpCtx, t: OAuthTokens) {
  await ctx.save({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: String(t.expiresAt) })
}

/** Token de acesso válido: renova com o refresh token quando está para vencer. */
export async function accessToken(ctx: ErpCtx, name: string, refresh: (refreshToken: string) => Promise<string>, now = Date.now()) {
  const t = readTokens(ctx.values)
  if (!t) throw new Error(`Falta autorizar o acesso ao ${name}: clique em Conectar.`)
  if (t.expiresAt - RENEW_MS > now) return t.accessToken
  let body: string
  try {
    body = await refresh(t.refreshToken)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 400 || status === 401) throw new Error(`A autorização do ${name} venceu ou foi revogada. Clique em Conectar de novo.`)
    throw e
  }
  const next = tokensFrom(body, now)
  await saveTokens(ctx, next)
  return next.accessToken
}

export const formBody = (o: Record<string, string>) => new URLSearchParams(o).toString()
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
