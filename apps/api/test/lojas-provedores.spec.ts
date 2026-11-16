import { describe, expect, it } from 'vitest'
import type { LojaCtx } from '../src/lojas/provedores/tipos'
import {
  cartFromNuvemshop,
  customerFromNuvemshop,
  nuvemshop,
  nuvemshopHasNext,
  nuvemshopStatus,
  NUVEMSHOP_USER_AGENT,
  orderFromNuvemshop,
  productsFromNuvemshop,
} from '../src/lojas/provedores/nuvemshop'
import { cartFromTray, customerFromTray, orderFromTray, orderLinesFromTray, productFromTray, tray, trayApiAddress, trayCartRows, trayRange, trayStatus, trayStoreHost } from '../src/lojas/provedores/tray'
import { customerFromLojaIntegrada, liIdFromUri, lojaIntegrada, lojaIntegradaStatus, orderFromLojaIntegrada, orderLinesFromLojaIntegrada, productFromLojaIntegrada } from '../src/lojas/provedores/loja-integrada'

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string }

/** ctx falso: responde pela ordem da fila e guarda as chamadas. */
function fakeCtx(values: Record<string, string>, app: Record<string, string>, replies: { status: number; body: unknown; headers?: Record<string, string> }[]) {
  const calls: Call[] = []
  const saved: Record<string, string>[] = []
  const sleeps: number[] = []
  const ctx: LojaCtx = {
    values: { ...values },
    app,
    async request(url, o) {
      calls.push({ url, ...o })
      const r = replies.shift() ?? { status: 404, body: { code: 404 } }
      return { status: r.status, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body), headers: r.headers ?? {} }
    },
    async save(p) {
      saved.push(p)
    },
    async sleep(ms) {
      sleeps.push(ms)
    },
  }
  return { ctx, calls, saved, sleeps }
}

// ---------------- Nuvemshop (exemplos de tiendanube.github.io/api-documentation, 2025-03) ----------------

const nsCustomer = {
  created_at: '2013-04-07T09:11:51-03:00',
  email: 'john.doe@example.com',
  id: 112,
  identification: '28776255671',
  name: 'Zé Ninguém',
  phone: '392502584',
  billing_city: 'Springfield',
  billing_province: 'Oregon',
  default_address: { city: 'São Paulo', province: 'São Paulo', phone: '11 3749-8000' },
}

const nsOrder = {
  id: 871254203,
  number: 306,
  contact_email: 'buyer@tiendanube.com',
  contact_name: 'Maria Silva',
  contact_phone: '+551533276436',
  contact_identification: '75839566500',
  billing_city: 'Sorocaba',
  billing_province: 'São Paulo',
  total: '5400.00',
  gateway_name: 'Transferencia Bancaria',
  storefront: 'store',
  created_at: '2022-11-15T19:36:59+0000',
  status: 'open',
  payment_status: 'pending',
  payment_details: { method: 'custom', credit_card_company: null, installments: 1 },
  customer: { id: 105799009, name: 'Maria Silva', email: 'buyer@tiendanube.com', identification: '75839566500', phone: '+551533276436', default_address: { city: 'New York', province: 'New York' } },
  products: [
    { id: 1069053829, name: 'Mesa de Roble', price: '6000.00', product_id: 111334785, quantity: '1', variant_id: '426215948', sku: '12389012348124801234890' },
    { id: 3127510877, name: 'PROD B', price: '198.00', quantity: 2, sku: null },
  ],
}

