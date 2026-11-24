import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CobrancaService } from './cobranca.service'
import { AsaasWebhookController, AssinaturaController, CadastroController, CertificadosController, DominioPermitidoController, SiteController, PlataformaController, PrimeirosPassosController } from './plataforma.controller'
import { PlataformaService } from './plataforma.service'
import { DemoRelogioService } from './demo-relogio.service'
import { PrimeirosPassosService } from './primeiros-passos.service'

/** Plataforma SaaS: empresas clientes, planos, domínios próprios, cobranças e a situação das assinaturas. */
@Module({
  imports: [AuthModule],
  controllers: [PlataformaController, CadastroController, AsaasWebhookController, AssinaturaController, DominioPermitidoController, CertificadosController, SiteController, PrimeirosPassosController],
  providers: [PlataformaService, CobrancaService, PrimeirosPassosService, DemoRelogioService],
  exports: [PlataformaService, CobrancaService],
})
export class PlataformaModule {}
