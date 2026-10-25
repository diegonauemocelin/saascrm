import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator'
import { CurrentUser, ReqContext, type RequestCtx } from '../common/decorators'
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
  @IsOptional() @IsString() @MaxLength(20) document?: string
  @IsOptional() @IsString() @MaxLength(120) contactName?: string
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
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

/** Painel da plataforma (empresa dona): empresas clientes, planos, domínios e cobranças. */
@ApiTags('Plataforma')
@Controller('plataforma')
export class PlataformaController {
  constructor(private readonly svc: PlataformaService) {}

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
  updateCompany(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyUpdateDto, @ReqContext() ctx: RequestCtx) {
    return this.svc.updateCompany(user, id, dto, ctx)
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
