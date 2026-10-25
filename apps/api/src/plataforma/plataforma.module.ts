import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CobrancaService } from './cobranca.service'
import { AsaasWebhookController, AssinaturaController, CadastroController, CertificadosController, DominioPermitidoController, SiteController, PlataformaController } from './plataforma.controller'
import { PlataformaService } from './plataforma.service'

/** Plataforma SaaS: empresas clientes, planos, domínios próprios, cobranças e a situação das assinaturas. */
@Module({
  imports: [AuthModule],
  controllers: [PlataformaController, CadastroController, AsaasWebhookController, AssinaturaController, DominioPermitidoController, CertificadosController, SiteController],
  providers: [PlataformaService, CobrancaService],
  exports: [PlataformaService, CobrancaService],
})
export class PlataformaModule {}
