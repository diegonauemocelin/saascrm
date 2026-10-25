import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { AllowBlocked, CurrentUser, Public, ReqContext, type RequestCtx } from '../common/decorators'
import { can } from '../common/permissions'
import { env } from '../config/env'
import { TenantService } from '../prisma/prisma.module'
import { CobrancaService } from './cobranca.service'
import type { AuthUser } from '../common/types'
import { PlataformaService } from './plataforma.service'
import { TENANT_STATUSES } from './sistemas'

class PlanDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string
  @IsOptional() @IsString() @MaxLength(400) description?: string
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) priceCents?: number
  @IsOptional() @IsArray() @IsString({ each: true }) systems?: string[]
  @IsOptional() @IsInt() @Min(0) @Max(10_000) maxUsers?: number
  @IsOptional() @IsInt() @Min(0) @Max(10_000) maxWhatsapp?: number
  @IsOptional() @IsInt() @IsIn([0, 3, 7, 14, 30]) trialDays?: number
  @IsOptional() @IsBoolean() public?: boolean
  @IsOptional() @IsBoolean() active?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number
}

class CompanyDto {
  @IsString() @MaxLength(120) name!: string
  @IsString() @MaxLength(40) slug!: string
  @IsOptional() @ValidateIf((o: CompanyDto) => o.planId !== null) @IsUUID() planId?: string | null
  @IsOptional() @IsIn(['TESTE', 'AGUARDANDO_PAGAMENTO', 'ATIVA']) start?: 'TESTE' | 'AGUARDANDO_PAGAMENTO' | 'ATIVA'
  @IsOptional() @IsInt() @Min(1) @Max(90) trialDays?: number
  @IsOptional() @ValidateIf((o: CompanyDto) => o.paidUntil !== null) @IsISO8601() paidUntil?: string | null
  @IsString() @MaxLength(120) adminName!: string
  @IsEmail() @MaxLength(200) adminEmail!: string
  @IsOptional() @IsString() @MaxLength(20) document?: string
  @IsOptional() @IsString() @MaxLength(120) contactName?: string
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string
}

class CompanyUpdateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string
  @IsOptional() @ValidateIf((o: CompanyUpdateDto) => o.planId !== null) @IsUUID() planId?: string | null
  @IsOptional() @IsIn(TENANT_STATUSES) status?: string
  @IsOptional() @ValidateIf((o: CompanyUpdateDto) => o.paidUntil !== null) @IsISO8601() paidUntil?: string | null
  @IsOptional() @ValidateIf((o: CompanyUpdateDto) => o.trialEndsAt !== null) @IsISO8601() trialEndsAt?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(1000) extraUsers?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000) extraWhatsapp?: number
  @IsOptional() @IsArray() @IsString({ each: true }) extraSystems?: string[]
  @IsOptional() @IsString() @MaxLength(20) document?: string
  @IsOptional() @IsString() @MaxLength(120) contactName?: string
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
}

class SignupDto {
  @IsString() @MinLength(2) @MaxLength(120) company!: string
  @IsString() @MaxLength(40) slug!: string
  @IsUUID() planId!: string
  @IsString() @MaxLength(20) document!: string
  @IsString() @MinLength(2) @MaxLength(120) adminName!: string
  @IsEmail() @MaxLength(200) email!: string
  @IsOptional() @IsString() @MaxLength(20) phone?: string
  @IsString() @MinLength(12) @MaxLength(200) password!: string
}

class DomainDto {
  @IsString() @MaxLength(253) host!: string
}

class ListDto {
  @IsOptional() @IsString() @MaxLength(100) busca?: string
  @IsOptional() @IsIn(TENANT_STATUSES) situacao?: string
}

class PaymentsDto {
  @IsOptional() @IsUUID() empresa?: string
  @IsOptional() @Type(() => Number) @IsInt() pagina?: number
}

class SiteDto {
  @IsString() @MaxLength(30) whatsapp!: string
  @ValidateIf((o: SiteDto) => o.email !== '') @IsEmail() @MaxLength(200) email!: string
  @IsString() @MaxLength(60) instagram!: string
}

/** Painel da plataforma (empresa dona): empresas clientes, planos, domínios e cobranças. */
@ApiTags('Plataforma')
@Controller('plataforma')
export class PlataformaController {
  constructor(
    private readonly svc: PlataformaService,
    private readonly billing: CobrancaService,
  ) {}

  @Get('site')
  async site(@CurrentUser() user: AuthUser) {
    await this.svc.assertCan(user, 'view')
    return this.svc.siteContact()
  }

  @Put('site')
  saveSite(@CurrentUser() user: AuthUser, @Body() dto: SiteDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.saveSiteContact(user, dto, ctx)
  }

  @Get('resumo')
  summary(@CurrentUser() user: AuthUser) {
    return this.svc.summary(user)
  }

  @Get('sistemas')
  systems() {
    return this.svc.systems()
  }

  @Get('planos')
  plans(@CurrentUser() user: AuthUser) {
    return this.svc.plans(user)
  }

