import { Module } from '@nestjs/common'
import { TrierModule } from '../../trier/trier.module'
import { MarketplacesModule } from '../marketplaces.module'
import { PublicarController } from './publicar.controller'
import { PublicarService } from './publicar.service'

/** Marketplaces › Publicar do ERP: produtos da Trier no Mercado Livre, com preço e estoque seguindo o ERP. */
@Module({
  imports: [MarketplacesModule, TrierModule],
  controllers: [PublicarController],
  providers: [PublicarService],
})
export class MarketplacePublicarModule {}
