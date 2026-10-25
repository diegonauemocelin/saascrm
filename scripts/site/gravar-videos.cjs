// Grava os vídeos de demonstração do site (apps/site/video) a partir das empresas criadas por
// apps/api/scripts/demo-segmentos.ts, com o sistema rodando localmente (API + Vite) e *.saas.test apontando para 127.0.0.1.
//   node scripts/site/gravar-videos.cjs /pasta/de/saida
// Depois, converta cada .webm para MP4 (H.264) e gere a capa (ver docs/SITE.md).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
const S = process.argv[2] || './gravacoes'
require('fs').mkdirSync(S + '/shots2', { recursive: true })
const HIDE = '[data-sonner-toaster]{display:none!important} vite-error-overlay{display:none!important}'
const size = { width: 1280, height: 760 }
const SEG = [
  { slug: 'autopecas', email: 'roberta@autopecas.demo', a: 'Carlos Henrique', b: 'Oficina do Zé', msg: 'Carlos, segue o orçamento das pastilhas e dos discos. Posso separar para retirada hoje?', post: 'Revisão antes da viagem' },
  { slug: 'vitrinemoda', email: 'carolina@vitrinemoda.demo', a: 'Bruna Carvalho', b: 'Letícia Moraes', msg: 'Bruna, separei o vestido no M e no G. Te espero amanhã! 💕', post: 'Nova coleção de verão' },
  { slug: 'smashpadel', email: 'diego@smashpadel.demo', a: 'Arena Padel Club', b: 'Loja Ponto do Padel', msg: 'Recebi o logo! Segue o modelo da camiseta para a aprovação de vocês.', post: 'Nova linha dry-fit' },
]
;(async () => {
  const b = await chromium.launch({ args: ['--host-resolver-rules=MAP *.saas.test 127.0.0.1', '--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } })
  for (const s of SEG) {
    const BASE = `http://${s.slug}.${process.env.DEMO_DOMAIN || 'saas.test:5173'}`
    const login = await b.newContext({ viewport: size, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
    const lp = await login.newPage()
    await lp.goto(BASE + '/login'); await lp.waitForSelector('input[type=email]'); await lp.waitForTimeout(1500)
    await lp.fill('input[type=email]', s.email); await lp.fill('input[type=password]', 'Demo-Segmentos-2026!'); await lp.click('button[type=submit]'); await lp.waitForTimeout(3000)
    if (lp.url().includes('/login')) throw new Error('login falhou ' + s.slug)
    const state = await login.storageState(); await login.close()
    const clip = async (name, path, act) => {
      const ctx = await b.newContext({ viewport: size, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', storageState: state, recordVideo: { dir: `${S}/videos2/${s.slug}-${name}`, size } })
      const p = await ctx.newPage()
      await p.goto(BASE + path); await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(2500)
      await p.screenshot({ path: `${S}/shots2/${s.slug}-${name}.png` })
      await act(p); await p.waitForTimeout(800); await ctx.close()
    }
    const wheel = async (p, n, dy) => { await p.mouse.move(760, 500); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(380) } }
    await clip('chat', '/chat', async (p) => {
      await p.click(`text=${s.a}`); await p.waitForTimeout(1500)
      await p.click('textarea'); for (const ch of s.msg) { await p.keyboard.type(ch); await p.waitForTimeout(50) }
      await p.waitForTimeout(1200); await p.click(`text=${s.b}`); await p.waitForTimeout(1800)
    })
    await clip('pre-vendas', '/pre-vendas', async (p) => { await wheel(p, 5, 140); await p.mouse.wheel(0, -900); await p.waitForTimeout(500); await p.click('text=Dashboard'); await p.waitForTimeout(2500); await wheel(p, 5, 160) })
    await clip('postagens', '/postagens', async (p) => { await p.waitForTimeout(600); await p.locator(`text=${s.post}`).first().click(); await p.waitForTimeout(2600); await p.keyboard.press('Escape'); await p.waitForTimeout(700) })
    await clip('leads', '/leads', async (p) => { await wheel(p, 6, 150) })
    await clip('dashboard', '/whatsapp/dashboard', async (p) => { await wheel(p, 6, 160) })
    console.log('ok', s.slug)
  }
  await b.close()
})().catch((e) => { console.error('FALHOU', e.message); process.exit(1) })
