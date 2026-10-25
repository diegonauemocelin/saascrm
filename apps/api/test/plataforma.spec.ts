import { describe, expect, it } from 'vitest'
import { can, fullPermissions } from '../src/common/permissions'
import { accessOf, allowedModules, cleanSlug, filterPermissions, hostKind, nextStatus } from '../src/plataforma/sistemas'

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
    expect(hostKind('CRM.Empresa.com.br:443', P, null)).toEqual({ kind: 'custom', host: 'crm.empresa.com.br' })
    expect(hostKind('sgmulticonecta.com.br', P, null)).toEqual({ kind: 'none' })
    expect(hostKind('a.b.sgmulticonecta.com.br', P, null)).toEqual({ kind: 'none' })
    expect(hostKind('localhost:5173', P, null)).toEqual({ kind: 'none' })
  })
})