const nsCheckout = {
  id: 411335234,
  abandoned_checkout_url: 'https://nuvemteste.lojavirtualnuvem.com.br/checkout/v3/order/proxy/411335234/d0e589b2ba4fef1a4155dc071c253dfk1j34198b9',
  contact_email: 'teste@teste.com.br',
  contact_name: 'Teste 12',
  contact_phone: '+551335593019',
  contact_identification: '78448385071',
  shipping_city: 'Dores do Rio Preto',
  shipping_province: 'Espirito Santo',
  total: '291.35',
  created_at: '2021-05-12T19:08:06+0000',
  updated_at: '2021-05-13T21:04:00+0000',
  completed_at: null,
  products: [
    {
      id: 516763823,
      name: 'Varinha do Harry Potter (Preto)',
      price: '58.07',
      product_id: 87219151,
      image: { src: 'https://d2r9epyceweg5n.cloudfront.net/stores/001/679/854/products/varinha.jpeg' },
      quantity: 5,
      variant_id: 332977991,
      sku: null,
    },
  ],
}

const nsProduct = {
  id: 1234,
  name: { en: 'Master Ball', es: 'Master Ball', pt: 'Master Ball' },
  images: [{ id: 101, src: 'http://d26lpennugtm8s.cloudfront.net/stores/001/234/products/servine-640-0.jpg', position: 1, product_id: 1234 }],
  brand: null,
  published: true,
  visibility: 'visible',
  variants: [
    { id: 101, promotional_price: '19.00', values: [{ en: 'Small' }], price: '25.00', product_id: 1234, stock_management: true, stock: 5, sku: 'BSG1234A' },
    { id: 112, promotional_price: '19.00', values: [{ en: 'Medium' }], price: '25.00', product_id: 1234, stock_management: false, stock: null, sku: 'BSG1234B' },
  ],
}

