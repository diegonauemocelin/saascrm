import { describe, expect, it } from 'vitest'
import { FacebookLogin, facebookAuthorizeUrl, FB_SCOPES } from '../src/postagens/facebook-login'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('login do Facebook (app da plataforma)', () => {
  it('monta o endereço do login com as permissões das páginas', () => {
    const u = new URL(facebookAuthorizeUrl('123456', 'https://painel/facebook/retorno', 'abc.def'))
    expect(u.searchParams.get('client_id')).toBe('123456')
    expect(u.searchParams.get('redirect_uri')).toBe('https://painel/facebook/retorno')
    expect(u.searchParams.get('scope')).toBe(FB_SCOPES.join(','))
    expect(u.searchParams.get('state')).toBe('abc.def')
  })

  it('troca o code, pega o acesso longo e lê as páginas com o acesso de cada uma', async () => {
    const calls: string[] = []
    const fetcher = async (url: string | URL | Request) => {
      const s = String(url)
      calls.push(s)
      if (s.includes('fb_exchange_token')) return json({ access_token: 'LONG' })
      if (s.includes('oauth/access_token')) return json({ access_token: 'SHORT' })
      if (s.includes('me/accounts')) return json({ data: [{ id: '111111', name: 'Loja', access_token: 'P1' }, { id: 'x', name: 'Ruim', access_token: 'P2' }, { id: '222222', name: 'Sem token' }] })
      return json({ error: { message: 'inesperado' } }, 400)
    }
    const pages = await new FacebookLogin(fetcher as typeof fetch).connect({ appId: '1', secret: 's' }, 'CODE', 'https://r')
    expect(pages).toEqual([{ id: '111111', name: 'Loja', token: 'P1' }])
    expect(calls[2]).toContain('access_token=LONG')
  })

  it('sem página liberada avisa', async () => {
    const fetcher = async (url: string | URL | Request) => (String(url).includes('me/accounts') ? json({ data: [] }) : json({ access_token: 'T' }))
    await expect(new FacebookLogin(fetcher as typeof fetch).connect({ appId: '1', secret: 's' }, 'C', 'https://r')).rejects.toThrow(/Nenhuma página/)
  })

  it('erro de endereço de retorno vira mensagem clara', async () => {
    const fetcher = async () => json({ error: { message: 'Invalid redirect_uri' } }, 400)
    await expect(new FacebookLogin(fetcher as typeof fetch).connect({ appId: '1', secret: 's' }, 'C', 'https://r')).rejects.toThrow(/endereço de retorno/)
  })
})
