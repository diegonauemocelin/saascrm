import { Injectable } from '@nestjs/common'
import type { AuthUser } from '../common/types'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { ONBOARDING_KEY, onboardingSteps } from './painel'

/**
 * Primeiros passos do cliente novo (checklist na tela inicial): conectar o WhatsApp, cadastrar a equipe e importar os
 * contatos. Cada passo é conferido pelos dados da empresa; o checklist some quando tudo está feito ou quando o
 * administrador dispensa. A empresa dona da plataforma não vê.
 */
@Injectable()
export class PrimeirosPassosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async view(user: AuthUser) {
    const T = user.tenantId
    const tenant = await this.prisma.tenant.findUnique({ where: { id: T }, select: { isPlatform: true } })
    // Só quem administra a empresa monta o básico (perfil de sistema).
    if (!user.role.isSystem || tenant?.isPlatform) return { show: false, steps: [], done: 0, total: 0 }
    const saved = await this.settings.get<{ dismissed?: boolean }>(T, ONBOARDING_KEY, {})
    const [whatsappConnected, whatsappNumbers, users, agenda, leads] = await Promise.all([
      this.prisma.whatsappNumber.count({ where: { tenantId: T, deletedAt: null, status: 'CONECTADO' } }),
      this.prisma.whatsappNumber.count({ where: { tenantId: T, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId: T, deletedAt: null, active: true } }),
      this.prisma.whatsappContact.count({ where: { tenantId: T } }),
      this.prisma.lead.count({ where: { tenantId: T, deletedAt: null } }),
    ])
    const steps = onboardingSteps({ whatsappConnected, whatsappNumbers, users, contacts: agenda + leads })
    const done = steps.filter((s) => s.done).length
    return { show: !saved.dismissed && done < steps.length, steps, done, total: steps.length }
  }

  async dismiss(user: AuthUser) {
    if (!user.role.isSystem) return { ok: false }
    await this.settings.set(user.tenantId, ONBOARDING_KEY, { dismissed: true })
    return { ok: true }
  }
}