describe('Nuvemshop', () => {
  it('cliente: id prefixado, sem CPF, cidade do endereço padrão', () => {
    const c = customerFromNuvemshop(nsCustomer)!
    expect(c).toEqual({
      externalId: 'nuvemshop:112',
      name: 'Zé Ninguém',
      email: 'john.doe@example.com',
      phone: '392502584',
      company: null,
      city: 'São Paulo',
      state: 'São Paulo',
      registeredAt: new Date('2013-04-07T12:11:51Z'),
    })
    expect(JSON.stringify(c)).not.toContain('28776255671')
  })

  it('pedido com itens e grupo da situação', () => {
    const o = orderFromNuvemshop(nsOrder)!
    expect(o.externalId).toBe('nuvemshop:871254203')
    expect(o.code).toBe('306')
    expect(o.customerId).toBe('nuvemshop:105799009')
    expect(o.customer?.email).toBe('buyer@tiendanube.com')
    expect(o.orderedAt.toISOString()).toBe('2022-11-15T19:36:59.000Z')
    expect(o.total).toBe(5400)
    expect(o.statusGroup).toBe('pendente')
    expect(o.payment).toBe('Transferencia Bancaria')
    expect(o.channel).toBe('store')
    expect(o.items).toEqual([
      { sku: '12389012348124801234890', name: 'Mesa de Roble', brand: null, quantity: 1, total: 6000 },
      { sku: null, name: 'PROD B', brand: null, quantity: 2, total: 396 },
    ])
    expect(JSON.stringify(o)).not.toContain('75839566500')
  })

  it('situações da documentação', () => {
    expect(nuvemshopStatus('open', 'paid').group).toBe('pago')
    expect(nuvemshopStatus('closed', 'partially_refunded').group).toBe('pago')
    expect(nuvemshopStatus('open', 'authorized').group).toBe('pendente')
    expect(nuvemshopStatus('open', 'partially_paid').group).toBe('pendente')
    expect(nuvemshopStatus('cancelled', 'paid').group).toBe('cancelado')
    expect(nuvemshopStatus('open', 'voided').group).toBe('cancelado')
    expect(nuvemshopStatus('open', 'refunded').group).toBe('cancelado')
    expect(nuvemshopStatus('open', 'abandoned').group).toBe('cancelado')
    expect(nuvemshopStatus('open', 'algo_novo').group).toBe('outro')
  })

  it('checkout abandonado com link de recuperação', () => {
    const k = cartFromNuvemshop(nsCheckout)!
    expect(k.externalId).toBe('nuvemshop:411335234')
    expect(k.checkoutUrl).toBe(nsCheckout.abandoned_checkout_url)
    expect(k.abandoned).toBe(true)
    expect(k.value).toBe(291.35)
    expect(k.customer).toMatchObject({ externalId: 'nuvemshop:checkout:411335234', name: 'Teste 12', email: 'teste@teste.com.br', phone: '+551335593019', city: 'Dores do Rio Preto' })
    expect(k.items).toEqual([{ code: '332977991', name: 'Varinha do Harry Potter (Preto)', qty: 5, image: nsCheckout.products[0].image.src, url: null }])
    expect(k.lastActivityAt?.toISOString()).toBe('2021-05-13T21:04:00.000Z')
    expect(JSON.stringify(k)).not.toContain('78448385071')
  })

  it('produto: uma linha por variante, promoção, estoque e imagem só https', () => {
    const ps = productsFromNuvemshop(nsProduct)
    expect(ps).toHaveLength(2)
    expect(ps[0]).toEqual({
      externalId: 'nuvemshop:101',
      code: 'BSG1234A',
      name: 'Master Ball - Small',
      brand: null,
      price: 19,
      priceFrom: 25,
      stock: 5,
      image: null,
      url: null,
      active: true,
    })
    expect(ps[1].stock).toBeNull()
    const https = productsFromNuvemshop({ ...nsProduct, images: [{ id: 1, src: 'https://cdn.exemplo.com/a.jpg', position: 1 }], visibility: 'hidden' })
    expect(https[0].image).toBe('https://cdn.exemplo.com/a.jpg')
    expect(https[0].active).toBe(false)
  })

  it('autorização e troca do código', async () => {
    const { ctx, calls, saved } = fakeCtx({}, { appId: '123', clientId: '123', clientSecret: 'abc' }, [
      { status: 200, body: { access_token: '61181d08b7e328d256736hdcb671c3ce50b8af5', token_type: 'bearer', scope: 'read_orders', user_id: '789' } },
    ])
    expect(nuvemshop.authorizeUrl!(ctx, 'https://crm/retorno', 'csrf code')).toBe('https://www.tiendanube.com/apps/123/authorize?state=csrf%20code')
    await nuvemshop.exchange!(ctx, { code: 'xyz', state: 'csrf' }, 'https://crm/retorno')
    expect(calls[0].url).toBe('https://www.tiendanube.com/apps/authorize/token')
    expect(JSON.parse(calls[0].body!)).toEqual({ client_id: '123', client_secret: 'abc', grant_type: 'authorization_code', code: 'xyz' })
    expect(saved[0]).toEqual({ accessToken: '61181d08b7e328d256736hdcb671c3ce50b8af5', storeId: '789' })
  })

  it('paginação pelo Link rel="next" e 404 como fim', async () => {
    const link = '<https://api.tiendanube.com/2025-03/123456/customers?page=2&per_page=200>; rel="next", <https://api.tiendanube.com/2025-03/123456/customers?page=2&per_page=200>; rel="last"'
    const { ctx, calls, sleeps } = fakeCtx({ storeId: '123456', accessToken: 'tok' }, {}, [
      { status: 200, body: [nsCustomer], headers: { Link: link } },
      { status: 404, body: { code: 404, message: 'Not Found' } },
    ])
    const since = new Date('2024-01-01T00:00:00Z')
    const p1 = await nuvemshop.customers(ctx, since, 1)
    expect(p1.more).toBe(true)
    expect(p1.items[0].externalId).toBe('nuvemshop:112')
    const u = new URL(calls[0].url)
    expect(u.origin + u.pathname).toBe('https://api.nuvemshop.com.br/2025-03/123456/customers')
    expect(u.searchParams.get('updated_at_min')).toBe('2024-01-01T00:00:00.000Z')
    expect(u.searchParams.get('per_page')).toBe('200')
    expect(u.searchParams.get('fields')).not.toContain('identification')
    expect(calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'User-Agent': NUVEMSHOP_USER_AGENT })
    const p2 = await nuvemshop.customers(ctx, since, 2)
    expect(p2).toEqual({ items: [], more: false })
    expect(new URL(calls[1].url).searchParams.get('page')).toBe('2')
    expect(sleeps.every((s) => s >= 500)).toBe(true)
    expect(nuvemshopHasNext({ link: '<x?page=50>; rel="last"' }, 200, 200)).toBe(false)
  })
})

