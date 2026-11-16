import { Module } from '@nestjs/common'
import { LeadsModule } from '../leads/leads.module'
import { RastreamentoModule } from '../rastreamento/rastreamento.module'
import { LojasController } from './lojas.controller'
import { LojasService } from './lojas.service'

/** Integrações com loja virtual (Tray, Nuvemshop, Loja Integrada): clientes, pedidos, carrinhos e produtos. */
@Module({
  imports: [LeadsModule, RastreamentoModule],
  controllers: [LojasController],
  providers: [LojasService],
})
export class LojasModule {}
