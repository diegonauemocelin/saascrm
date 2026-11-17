/**
 * Painel da plataforma e primeiros passos das empresas (funções puras, testadas em test/painel-plataforma.spec.ts).
 */

/** Pagamento recebido no Asaas (conta no faturamento do mês em que entrou). */
export const PAID_STATUSES = ['RECEBIDA', 'CONFIRMADA']

/** Mês (AAAA-MM) no fuso de São Paulo. */
export function monthKey(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(d)
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`
}

/** Os últimos `n` meses (AAAA-MM), do mais antigo ao atual. */
export function lastMonths(now: Date, n: number) {
  const [y, m] = monthKey(now).split('-').map(Number) as [number, number]
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) - (n - 1 - i)
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
  })
}

/** Por mês: faturamento recebido, empresas novas e cancelamentos. */
export function monthly(
  now: Date,
  n: number,
  d: { payments: { valueCents: number; paidAt: Date | null }[]; created: Date[]; canceled: Date[] },
) {
  const keys = lastMonths(now, n)
  const rows = new Map(keys.map((k) => [k, { month: k, receivedCents: 0, newCompanies: 0, canceled: 0 }]))
  for (const p of d.payments) if (p.paidAt) {
    const r = rows.get(monthKey(p.paidAt))
    if (r) r.receivedCents += p.valueCents
  }
  for (const c of d.created) {
    const r = rows.get(monthKey(c))
    if (r) r.newCompanies++
  }
  for (const c of d.canceled) {
    const r = rows.get(monthKey(c))
    if (r) r.canceled++
  }
  return keys.map((k) => rows.get(k)!)
}

/** Empresas com cobrança vencida: soma, vencimento mais antigo e dias de atraso (as mais atrasadas primeiro). */
export function overdueByCompany(now: Date, payments: { tenantId: string; valueCents: number; dueDate: Date; invoiceUrl: string | null }[]) {
  const by = new Map<string, { tenantId: string; openCents: number; count: number; oldestDue: Date; invoiceUrl: string | null }>()
  for (const p of payments) {
    const r = by.get(p.tenantId)
    if (!r) by.set(p.tenantId, { tenantId: p.tenantId, openCents: p.valueCents, count: 1, oldestDue: p.dueDate, invoiceUrl: p.invoiceUrl })
    else {
      r.openCents += p.valueCents
      r.count++
      if (p.dueDate < r.oldestDue) (r.oldestDue = p.dueDate), (r.invoiceUrl = p.invoiceUrl ?? r.invoiceUrl)
    }
  }
  return [...by.values()].map((r) => ({ ...r, daysLate: Math.max(0, Math.floor((now.getTime() - r.oldestDue.getTime()) / 86_400_000)) })).sort((a, b) => b.daysLate - a.daysLate || b.openCents - a.openCents)
}

// ---------- Primeiros passos ----------

export const ONBOARDING_KEY = 'primeiros_passos'

export interface OnboardingCounts {
  whatsappConnected: number
  whatsappNumbers: number
  users: number
  contacts: number
}

/** Passos do cliente novo e se cada um já foi feito (conferido pelos dados da empresa). */
export function onboardingSteps(c: OnboardingCounts) {
  return [
    {
      key: 'whatsapp',
      title: 'Conectar o WhatsApp',
      text: c.whatsappNumbers && !c.whatsappConnected ? 'O número está cadastrado, falta ler o QR Code no celular.' : 'Cadastre o número de atendimento e leia o QR Code no celular.',
      done: c.whatsappConnected > 0,
      to: '/configuracoes?secao=whatsapp-numeros',
      module: 'whatsapp',
    },
    {
      key: 'usuarios',
      title: 'Cadastrar a equipe',
      text: 'Convide os atendentes e vendedores e defina o perfil de cada um.',
      done: c.users > 1,
      to: '/usuarios',
      module: 'usuarios',
    },
    {
      key: 'contatos',
      title: 'Importar os contatos',
      text: 'Traga a agenda do WhatsApp ou uma planilha de clientes e leads.',
      done: c.contacts > 0,
      to: '/agenda',
      module: 'chat',
    },
  ]
}
