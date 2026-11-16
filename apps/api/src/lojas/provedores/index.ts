import type { LojaKey } from '../lojas'
import { lojaIntegrada } from './loja-integrada'
import { nuvemshop } from './nuvemshop'
import type { LojaAdapter } from './tipos'
import { tray } from './tray'

/** Adaptador de cada plataforma de loja virtual. */
export const LOJA_ADAPTERS: Record<LojaKey, LojaAdapter> = {
  tray,
  nuvemshop,
  loja_integrada: lojaIntegrada,
}
