import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import { privateIp } from '../fretes/download'

/**
 * Chamadas do CRM ao servidor de um ERP na internet (Trier): proteção contra SSRF. O host é resolvido na hora da
 * conexão (o lookup recusa IP de rede interna, da própria máquina, link-local, CGNAT e metadados de nuvem — o DNS
 * não pode trocar o IP depois da conferência), sem seguir redirecionamento, com tempo máximo e limite de tamanho.
 * Rede interna só no "Acesso pela VPN": a empresa da plataforma libera um IP privado exato (com a porta, conferida
 * pelo serviço) para a empresa; loopback, link-local (169.254.x, metadados de nuvem) e reservados nunca passam.
 */

export class BlockedAddressError extends Error {
  constructor() {
    super('Endereço de rede interna não permitido. Use o IP público ou o DDNS da farmácia (porta liberada no roteador) ou, com VPN, peça a liberação do IP:porta à plataforma.')
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`)
  }
}

/**
 * IP de rede privada que pode ser liberado para o acesso pela VPN: 10/8, 172.16/12, 192.168/16, 100.64/10 (CGNAT,
 * usado por algumas VPNs) e IPv6 fc00::/7. Loopback, link-local, 0.x e multicast nunca.
 */
export function vpnEligibleIp(ip: string): boolean {
  if (!isIP(ip)) return false
  if (ip.includes(':')) {
    const v = ip.toLowerCase()
    if (v.startsWith('::ffff:')) return vpnEligibleIp(v.slice(7))
    return /^f[cd][0-9a-f]{0,2}:/.test(v)
  }
  const [a, b] = ip.split('.').map(Number) as [number, number]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

/**
 * Pode conectar neste IP? IP público sim; IP de rede interna só se for exatamente o liberado para a empresa
 * (acesso pela VPN) e de uma faixa privada aceita. Loopback, link-local e metadados de nuvem sempre bloqueados.
 */
export function addressAllowed(ip: string, allowIp: string | null = null): boolean {
  if (!privateIp(ip)) return true
  return !!allowIp && sameIp(ip, allowIp) && vpnEligibleIp(ip)
}

const sameIp = (a: string, b: string) => a.toLowerCase().replace(/^::ffff:/, '') === b.toLowerCase().replace(/^::ffff:/, '')

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/** lookup para http.request: resolve e confere todos os IPs do host antes de conectar. */
export function guardedLookup(allowIp: string | null, resolver: typeof dnsLookup = dnsLookup) {
  return (hostname: string, options: { all?: boolean; family?: number } | number, cb: LookupCb) => {
    const opts = typeof options === 'number' ? { family: options } : (options ?? {})
    resolver(hostname, { family: opts.family ?? 0, all: true }, (err, addrs) => {
      if (err) return cb(err, '')
      const list = (Array.isArray(addrs) ? addrs : []) as LookupAddress[]
      if (!list.length) return cb(Object.assign(new Error(`Endereço não encontrado: ${hostname}`), { code: 'ENOTFOUND' }), '')
      if (list.some((a) => !addressAllowed(a.address, allowIp))) return cb(new BlockedAddressError(), '')
      if (opts.all) return cb(null, list)
      cb(null, list[0]!.address, list[0]!.family)
    })
  }
}

export interface SafeGetOptions {
  headers?: Record<string, string>
  timeoutMs: number
  maxBytes: number
  /** IP privado liberado para a empresa (acesso pela VPN), ou null. */
  allowIp: string | null
}

/** GET com as proteções acima; devolve o corpo como texto (status 2xx) ou lança HttpStatusError. */
export function safeGet(url: string, o: SafeGetOptions): Promise<string> {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return Promise.reject(new Error('Protocolo não permitido.'))
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !addressAllowed(host, o.allowIp)) return Promise.reject(new BlockedAddressError())
  const lib = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (err: Error | null, body?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(body!)
    }
    const req = lib.request(u, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'CRM-integracao/1.0', ...o.headers }, lookup: guardedLookup(o.allowIp) as never }, (res) => {
      const status = res.statusCode ?? 0
      const len = Number(res.headers['content-length'] ?? 0)
      if (len > o.maxBytes) {
        res.destroy()
        return finish(new Error('Resposta grande demais.'))
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > o.maxBytes) {
          res.destroy()
          finish(new Error('Resposta grande demais.'))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        // Redirecionamento não é seguido (poderia levar para a rede interna).
        if (status >= 200 && status < 300) finish(null, body)
        else finish(new HttpStatusError(status, body.slice(0, 500)))
      })
      res.on('error', (e) => finish(e))
    })
    const timer = setTimeout(() => {
      req.destroy()
      finish(new Error('O servidor não respondeu a tempo.'))
    }, o.timeoutMs)
    req.on('error', (e) => finish(e))
    req.end()
  })
}

/** Mensagem em português para erro de rede. */
export function networkError(e: unknown): string {
  if (e instanceof BlockedAddressError) return e.message
  const code = (e as NodeJS.ErrnoException)?.code
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Endereço não encontrado (DNS). Confira o IP ou o DDNS da farmácia.'
  if (code === 'ECONNREFUSED') return 'Conexão recusada: o servidor da Trier não está aceitando conexões nessa porta (confira a porta 4647 e o redirecionamento no roteador).'
  if (code === 'ECONNRESET') return 'A conexão foi interrompida pelo servidor da Trier.'
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'Servidor inacessível pela internet. Confira o IP fixo/DDNS e o roteador da farmácia.'
  if (code && /^(CERT_|ERR_TLS|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY)/.test(code)) return 'Certificado HTTPS inválido no servidor da Trier. Use http:// ou um certificado válido.'
  const msg = (e as Error)?.message ?? ''
  return msg && !/^[a-z]/.test(msg) ? msg : 'Falha de conexão com o servidor da Trier.'
}
