import type { ErpKey } from '../erps'
import { bling } from './bling'
import { cigam } from './cigam'
import { linxFarma, linxModa } from './linx'
import { omie } from './omie'
import { tiny } from './tiny'
import type { ErpAdapter } from './tipos'

/** Adaptador de cada ERP. */
export const ADAPTERS: Record<ErpKey, ErpAdapter> = {
  bling,
  tiny,
  omie,
  linx_farma: linxFarma,
  linx_moda: linxModa,
  cigam,
}
