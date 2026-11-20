import { describe, expect, it } from 'vitest'
import { pickPrivacy, TikTokClient, tiktokAuthorizeUrl, TT_SCOPES } from '../src/postagens/tiktok'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const OK = { code: 'ok', message: '' }

describe('TikTok (login do app da plataforma)', () => {
  it('endereço do login com as permissões', () => {
    const u = new URL(tiktokAuthorizeUrl('key123', 'https://painel/tiktok/retorno', 'a.b'))
    expect(u.searchParams.get('client_key')).toBe('key123')
    expect(u.searchParams.get('scope')).toBe(TT_SCOPES.join(','))
  })

  it('privacidade: pública quando a conta permite; senão a mais aberta', () => {
    expect(pickPrivacy(['SELF_ONLY', 'PUBLIC_TO_EVERYONE'])).toBe('PUBLIC_TO_EVERYONE')
    expect(pickPrivacy(['SELF_ONLY'])).toBe('SELF_ONLY')
    expect(pickPrivacy([])).toBe('SELF_ONLY')
  })

  it('conecta e lê a conta', async () => {
    const fetcher = async (url: string | URL | Request) => {
      const s = String(url)
      if (s.includes('/oauth/token/')) return json({ access_token: 'A', refresh_token: 'R', refresh_expires_in: 100 })
      if (s.includes('/user/info/')) return json({ data: { user: { open_id: 'open-id-1234567', display_name: 'Loja', follower_count: 50, likes_count: 9, video_count: 2 } }, error: OK })
      return json({ error: { code: 'x', message: 'inesperado' } }, 400)
    }
    const r = await new TikTokClient(fetcher as typeof fetch).connect({ clientKey: 'k', secret: 's' }, 'C', 'https://r')
    expect(r).toMatchObject({ refresh: 'R', openId: 'open-id-1234567', name: 'Loja', followers: 50, videos: 2 })
  })

  it('publica: confere a conta, envia o arquivo e espera o TikTok', async () => {
    const seen: string[] = []
    let polls = 0
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      const s = String(url)
      seen.push(`${init?.method} ${s}`)
      if (s.includes('creator_info')) return json({ data: { privacy_level_options: ['SELF_ONLY'] }, error: OK })
      if (s.includes('/video/init/')) {
        expect(JSON.parse(String(init?.body)).post_info.privacy_level).toBe('SELF_ONLY')
        return json({ data: { publish_id: 'v_pub_1', upload_url: 'https://upload.tiktok/x' }, error: OK })
      }
      if (s === 'https://upload.tiktok/x') return new Response(null, { status: 201 })
      if (s.includes('status/fetch')) return json({ data: polls++ ? { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] } : { status: 'PROCESSING_UPLOAD' }, error: OK })
      return json({ error: { code: 'x' } }, 400)
    }
    const r = await new TikTokClient(fetcher as typeof fetch, 1).publish('A', { caption: 'Legenda', bytes: Buffer.from('video') })
    expect(r.id).toBe('7123')
    expect(seen.filter((x) => x.includes('status/fetch'))).toHaveLength(2)
  })

  it('erro do TikTok vira mensagem clara', async () => {
    const fetcher = async () => json({ error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x' } })
    await expect(new TikTokClient(fetcher as typeof fetch).publish('A', { caption: '', bytes: Buffer.from('v') })).rejects.toThrow(/ainda não foi aprovado/)
  })
})
