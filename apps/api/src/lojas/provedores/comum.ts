/**
 * Ajudas comuns aos adaptadores de loja (só leitura): chamada GET com nova tentativa no limite de requisições (429),
 * leitura de JSON, cabeçalhos sem diferença de maiúsculas e datas no horário de Brasília.
 */
import type { LojaCtx } from './tipos'

export interface HttpResult {
  status: number
  body: string
  headers: Record<string, string>
}

/** Cabeçalho da resposta sem diferença de maiúsculas/minúsculas. */
export function header(h: Record<string, string> | null | undefined, name: string): string | null {
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(h ?? {})) if (k.toLowerCase() === want) return v
  return null
}

export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * GET com até 3 novas tentativas quando a plataforma responde 429 (limite de requisições), esperando um pouco mais a
 * cada vez. Depois de cada chamada espera `pause` ms (ritmo pedido pela plataforma).
 */
export async function getWithRetry(ctx: LojaCtx, url: string, headers: Record<string, string>, pause: number): Promise<HttpResult> {
  let r = await ctx.request(url, { method: 'GET', headers })
  for (let i = 1; r.status === 429 && i <= 3; i++) {
    await ctx.sleep(pause * 4 * i)
    r = await ctx.request(url, { method: 'GET', headers })
  }
  if (pause > 0) await ctx.sleep(pause)
  return r
}

/** Mensagem curta de erro da plataforma (sem repetir o corpo inteiro). */
export function httpError(platform: string, r: HttpResult): Error {
  const j = parseJson(r.body) as Record<string, unknown> | null
  const raw = j && typeof j === 'object' ? (j.description ?? j.message ?? j.error ?? j.causes ?? j.name) : null
  const detail = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''
  if (r.status === 401 || r.status === 403) return new Error(`${platform}: acesso negado (${r.status}). Confira as chaves ou conecte de novo.${detail ? ` ${detail.slice(0, 160)}` : ''}`)
  if (r.status === 402) return new Error(`${platform}: a loja está com o acesso à API suspenso por falta de pagamento (402).`)
  if (r.status === 429) return new Error(`${platform}: limite de requisições atingido (429). Tente mais tarde.`)
  return new Error(`${platform}: erro ${r.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`)
}

/** Data e hora no horário de Brasília (UTC-3, sem horário de verão desde 2019): "AAAA-MM-DDThh:mm:ss". */
export function brDateTime(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19)
}

/** Só a data no horário de Brasília: "AAAA-MM-DD". */
export function brDate(d: Date): string {
  return brDateTime(d).slice(0, 10)
}

/** Data de `years` anos atrás. */
export function yearsAgo(years: number, now = new Date()): Date {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() - years)
  return d
}

export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000)
}

/** Tira o prefixo da plataforma do id externo ("tray:123" → "123"). */
export function rawId(externalId: string): string {
  const i = externalId.indexOf(':')
  return i >= 0 ? externalId.slice(i + 1) : externalId
}

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
