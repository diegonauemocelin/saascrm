import { describe, expect, it } from 'vitest'
import { videoMeta, YouTubeClient, youtubeAuthorizeUrl, YT_SCOPES } from '../src/postagens/youtube'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const CH = 'UC1234567890abcdefghijkl'

describe('YouTube (login do Google da plataforma)', () => {
  it('endereço do login pede acesso offline e as permissões do YouTube', () => {
    const u = new URL(youtubeAuthorizeUrl('cid.apps.googleusercontent.com', 'https://painel/youtube/retorno', 'a.b'))
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('scope')).toBe(YT_SCOPES.join(' '))
    expect(u.searchParams.get('state')).toBe('a.b')
  })

  it('título do Shorts leva #Shorts e respeita 100 caracteres', () => {
    expect(videoMeta({ title: 'Filtro novo', caption: 'Legenda', shorts: true })).toEqual({ title: 'Filtro novo #Shorts', description: 'Legenda' })
    expect(videoMeta({ title: '', caption: 'Primeira linha\nresto', shorts: false }).title).toBe('Primeira linha')
    expect(videoMeta({ title: 'x'.repeat(120), caption: '', shorts: true }).title.length).toBeLessThanOrEqual(100)
    expect(videoMeta({ title: 'Já tem #shorts', caption: '', shorts: true }).title).toBe('Já tem #shorts')
  })

  it('conecta: troca o code e lê o canal', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const s = String(url)
      if (s.includes('oauth2.googleapis.com/token')) return json({ access_token: 'A', refresh_token: 'R' })
      if (s.includes('/channels')) return json({ items: [{ id: CH, snippet: { title: 'Canal' }, statistics: { subscriberCount: '10', viewCount: '500', videoCount: '3' } }] })
      return json({ error: { message: 'x' } }, 400)
    }
    const r = await new YouTubeClient(fetcher as typeof fetch).connect({ clientId: 'c', secret: 's' }, 'CODE', 'https://r')
    expect(r).toMatchObject({ refresh: 'R', channelId: CH, title: 'Canal', subscribers: 10, views: 500, videos: 3 })
  })

  it('sem canal na conta avisa; acesso retirado vira mensagem clara', async () => {
    const noChannel = async (url: string | URL | Request) => (String(url).includes('/channels') ? json({ items: [] }) : json({ access_token: 'A', refresh_token: 'R' }))
    await expect(new YouTubeClient(noChannel as typeof fetch).connect({ clientId: 'c', secret: 's' }, 'C', 'https://r')).rejects.toThrow(/não tem canal/)
    const revoked = async () => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)
    await expect(new YouTubeClient(revoked as typeof fetch).access({ clientId: 'c', secret: 's' }, 'R')).rejects.toThrow(/conecte o YouTube de novo/)
  })

  it('envia o vídeo em duas etapas e devolve o link', async () => {
    const seen: string[] = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(`${init?.method} ${String(url)}`)
      if (String(url).includes('uploadType=resumable')) return json({}, 200, { Location: 'https://upload.example/sessao' })
      if (String(url) === 'https://upload.example/sessao') return json({ id: 'vid123' })
      return json({ error: { message: 'x' } }, 400)
    }
    const r = await new YouTubeClient(fetcher as typeof fetch).upload('A', { title: 't', description: 'd', bytes: Buffer.from('abc'), mime: 'video/mp4' })
    expect(r.id).toBe('vid123')
    expect(r.permalink).toBe('https://www.youtube.com/watch?v=vid123')
    expect(seen[1]).toBe('PUT https://upload.example/sessao')
  })
})
