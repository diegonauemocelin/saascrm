import type { CustomerData } from '../../integracoes/magazord'
import type { LojaCart, LojaKey, LojaOrder, LojaProduct } from '../lojas'

/** O que o serviço entrega a cada adaptador. */
export interface LojaCtx {
  /** Campos da tela e tokens, já descriptografados. */
  values: Record<string, string>
  /** Chaves do aplicativo da SG na plataforma (Tray: consumerKey/consumerSecret; Nuvemshop: appId/clientId/clientSecret). */
  app: Record<string, string>
  /**
   * Chamada HTTP com tempo máximo e limite de tamanho; devolve { status, body, headers } (não lança em 4xx/5xx: o
   * adaptador decide). Endereço de rede interna é recusado.
   */
  request(url: string, o?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string; headers: Record<string, string> }>
  /** Guarda valores novos (ex.: tokens renovados). Tudo que não for campo não secreto da tela é criptografado. */
  save(patch: Record<string, string>): Promise<void>
  /** Espera entre chamadas (limites da plataforma). */
  sleep(ms: number): Promise<void>
}

export interface LojaField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  help?: string
  optional?: boolean
}

export interface LojaDef {
  key: LojaKey
  name: string
  /** OAuth com o aplicativo da SG (botão Conectar). */
  oauth: boolean
  /** Campos que a empresa preenche (vazio quando é só OAuth). */
  fields: LojaField[]
  /** Chaves do aplicativo da SG que o administrador da plataforma guarda. */
  appFields: LojaField[]
  /** O que a plataforma permite ler (a tela mostra). */
  supports: { customers: boolean; orders: boolean; carts: boolean; cartLink: boolean; products: boolean }
  howTo: string
}

/** Página lida: os registros e se há mais. */
export interface Page<T> {
  items: T[]
  more: boolean
}

export interface LojaAdapter {
  def: LojaDef
  /** Testar a conexão: devolve a frase para a tela (ex.: nome da loja). */
  test(ctx: LojaCtx): Promise<string>
  /** Clientes alterados desde `since` (null = todos), página `page` (começa em 1). */
  customers(ctx: LojaCtx, since: Date | null, page: number): Promise<Page<CustomerData>>
  /** Pedidos alterados desde `since` (null = últimos 2 anos), página `page`. Itens quando a consulta já traz. */
  orders(ctx: LojaCtx, since: Date | null, page: number): Promise<Page<LojaOrder>>
  /** Itens de um pedido (quando a lista não traz); null = não dá para ler. */
  orderItems?(ctx: LojaCtx, externalId: string): Promise<LojaOrder['items']>
  /** Carrinhos (com cliente identificado) alterados desde `since` (null = últimos 30 dias), página `page`. */
  carts?(ctx: LojaCtx, since: Date | null, page: number): Promise<Page<LojaCart>>
  /** Produtos (todos), página `page`. */
  products(ctx: LojaCtx, page: number): Promise<Page<LojaProduct>>
  /** OAuth: endereço para a loja autorizar o aplicativo da SG. */
  authorizeUrl?(ctx: LojaCtx, redirectUri: string, state: string): string
  /** OAuth: volta da autorização com os parâmetros da URL (code e, na Tray, api_address/store). Guarda os tokens. */
  exchange?(ctx: LojaCtx, params: Record<string, string>, redirectUri: string): Promise<void>
}
