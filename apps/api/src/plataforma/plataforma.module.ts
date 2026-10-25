import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PlataformaController } from './plataforma.controller'
import { PlataformaService } from './plataforma.service'

/** Plataforma SaaS: empresas clientes, planos, domínios próprios, cobranças e a situação das assinaturas. */
@Module({
  imports: [AuthModule],
  controllers: [PlataformaController],
  providers: [PlataformaService],
  exports: [PlataformaService],
})
export class PlataformaModule {}
