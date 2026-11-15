import { Module } from '@nestjs/common'
import { ErpsController } from './erps.controller'
import { ErpsService } from './erps.service'

/** Integrações com ERPs (Bling, Tiny, Omie, Linx, CIGAM): produtos, preço, estoque e custo, só leitura. */
@Module({
  controllers: [ErpsController],
  providers: [ErpsService],
  exports: [ErpsService],
})
export class ErpsModule {}
