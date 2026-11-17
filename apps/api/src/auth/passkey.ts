/** Entrar com Face ID / Touch ID / digital (funções puras). */

/** Aparelhos ativados por pessoa. */
export const PASSKEY_MAX = 5

/** Nome curto do aparelho pelo navegador, para a pessoa reconhecer na lista (ex.: "iPhone", "Android", "Windows"). */
export function deviceNameOf(userAgent: string | null | undefined) {
  const ua = userAgent ?? ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  return 'Aparelho'
}

/**
 * Dono da chave (WebAuthn) pelo endereço acessado: cada empresa tem o seu (<slug>.dominio ou domínio próprio), e a
 * chave criada num endereço só vale nele. O protocolo vem do endereço do sistema (https em produção).
 */
export function relyingParty(host: string, appUrl: string) {
  const h = host.trim().toLowerCase()
  const protocol = new URL(appUrl).protocol
  return { rpID: h.split(':')[0]!, origin: `${protocol}//${h}` }
}
