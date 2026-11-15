import type { ErpDef, ErpProductData } from '../erps'

/** O que o serviço entrega a cada adaptador: credenciais abertas, chamada HTTP segura e onde guardar tokens novos. */
export interface ErpCtx {
  /** Valores dos campos já descriptografados. */
  values: Record<string, string>
  /**
   * Chamada HTTP (GET ou POST) com tempo máximo e limite de tamanho; devolve o corpo como texto ou lança
   * HttpStatusError. Endereço de rede interna só se for o servidor do cliente liberado pela plataforma (VPN).
   */
  request(url: string, o?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }): Promise<string>
  /** Guarda valores novos (ex.: tokens OAuth renovados). Chaves secretas são criptografadas. */
  save(patch: Record<string, string>): Promise<void>
}

export interface ErpAdapter {
  def: ErpDef
  /** Testar a conexão: lê um produto e devolve a frase para a tela. */
  test(ctx: ErpCtx): Promise<string>
  /** Cópia completa: chama onPage a cada página de produtos (com preço, estoque e custo quando o ERP fornece). */
  sync(ctx: ErpCtx, onPage: (rows: ErpProductData[]) => Promise<void>): Promise<void>
  /** OAuth: endereço para o cliente autorizar o acesso no ERP. */
  authorizeUrl?(values: Record<string, string>, redirectUri: string, state: string): string
  /** OAuth: troca o código da volta pelo token (guardado com ctx.save). */
  exchangeCode?(ctx: ErpCtx, code: string, redirectUri: string): Promise<void>
}