// ---------------- Tray (exemplos de developers.tray.com.br) ----------------

const trayOrderList = {
  Order: {
    status: 'A ENVIAR',
    id: '5',
    date: '2020-12-07',
    customer_id: '5',
    point_sale: 'LOJA VIRTUAL',
    payment_form: 'Boleto - Yapay',
    total: '27027.60',
    payment_date: '0000-00-00',
    modified: '2020-12-21 11:21:52',
    has_payment: '0',
    OrderStatus: { id: '1', default: '1', type: 'open', status: 'A ENVIAR' },
    ProductsSold: [{ id: '5' }],
  },
}

const trayComplete = {
  Order: {
    status: 'A ENVIAR',
    id: '1167',
    date: '2025-02-06',
    hour: '09:46:09',
    customer_id: '21',
    total: '825.39',
    payment_method: 'Pix - Vindi',
    point_sale: 'LOJA VIRTUAL',
    has_payment: '1',
    OrderStatus: { id: '1', default: '1', type: 'open', status: 'A ENVIAR' },
    Customer: { id: '21', name: 'Danilo Carlos Ribeiro', cpf: '00474780040', rg: '364787958', phone: '14999999999', cellphone: '18999898989', email: 'danilo.Carlos123@tray.net.br', company_name: '', city: 'Araçatuba', state: 'SP', created: '2024-03-08 13:39:08' },
    ProductsSold: [{ ProductsSold: { product_id: '351', quantity: '1', id: '1425', name: 'tenis azul (Ref. ref351)', original_name: 'tenis azul', price: '900.00', brand: '', reference: 'ref351' } }],
  },
}

