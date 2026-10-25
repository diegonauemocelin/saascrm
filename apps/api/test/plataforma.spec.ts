import { describe, expect, it } from 'vitest'
import { can, fullPermissions } from '../src/common/permissions'
import { paidUntilAfter, paymentStatus } from '../src/plataforma/asaas'
import { accessOf, allowedModules, avulsoTotal, chosenSystems, cleanSale, cleanSlug, filterPermissions, hostKind, isComplete, nextStatus, onRequestModules, SELLABLE_KEYS, validDocument } from '../src/plataforma/sistemas'

const DAY = 86_400_000
const now = Date.parse('2026-11-10T12:00:00Z')

describe('plataforma: sistemas do plano', () => {
  it('libera a base e os módulos dos sistemas do plano; a empresa dona tem tudo', () => {
    const m = allowedModules({ isPlatform: false, systems: ['whatsapp', 'postagens'] })
    expect(m.has('chat')).toBe(true)
    expect(m.has('postagens')).toBe(true)
    expect(m.has('leads')).toBe(true)
    expect(m.has('email_marketing')).toBe(false)
    expect(m.has('plataforma')).toBe(false)
    expect(m.has('consulta_produtos')).toBe(false)
    expect(allowedModules({ isPlatform: true, systems: [] }).has('plataforma')).toBe(true)
  })

  it('o administrador só tem os módulos do plano', () => {
    const perms = filterPermissions(fullPermissions(), allowedModules({ isPlatform: false, systems: ['atendimento'] }))
    expect(can(perms, true, 'pre_vendas', 'delete')).toBe(true)
    expect(can(perms, true, 'chat', 'view')).toBe(false)
    expect(can(perms, true, 'usuarios', 'edit')).toBe(true)
  })
})

describe('plataforma: acesso pela assinatura', () => {
  const base = { isPlatform: false, trialEndsAt: null, paidUntil: null }
  it('sem pagamento confirmado não libera; no teste, até o fim do teste', () => {
    expect(accessOf({ ...base, status: 'AGUARDANDO_PAGAMENTO' }, now).blocked).toBe(true)
    const t = accessOf({ ...base, status: 'TESTE', trialEndsAt: new Date(now + 3 * DAY) }, now)
    expect(t.blocked).toBe(false)
    expect(t.warning).toMatch(/faltam 3 dias/)
    expect(accessOf({ ...base, status: 'TESTE', trialEndsAt: new Date(now - 1) }, now).blocked).toBe(true)
  })

  it('mensalidade vencida: avisa na tolerância e bloqueia depois', () => {
    expect(accessOf({ ...base, status: 'ATIVA', paidUntil: new Date(now + DAY) }, now)).toEqual({ blocked: false, reason: null, warning: null })
    expect(accessOf({ ...base, status: 'ATRASADA', paidUntil: new Date(now - 2 * DAY) }, now).warning).toMatch(/venceu/)
    expect(accessOf({ ...base, status: 'ATRASADA', paidUntil: new Date(now - 6 * DAY) }, now).blocked).toBe(true)
    expect(accessOf({ ...base, status: 'SUSPENSA', paidUntil: new Date(now + DAY) }, now).blocked).toBe(true)
    expect(accessOf({ ...base, isPlatform: true, status: 'SUSPENSA' }, now).blocked).toBe(false)
  })

  it('rotina: ativa → atrasada → suspensa', () => {
    expect(nextStatus({ isPlatform: false, status: 'ATIVA', paidUntil: new Date(now + DAY) }, now)).toBe('ATIVA')
    expect(nextStatus({ isPlatform: false, status: 'ATIVA', paidUntil: new Date(now - DAY) }, now)).toBe('ATRASADA')
    expect(nextStatus({ isPlatform: false, status: 'ATRASADA', paidUntil: new Date(now - 6 * DAY) }, now)).toBe('SUSPENSA')
    expect(nextStatus({ isPlatform: false, status: 'TESTE', paidUntil: null }, now)).toBe('TESTE')
  })
})

