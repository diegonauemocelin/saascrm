/**
 * Asaas (cobrança das mensalidades): cliente, assinatura mensal e cobranças. O fetch é injetável para os testes.
 * Documentação: https://docs.asaas.com (API v3; autenticação pelo cabeçalho access_token).
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface AsaasPayment {
  id: string
  customer: string
  subscription?: string | null
  value: number
  status: string
  billingType?: string | null
  dueDate: string
  paymentDate?: string | null
  clientPaymentDate?: string | null
  confirmedDate?: string | null
  invoiceUrl?: string | null
  externalReference?: string | null
}

/** Situação da cobrança no CRM (português, para a tela). */
export function paymentStatus(s: string): string {
  if (s === 'RECEIVED' || s === 'RECEIVED_IN_CASH') return 'RECEBIDA'
  if (s === 'CONFIRMED') return 'CONFIRMADA'
  if (s === 'OVERDUE') return 'VENCIDA'
  if (s === 'REFUNDED' || s === 'REFUND_REQUESTED' || s === 'REFUND_IN_PROGRESS' || s === 'CHARGEBACK_REQUESTED' || s === 'CHARGEBACK_DISPUTE') return 'ESTORNADA'
  if (s === 'DELETED' || s === 'CANCELLED') return 'CANCELADA'
  return 'PENDENTE'
}

/** Pagamento confirmado (cartão aprovado ou dinheiro recebido): libera o acesso. */
export const isPaid = (s: string) => s === 'CONFIRMED' || s === 'RECEIVED' || s === 'RECEIVED_IN_CASH'

/** Pago até: o vencimento pago mais um mês (assinatura mensal). Nunca volta para trás. */
export function paidUntilAfter(dueDate: string, current: Date | null): Date {
  const [y, m, d] = dueDate.slice(0, 10).split('-').map(Number) as [number, number, number]
  // Fim do dia do mesmo dia no mês seguinte (horário de Brasília); dia 31 em mês curto vai para o último dia.
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const next = new Date(Date.UTC(y, m, Math.min(d, last), 23 + 3, 59))
  return current && current.getTime() > next.getTime() ? current : next
}

/** Data AAAA-MM-DD no fuso de Brasília. */
export const brDate = (t: number | Date) => new Date((typeof t === 'number' ? t : t.getTime()) - 3 * 3_600_000).toISOString().slice(0, 10)

export class AsaasClient {
  private readonly base: string

  constructor(
    private readonly apiKey: string,
    sandbox: boolean,
    private readonly fetcher: Fetcher = fetch,
    base?: string | null,
  ) {
    this.base = base || (sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3')
  }

  private async call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(`${this.base}${path}`, {
      method,
      headers: { access_token: this.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'sgmulticonecta-crm' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    })
    const data = (await res.json().catch(() => null)) as { errors?: { description?: string }[] } | null
    if (!res.ok) {
      const msg = data?.errors?.map((e) => e.description).filter(Boolean).join('; ') || `erro ${res.status}`
      throw new AsaasError(`Asaas: ${msg}`, res.status)
    }
    return data as T
  }

  createCustomer(d: { name: string; cpfCnpj: string; email: string; mobilePhone?: string | null; externalReference: string }) {
    return this.call<{ id: string }>('POST', '/customers', { name: d.name, cpfCnpj: d.cpfCnpj, email: d.email, ...(d.mobilePhone ? { mobilePhone: d.mobilePhone } : {}), externalReference: d.externalReference, notificationDisabled: false })
  }

  /** Assinatura mensal; o cliente escolhe Pix, boleto ou cartão na fatura (billingType UNDEFINED). */
  createSubscription(d: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) {
    return this.call<{ id: string }>('POST', '/subscriptions', { customer: d.customer, billingType: 'UNDEFINED', cycle: 'MONTHLY', value: d.value, nextDueDate: d.nextDueDate, description: d.description, externalReference: d.externalReference })
  }

  /** Muda o valor (troca de plano); as cobranças ainda não pagas também mudam. */
  updateSubscription(id: string, d: { value: number; description: string }) {
    return this.call<{ id: string }>('PUT', `/subscriptions/${id}`, { value: d.value, description: d.description, updatePendingPayments: true })
  }

  cancelSubscription(id: string) {
    return this.call<{ deleted: boolean }>('DELETE', `/subscriptions/${id}`)
  }

  async subscriptionPayments(id: string) {
    return (await this.call<{ data: AsaasPayment[] }>('GET', `/subscriptions/${id}/payments?limit=50`)).data ?? []
  }
}