describe('Tray', () => {
  it('cliente: celular primeiro, sem CPF/CNPJ', () => {
    const c = customerFromTray({
      Customer: { id: '123', name: 'Nome do Cliente', rg: '00.000.000-0', cpf: '00000000000', phone: '1133330000', cellphone: '11999990000', email: 'emaildo@cliente.com.br', cnpj: '00.000.000/0000-00', company_name: 'Razão Social do Cliente', city: 'Cidade do Cliente', state: 'SP', created: '2008-10-14 18:17:23' },
    })!
    expect(c).toEqual({
      externalId: 'tray:123',
      name: 'Nome do Cliente',
      email: 'emaildo@cliente.com.br',
      phone: '11999990000',
      company: 'Razão Social do Cliente',
      city: 'Cidade do Cliente',
      state: 'SP',
      registeredAt: new Date('2008-10-14T21:17:23Z'),
    })
    expect(JSON.stringify(c)).not.toMatch(/00000000000|0000-00/)
  })

  it('pedido da listagem: sem itens, cliente pelo id, situação padrão', () => {
    const o = orderFromTray(trayOrderList)!
    expect(o).toMatchObject({ externalId: 'tray:5', code: '5', customerId: 'tray:5', customer: null, total: 27027.6, statusName: 'A ENVIAR', statusGroup: 'pago', payment: 'Boleto - Yapay', channel: 'LOJA VIRTUAL', items: null })
    expect(o.orderedAt.toISOString()).toBe('2020-12-07T03:00:00.000Z')
  })

  it('pedido completo: cliente e itens', () => {
    const o = orderFromTray(trayComplete)!
    expect(o.customer).toMatchObject({ externalId: 'tray:21', phone: '18999898989', city: 'Araçatuba' })
    expect(o.items).toEqual([{ sku: 'ref351', name: 'tenis azul', brand: null, quantity: 1, total: 900 }])
    expect(o.orderedAt.toISOString()).toBe('2025-02-06T12:46:09.000Z')
    expect(orderLinesFromTray(trayComplete.Order.ProductsSold)).toEqual(o.items)
    expect(JSON.stringify(o)).not.toContain('00474780040')
  })

  it('grupos da situação pelos tipos e status da documentação', () => {
    expect(trayStatus({ status: 'AGUARDANDO PAGAMENTO', OrderStatus: { type: 'open' } }).group).toBe('pendente')
    expect(trayStatus({ status: 'FINALIZADO', OrderStatus: { type: 'closed' } }).group).toBe('pago')
    expect(trayStatus({ status: 'CANCELADO', OrderStatus: { type: 'canceled' } }).group).toBe('cancelado')
    expect(trayStatus({ status: 'MEU STATUS', OrderStatus: { type: 'open' }, has_payment: '1' }).group).toBe('pago')
    expect(trayStatus({ status: 'MEU STATUS', OrderStatus: { type: 'open' }, has_payment: '0' }).group).toBe('outro')
  })

  it('carrinho a partir de GET /carts/:session_id', () => {
    const body = [
      { Cart: { email: '', session_id: '123ABC456DEF789GHI', product_id: '2', product_name: 'Produto de Teste', quantity: '4', price: '100.00', date: '2018-10-18', customer_id: '0', hour: '07:54:06', product_url: { https: 'https://urldaloja.com.br/categoria/produto' }, product_image: { https: 'https://images.tcdn.com.br/img/img_prod/produto_exemplo_6_12_1_20180716141523.jpg' } } },
      { Cart: { email: 'cliente@exemplo.com', session_id: '123ABC456DEF789GHI', product_id: '20', product_name: 'Produto Teste 2', quantity: '1', price: '100.00', date: '2018-10-18', customer_id: '77', hour: '07:54:56', product_url: { http: 'http://ulrdaloja.com.br/categoria/produto' } } },
    ]
    const rows = trayCartRows(body)
    expect(trayCartRows({ Cart: body[0].Cart })).toHaveLength(1)
    const k = cartFromTray('123ABC456DEF789GHI', rows)!
    expect(k).toMatchObject({ externalId: 'tray:123ABC456DEF789GHI', customerId: 'tray:77', value: 500, checkoutUrl: null, abandoned: false, orderCode: null })
    expect(k.customer).toMatchObject({ externalId: 'tray:77', email: 'cliente@exemplo.com' })
    expect(k.items).toEqual([
      { code: '2', name: 'Produto de Teste', qty: 4, image: 'https://images.tcdn.com.br/img/img_prod/produto_exemplo_6_12_1_20180716141523.jpg', url: 'https://urldaloja.com.br/categoria/produto' },
      { code: '20', name: 'Produto Teste 2', qty: 1, image: null, url: null },
    ])
    expect(k.startedAt?.toISOString()).toBe('2018-10-18T10:54:06.000Z')
    expect(k.lastActivityAt?.toISOString()).toBe('2018-10-18T10:54:56.000Z')
  })

  it('produto', () => {
    const p = productFromTray(
      {
        Product: {
          id: '3',
          name: 'PRODUTO TESTE',
          price: '139.00',
          promotional_price: '120.00',
          start_promotion: '0000-00-00',
          end_promotion: '0000-00-00',
          brand: '',
          stock: '51',
          available: '1',
          reference: '016301',
          url: { http: 'http://loja.com.br/categoria/produto-de-teste', https: 'https://loja.com.br/categoria/produto-de-teste' },
          ProductImage: [{ http: 'http://images.tcdn.com.br/a.jpg', https: 'https://images.tcdn.com.br/a.jpg' }],
        },
      },
      new Date('2024-01-01T12:00:00Z'),
    )
    expect(p).toEqual({ externalId: 'tray:3', code: '016301', name: 'PRODUTO TESTE', brand: null, price: 120, priceFrom: 139, stock: 51, image: 'https://images.tcdn.com.br/a.jpg', url: 'https://loja.com.br/categoria/produto-de-teste', active: true })
    const vencida = productFromTray({ Product: { id: '3', name: 'X', price: '139.00', promotional_price: '120.00', end_promotion: '2023-12-31', available: '0' } }, new Date('2024-01-05T12:00:00Z'))!
    expect(vencida.price).toBe(139)
    expect(vencida.priceFrom).toBeNull()
    expect(vencida.active).toBe(false)
  })

  it('endereços: domínio da loja e api_address só do mesmo domínio ou commercesuite, sempre https', () => {
    expect(trayStoreHost('https://www.minhaloja.com.br/')).toBe('www.minhaloja.com.br')
    expect(trayStoreHost('javascript:alert(1)')).toBeNull()
    expect(trayApiAddress('http://minhaloja.com.br/web_api/', 'www.minhaloja.com.br')).toBe('https://minhaloja.com.br/web_api')
    expect(trayApiAddress('https://trayparceiros.commercesuite.com.br/web_api', 'www.minhaloja.com.br')).toBe('https://trayparceiros.commercesuite.com.br/web_api')
    expect(trayApiAddress('https://outro.com/web_api', 'www.minhaloja.com.br')).toBeNull()
    expect(trayRange(new Date('2024-03-10T12:00:00Z'), new Date('2024-03-20T12:00:00Z'))).toBe('2024-03-10,2024-03-20 23:59:59')
  })

  it('autorização (state no caminho do callback), troca do código e renovação', async () => {
    const { ctx, calls, saved } = fakeCtx({ storeDomain: 'trayparceiros.commercesuite.com.br' }, { consumerKey: 'ck', consumerSecret: 'cs' }, [
      {
        status: 200,
        body: { message: 'Created tokens', code: '200', access_token: 'AT1', refresh_token: 'RT1', date_expiration_access_token: '2000-03-02 14:58:21', api_host: 'https://trayparceiros.commercesuite.com.br/web_api', store_id: '391250' },
      },
    ])
    const url = new URL(tray.authorizeUrl!(ctx, 'https://crm.exemplo/api/lojas/tray/oauth/retorno', 'abc.123'))
    expect(url.origin + url.pathname).toBe('https://trayparceiros.commercesuite.com.br/auth.php')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('consumer_key')).toBe('ck')
    expect(url.searchParams.get('callback')).toBe('https://crm.exemplo/api/lojas/tray/oauth/retorno/abc.123')
    await tray.exchange!(ctx, { code: 'c0de', store: '391250', api_address: 'https://trayparceiros.commercesuite.com.br/web_api', state: 'abc.123' }, '')
    expect(calls[0].url).toBe('https://trayparceiros.commercesuite.com.br/web_api/auth')
    expect(new URLSearchParams(calls[0].body!).get('consumer_secret')).toBe('cs')
    expect(saved[0]).toMatchObject({ accessToken: 'AT1', refreshToken: 'RT1', apiAddress: 'https://trayparceiros.commercesuite.com.br/web_api', storeId: '391250' })
    await expect(tray.exchange!(ctx, { code: 'x', api_address: 'https://ladrao.com/web_api' }, '')).rejects.toThrow(/não confere/)
  })

  it('paginação com paging.total, renovação do token vencido e 404 como fim', async () => {
    const values = { storeDomain: 'loja.commercesuite.com.br', apiAddress: 'https://loja.commercesuite.com.br/web_api', accessToken: 'velho', refreshToken: 'RT', expiresAt: '2000-01-01T00:00:00.000Z' }
    const { ctx, calls, saved } = fakeCtx(values, {}, [
      { status: 200, body: { message: 'Refreshed tokens', access_token: 'novo', refresh_token: 'RT2', date_expiration_access_token: '2999-01-01 00:00:00' } },
      { status: 200, body: { paging: { total: 51, page: 1, offset: 0, limit: 50, maxLimit: 50 }, Products: [{ Product: { id: '3', name: 'A', price: '10.00', available: '1' } }] } },
      { status: 404, body: { code: 404, name: 'No records found' } },
    ])
    const p1 = await tray.products(ctx, 1)
    expect(calls[0].url).toBe('https://loja.commercesuite.com.br/web_api/auth?refresh_token=RT')
    expect(saved[0]).toMatchObject({ accessToken: 'novo', refreshToken: 'RT2' })
    const u = new URL(calls[1].url)
    expect(u.searchParams.get('access_token')).toBe('novo')
    expect(u.searchParams.get('limit')).toBe('50')
    expect(p1.more).toBe(true)
    expect(p1.items[0].externalId).toBe('tray:3')
    const p2 = await tray.products(ctx, 2)
    expect(p2).toEqual({ items: [], more: false })
  })
})

