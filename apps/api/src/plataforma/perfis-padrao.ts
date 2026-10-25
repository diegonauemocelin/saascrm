/**
 * Perfis de acesso criados em toda empresa nova (pelo seed, pelo painel da plataforma e pelo cadastro). O administrador
 * da empresa ajusta depois. Os módulos fora do plano ficam sem efeito (as permissões são filtradas pelo plano).
 */
import type { PrismaClient } from '../generated/prisma/client'

const MODULES = [
  'dashboard', 'leads', 'carrinhos', 'pre_vendas', 'pos_vendas', 'cadastros', 'chat', 'captura', 'email_marketing',
  'whatsapp', 'automacoes', 'catalogo', 'relatorios', 'google_ads', 'usuarios', 'perfis', 'configuracoes', 'auditoria',
] as const
type Mod = (typeof MODULES)[number]
type P = { v?: 1; c?: 1; e?: 1; d?: 1; x?: 1; own?: 1 }

const ALL: P = { v: 1, c: 1, e: 1, d: 1, x: 1 }
const WORK: P = { v: 1, c: 1, e: 1, x: 1 }
const VIEW: P = { v: 1 }
const VIEW_EXPORT: P = { v: 1, x: 1 }

export const DEFAULT_ROLES: { name: string; description: string; require2fa: boolean; isSystem?: boolean; perms: Partial<Record<Mod, P>> }[] = [
  { name: 'Administrador', description: 'Acesso total ao sistema.', require2fa: true, isSystem: true, perms: {} },
  {
    name: 'Marketing',
    description: 'Leads, captura, email marketing, automações e relatórios.',
    require2fa: false,
    perms: { dashboard: VIEW, leads: ALL, captura: ALL, email_marketing: ALL, automacoes: ALL, catalogo: WORK, relatorios: VIEW_EXPORT, carrinhos: WORK, google_ads: { v: 1, e: 1, x: 1 } },
  },
  {
    name: 'Pré-Vendas',
    description: 'Atendimento de pré-vendas e chat.',
    require2fa: false,
    perms: { dashboard: VIEW, leads: WORK, carrinhos: WORK, pre_vendas: WORK, chat: WORK, relatorios: VIEW },
  },
  {
    name: 'Pós-Vendas',
    description: 'Atendimento de pós-vendas e chat.',
    require2fa: false,
    perms: { dashboard: VIEW, leads: WORK, pos_vendas: WORK, chat: WORK, relatorios: VIEW },
  },
  {
    name: 'Vendedor',
    description: 'Vê e atualiza somente os próprios leads e atendimentos.',
    require2fa: false,
    perms: {
      dashboard: VIEW,
      leads: { v: 1, e: 1, own: 1 },
      pre_vendas: { v: 1, e: 1, own: 1 },
      pos_vendas: { v: 1, e: 1, own: 1 },
      chat: { v: 1, c: 1, e: 1, own: 1 },
    },
  },
  {
    name: 'Diretoria',
    description: 'Somente leitura de todos os módulos, com exportação.',
    require2fa: true,
    perms: Object.fromEntries(
      MODULES.filter((m) => !['usuarios', 'perfis', 'configuracoes'].includes(m)).map((m) => [m, VIEW_EXPORT]),
    ),
  },
]

/** Cria os perfis que faltam (pelo nome): rodar de novo não duplica. Devolve o id do perfil Administrador. */
export async function createDefaultRoles(prisma: Pick<PrismaClient, 'role'>, tenantId: string): Promise<string> {
  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: r.name } } })
    if (existing) continue
    await prisma.role.create({
      data: {
        tenantId,
        name: r.name,
        description: r.description,
        require2fa: r.require2fa,
        isSystem: r.isSystem ?? false,
        permissions: {
          create: Object.entries(r.perms).map(([module, p]) => ({
            module,
            canView: !!p.v,
            canCreate: !!p.c,
            canEdit: !!p.e,
            canDelete: !!p.d,
            canExport: !!p.x,
            scope: p.own ? ('OWN' as const) : ('ALL' as const),
          })),
        },
      },
    })
  }
  return (await prisma.role.findFirstOrThrow({ where: { tenantId, isSystem: true }, select: { id: true } })).id
}
