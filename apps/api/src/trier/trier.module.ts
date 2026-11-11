import { Module } from '@nestjs/common'
import { TrierController } from './trier.controller'
import { TrierService } from './trier.service'

/** Trier (ERP de farmácias): produtos, estoque e preço pela API da Trier, chamada pelo CRM. */
@Module({
  controllers: [TrierController],
  providers: [TrierService],
  exports: [TrierService],
})
export class TrierModule {}