// ---------------- Loja Integrada (exemplos de api-docs.lojaintegrada.com.br) ----------------

describe('Loja Integrada', () => {
  it('cliente do detalhe: telefone e endereço principal, sem CPF', () => {
    const c = customerFromLojaIntegrada({
      cnpj: null,
      cpf: '37363337144',
      data_criacao: '2022-11-06 00:27:54.189059',
      email: '8e90598ada@inboxmail.life',
      enderecos: [{ cidade: 'São Paulo', estado: 'SP', principal: true }],
      id: 52759204,
      nome: 'João Exemplo',
      razao_social: null,
      rg: '123456-7',
      telefone_celular: '11999998888',
      telefone_comercial: '1140620137',
      telefone_principal: '1133334444',
    })!
    expect(c).toEqual({ externalId: 'loja_integrada:52759204', name: 'João Exemplo', email: '8e90598ada@inboxmail.life', phone: '11999998888', company: null, city: 'São Paulo', state: 'SP', registeredAt: new Date('2022-11-06T03:27:54Z') })
    expect(JSON.stringify(c)).not.toContain('37363337144')
  })

  it('pedido da busca e itens do detalhe', () => {
    const o = orderFromLojaIntegrada({
      cliente: '/api/v1/cliente/34220641',
      data_criacao: '2022-10-31T12:28:05.704751',
      numero: 165,
      resource_uri: '/api/v1/pedido/165',
      situacao: { aprovado: false, cancelado: true, codigo: 'pedido_cancelado', final: true, id: 8, nome: 'Pedido Cancelado' },
      valor_total: '32.48',
    })!
    expect(o).toMatchObject({ externalId: 'loja_integrada:165', code: '165', customerId: 'loja_integrada:34220641', customer: null, total: 32.48, statusName: 'Pedido Cancelado', statusGroup: 'cancelado', items: null })
    expect(o.orderedAt.toISOString()).toBe('2022-10-31T15:28:05.000Z')
    expect(orderLinesFromLojaIntegrada([{ nome: 'Casaco infantil', preco_cheio: '12.00', preco_promocional: '11.10', preco_venda: '11.10', quantidade: '1.00', sku: 'casaco-azul-tam-m666' }])).toEqual([
      { sku: 'casaco-azul-tam-m666', name: 'Casaco infantil', brand: null, quantity: 1, total: 11.1 },
    ])
    expect(liIdFromUri('/api/v1/produto/88568855?id_externo=1')).toBe('88568855')
  })

  it('situações da documentação (GET /v1/situacao)', () => {
    expect(lojaIntegradaStatus({ aprovado: true, cancelado: false, codigo: 'pedido_pago', nome: 'Pedido Pago' }).group).toBe('pago')
    expect(lojaIntegradaStatus({ aprovado: false, cancelado: false, codigo: 'aguardando_pagamento' }).group).toBe('pendente')
    expect(lojaIntegradaStatus({ aprovado: false, cancelado: false, codigo: 'pedido_efetuado' }).group).toBe('pendente')
    expect(lojaIntegradaStatus({ aprovado: false, cancelado: true, codigo: 'pagamento_devolvido' }).group).toBe('cancelado')
    expect(lojaIntegradaStatus({ aprovado: true, cancelado: false, codigo: 'pedido_chargeback' }).group).toBe('cancelado')
    expect(lojaIntegradaStatus({ aprovado: false, cancelado: false, codigo: 'outra' }).group).toBe('outro')
  })

  it('produto pelo detalhe ou por preço/estoque', () => {
    const row = { ativo: true, id: 238281213, nome: 'Adaptador Headset Para Controle Xbox - Microsoft', removido: false, sku: '16167', url: 'https://www.testeli.site/fones/microsoft/headset-xbox-one' }
    const p = productFromLojaIntegrada(row, {
      detail: { ...row, preco_cheio: 100, preco_promocional: null, preco_sob_consulta: false, estoque_gerenciado: true, estoque_quantidade: 15, imagem_principal: { grande: 'https://cdn.awsli.com.br/800x800/1736/1736356/produto/23828121319214f9e8d.jpg' } },
    })
    expect(p).toEqual({ externalId: 'loja_integrada:238281213', code: '16167', name: 'Adaptador Headset Para Controle Xbox - Microsoft', brand: null, price: 100, priceFrom: null, stock: 15, image: 'https://cdn.awsli.com.br/800x800/1736/1736356/produto/23828121319214f9e8d.jpg', url: 'https://www.testeli.site/fones/microsoft/headset-xbox-one', active: true })
    const v = productFromLojaIntegrada(
      { ativo: true, id: 198399269, nome: null, sku: 'Q65VXE4BB-abacaxi', tipo: 'atributo_opcao', url: 'https://loja-exemplo.lojaintegrada.com.br/produto/198399269.html' },
      { price: { cheio: '32.83', promocional: '22.83', sob_consulta: false }, stock: { gerenciado: true, quantidade: 10, quantidade_disponivel: 10 }, parentName: 'Teste variação' },
    )!
    expect(v).toMatchObject({ name: 'Teste variação', price: 22.83, priceFrom: 32.83, stock: 10 })
  })

  it('cabeçalho chave_api/aplicacao e paginação por meta.next', async () => {
    const { ctx, calls, sleeps } = fakeCtx({ chaveApi: 'q9r1xx', chaveAplicacao: 'dc6049f0-aaaa' }, {}, [
      { status: 200, body: { meta: { limit: 50, next: '/api/v1/pedido/search?limit=50&offset=50', offset: 0, total_count: 60 }, objects: [{ cliente: '/api/v1/cliente/1', numero: 164, situacao: { aprovado: true, codigo: 'pedido_pago', nome: 'Pedido Pago' }, valor_total: '10.00', data_criacao: '2022-10-31T12:17:51.633657' }] } },
      { status: 200, body: { meta: { limit: 50, next: null, offset: 50, total_count: 60 }, objects: [{ numero: 165, situacao: { cancelado: true }, valor_total: '1.00', data_criacao: '2022-10-31T12:17:51' }] } },
    ])
    const since = new Date('2023-06-01T11:30:22Z')
    const p1 = await lojaIntegrada.orders(ctx, since, 1)
    expect(calls[0].headers?.Authorization).toBe('chave_api q9r1xx aplicacao dc6049f0-aaaa')
    const u = new URL(calls[0].url)
    expect(u.origin + u.pathname).toBe('https://api.awsli.com.br/v1/pedido/search')
    expect(u.searchParams.get('since_atualizado')).toBe('2023-06-01T08:30:22')
    expect(u.searchParams.get('offset')).toBe('0')
    expect(p1.more).toBe(true)
    expect(p1.items[0].statusGroup).toBe('pago')
    const p2 = await lojaIntegrada.orders(ctx, since, 2)
    expect(new URL(calls[1].url).searchParams.get('offset')).toBe('50')
    expect(p2.more).toBe(false)
    expect(sleeps.every((s) => s >= 700)).toBe(true)
    expect(lojaIntegrada.carts).toBeUndefined()
    expect(lojaIntegrada.def.supports.carts).toBe(false)
  })
})