describe('plataforma: endereço da empresa', () => {
  it('endereço curto e sem nomes reservados', () => {
    expect(cleanSlug('Peças & Tratores São João')).toBe('pecas-tratores-sao-joao')
    expect(cleanSlug('admin')).toBeNull()
    expect(cleanSlug('ab')).toBeNull()
  })

  it('endereço acessado → subdomínio, painel ou domínio próprio', () => {
    const P = 'sgmulticonecta.com.br'
    expect(hostKind('empresa.sgmulticonecta.com.br', P, 'admin.sgmulticonecta.com.br')).toEqual({ kind: 'slug', slug: 'empresa' })
    expect(hostKind('admin.sgmulticonecta.com.br', P, 'admin.sgmulticonecta.com.br')).toEqual({ kind: 'admin' })
    // Painel no próprio domínio da plataforma (crm.sgmulticonecta.com.br) e empresas em <slug>.crm.sgmulticonecta.com.br.
    const C = 'crm.sgmulticonecta.com.br'
    expect(hostKind(C, C, C)).toEqual({ kind: 'admin' })
    expect(hostKind('empresa.crm.sgmulticonecta.com.br', C, C)).toEqual({ kind: 'slug', slug: 'empresa' })
    expect(hostKind('sgmulticonecta.com.br', C, C)).toEqual({ kind: 'custom', host: 'sgmulticonecta.com.br' })
    expect(hostKind('CRM.Empresa.com.br:443', P, null)).toEqual({ kind: 'custom', host: 'crm.empresa.com.br' })
    expect(hostKind('sgmulticonecta.com.br', P, null)).toEqual({ kind: 'none' })
    expect(hostKind('a.b.sgmulticonecta.com.br', P, null)).toEqual({ kind: 'none' })
    expect(hostKind('localhost:5173', P, null)).toEqual({ kind: 'none' })
  })
})


describe('plataforma: cobrança', () => {
  it('confere CPF e CNPJ pelos dígitos', () => {
    expect(validDocument('529.982.247-25')).toBe(true)
    expect(validDocument('529.982.247-26')).toBe(false)
    expect(validDocument('11.222.333/0001-81')).toBe(true)
    expect(validDocument('11.111.111/1111-11')).toBe(false)
  })

  it('pago até: o mesmo dia no mês seguinte, sem voltar para trás', () => {
    expect(paidUntilAfter('2026-11-10', null).toISOString()).toBe('2026-12-11T02:59:00.000Z')
    expect(paidUntilAfter('2027-01-31', null).toISOString().slice(0, 10)).toBe('2027-03-01')
    const later = new Date('2027-05-01T00:00:00Z')
    expect(paidUntilAfter('2026-11-10', later)).toBe(later)
  })

  it('situação da cobrança em português', () => {
    expect(paymentStatus('RECEIVED')).toBe('RECEBIDA')
    expect(paymentStatus('OVERDUE')).toBe('VENCIDA')
    expect(paymentStatus('PENDING')).toBe('PENDENTE')
  })

  it('integrações sob consulta ficam no menu de quem não tem', () => {
    expect(onRequestModules(allowedModules({ isPlatform: false, systems: ['whatsapp'] }))).toEqual(['carrinhos', 'catalogo', 'seo_ecommerce', 'consulta_produtos'])
    expect(onRequestModules(allowedModules({ isPlatform: false, systems: ['erp'] }))).toEqual(['carrinhos', 'catalogo', 'seo_ecommerce'])
  })
})

describe('venda: sistemas avulsos, kits e completo', () => {
  it('limpa a configuração: só sistemas vendáveis, preços válidos e dias de teste aceitos', () => {
    const s = cleanSale({ showPrices: 'sim', avulso: true, prices: { whatsapp: 9900, erp: 5000, captura: -1, postagens: 1.5, xpto: 10 }, sellable: ['whatsapp', 'erp', 'xpto', 'whatsapp'], maxUsers: 0, maxWhatsapp: 2, trialDays: 5 })
    expect(s.showPrices).toBe(false)
    expect(s.avulso).toBe(true)
    expect(s.prices).toEqual({ whatsapp: 9900 })
    expect(s.sellable).toEqual(['whatsapp'])
    expect(s.maxUsers).toBe(3)
    expect(s.maxWhatsapp).toBe(2)
    expect(s.trialDays).toBe(3)
    expect(cleanSale(null).trialDays).toBe(3)
  })

  it('mensalidade avulsa é a soma dos sistemas escolhidos (só os liberados)', () => {
    const s = cleanSale({ avulso: true, prices: { whatsapp: 9900, marketplaces: 14900 }, sellable: ['whatsapp', 'marketplaces'] })
    const chosen = chosenSystems(['marketplaces', 'captura', 'whatsapp', 'marketplaces'], s)
    expect(chosen).toEqual(['marketplaces', 'whatsapp'])
    expect(avulsoTotal(chosen, s)).toBe(24800)
    expect(avulsoTotal([], s)).toBe(0)
  })

  it('completo tem todos os sistemas vendidos (sob consulta não conta)', () => {
    expect(SELLABLE_KEYS).not.toContain('erp')
    expect(isComplete([...SELLABLE_KEYS])).toBe(true)
    expect(isComplete(SELLABLE_KEYS.filter((k) => k !== 'marketplaces'))).toBe(false)
  })
})