  @Post('planos')
  @HttpCode(200)
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: PlanDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.createPlan(user, dto, ctx)
  }

  @Put('planos/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.updatePlan(user, id, dto, ctx)
  }

  @Get('empresas')
  companies(@CurrentUser() user: AuthUser, @Query() q: ListDto) {
    return this.svc.companies(user, { search: q.busca, status: q.situacao })
  }

  @Post('empresas')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createCompany(@CurrentUser() user: AuthUser, @Body() dto: CompanyDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.createCompany(user, dto, ctx)
  }

  @Put('empresas/:id')
  async updateCompany(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyUpdateDto, @ReqContext() ctx: RequestCtx) {
    const r = await this.svc.updateCompany(user, id, dto, ctx)
    // Asaas acompanha: troca de plano muda o valor; cancelada para de cobrar.
    let billing: string | null = null
    try {
      if (dto.status === 'CANCELADA') await this.billing.canceled(id)
      else if (dto.planId !== undefined) await this.billing.planChanged(id)
    } catch (err) {
      billing = `Salvo, mas o Asaas não foi atualizado: ${(err as Error).message}`
    }
    return { ...r, warning: billing }
  }

  /** Gera (ou confere) a assinatura no Asaas e copia as cobranças. */
  @Post('empresas/:id/cobranca')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async charge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.assertCan(user, 'edit')
    return this.billing.ensureSubscription(id)
  }

  @Post('empresas/:id/convite')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resendInvite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.resendInvite(user, id)
  }

  @Post('empresas/:id/dominios')
  @HttpCode(200)
  addDomain(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DomainDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.addDomain(user, id, dto.host, ctx)
  }

  @Post('empresas/:id/dominios/verificar')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verifyDomain(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DomainDto) {
    return this.svc.verifyDomain(user, id, dto.host)
  }

  @Delete('empresas/:id/dominios/:host')
  removeDomain(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('host') host: string, @ReqContext() ctx: RequestCtx) {
    return this.svc.removeDomain(user, id, host, ctx)
  }

  @Get('cobrancas')
  payments(@CurrentUser() user: AuthUser, @Query() q: PaymentsDto) {
    return this.svc.payments(user, q.empresa)
  }
}

/**
 * Site de apresentação (SITE_DOMAIN): os planos sem preço (sob consulta), o contato comercial e o endereço do cadastro.
 */
@Controller('public/site')
export class SiteController {
  constructor(
    private readonly svc: PlataformaService,
    private readonly billing: CobrancaService,
  ) {}

  @Public()
  @Get()
  async info() {
    const [contact, plans] = await Promise.all([this.svc.siteContact(), this.billing.publicPlans()])
    const base = env.platformAdminHost ?? env.platformDomain
    return {
      contact,
      signupUrl: base ? `https://${base}/cadastro` : null,
      loginUrl: base ? `https://${base}/login` : null,
      plans,
    }
  }
}

class RemindDto {
  @IsEmail() @MaxLength(200) email!: string
}

/** Página de cadastro (pública, no domínio da plataforma): planos, endereço livre e o cadastro em si. */
@ApiTags('Plataforma')
@Controller('public/cadastro')
export class CadastroController {
  constructor(private readonly billing: CobrancaService) {}

  @Public()
  @Get('planos')
  plans() {
    return this.billing.publicPlans()
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('endereco')
  slug(@Query('slug') slug = '') {
    return this.billing.slugAvailable(slug.slice(0, 60))
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  @HttpCode(200)
  signup(@Body() dto: SignupDto, @ReqContext() ctx: RequestCtx) {
    return this.billing.signup(dto, ctx)
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('minhas-empresas')
  @HttpCode(200)
  remind(@Body() dto: RemindDto) {
    return this.billing.remindCompanies(dto.email)
  }
}

/** Avisos de cobrança do Asaas (pagamento confirmado, vencido, estornado). */
@ApiTags('Plataforma')
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  constructor(private readonly billing: CobrancaService) {}

  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  receive(@Headers('asaas-access-token') token: string | undefined, @Body() body: unknown) {
    return this.billing.webhook(token, body)
  }
}

/** Assinatura da própria empresa: plano, vencimento, faturas e o botão de pagar (vale com o acesso bloqueado). */
@ApiTags('Plataforma')
@Controller('assinatura')
export class AssinaturaController {
  constructor(private readonly billing: CobrancaService) {}

  private assertAdmin(user: AuthUser) {
    if (!user.role.isSystem && !can(user.permissions, false, 'configuracoes', 'view')) throw new ForbiddenException('Só o administrador da empresa vê a assinatura.')
  }

  @AllowBlocked()
  @Get()
  view(@CurrentUser() user: AuthUser) {
    this.assertAdmin(user)
    return this.billing.billing(user)
  }

  @AllowBlocked()
  @Post('pagar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pay(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestCtx) {
    this.assertAdmin(user)
    return this.billing.payNow(user, ctx)
  }
}

/**
 * O Caddy (servidor da frente) pergunta aqui antes de emitir o certificado HTTPS de um endereço novo: 200 libera,
 * 404 recusa. O Caddy chama a API direto pela rede interna; pelo site, o endereço é bloqueado no nginx do frontend.
 */
@Controller('public/dominio-permitido')
export class DominioPermitidoController {
  constructor(private readonly tenants: TenantService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async allowed(@Query('domain') domain = '', @Res() res: Response) {
    res.status((await this.tenants.certificateAllowed(domain.slice(0, 253))) ? 200 : 404).end()
  }
}

/**
 * Lista dos endereços com certificado, um por linha, para o deploy/certificados.sh (HTTPS no Nginx do servidor). O
 * script chama a API por dentro do container; pelo site, o endereço é bloqueado no nginx do frontend.
 */
@Controller('public/certificados')
export class CertificadosController {
  constructor(private readonly tenants: TenantService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async list(@Res() res: Response) {
    res.type('text/plain').send((await this.tenants.certificateHosts()).join('\n') + '\n')
  }
}
