import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator'
import { CurrentUser, ReqContext, type RequestCtx, RequirePermission } from '../common/decorators'
import type { AuthUser } from '../common/types'
import { TrierService } from './trier.service'

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1'

class TrierConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) baseUrl?: string
  /** Vazio mantém o token guardado. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) token?: string
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ecommerceOnly?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useEcommerceValues?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importCost?: boolean
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) fullEveryHours?: number
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(120) incrementalMinutes?: number
}

class TrierListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) busca?: string
  @ApiPropertyOptional() @IsOptional() @IsIn(['sim', 'nao', 'todos']) ecommerce?: 'sim' | 'nao' | 'todos'
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() estoque?: boolean
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() inativos?: boolean
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) departamento?: string
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) pagina?: number
}

class TrierVpnDto {
  /** "ip:porta" exatos do servidor da Trier na VPN, ou null para retirar a liberação. */
  @ApiProperty({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) endereco!: string | null
}

@ApiTags('Trier (ERP de farmácias)')
@Controller('trier')
export class TrierController {
  constructor(private readonly trier: TrierService) {}

  @Get('config')
  @RequirePermission('erp_trier', 'view')
  config(@CurrentUser() user: AuthUser) {
    return this.trier.view(user)
  }

  @Put('config')
  @RequirePermission('erp_trier', 'edit')
  save(@CurrentUser() user: AuthUser, @Body() dto: TrierConfigDto, @ReqContext() ctx: RequestCtx) {
    return this.trier.save(user, dto, ctx)
  }

  @Post('config/testar')
  @HttpCode(200)
  @RequirePermission('erp_trier', 'edit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentUser() user: AuthUser) {
    return this.trier.test(user)
  }

  @Post('config/copiar-agora')
  @HttpCode(200)
  @RequirePermission('erp_trier', 'edit')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  syncNow(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestCtx) {
    return this.trier.syncNow(user, ctx)
  }

  @Get('produtos')
  @RequirePermission('erp_trier', 'view')
  list(@CurrentUser() user: AuthUser, @Query() q: TrierListQueryDto) {
    return this.trier.list(user, { term: q.busca, ecommerce: q.ecommerce, inStock: q.estoque, inactive: q.inativos, department: q.departamento, page: q.pagina })
  }

  @Get('valores')
  @RequirePermission('erp_trier', 'view')
  values(@CurrentUser() user: AuthUser) {
    return this.trier.values(user.tenantId)
  }

  /** Plataforma: empresas com a Trier em endereço privado (acesso pela VPN). */
  @Get('plataforma/vpn')
  @RequirePermission('plataforma', 'view')
  vpnList(@CurrentUser() user: AuthUser) {
    return this.trier.vpnList(user)
  }

  @Put('plataforma/vpn/:tenantId')
  @RequirePermission('plataforma', 'edit')
  vpnSet(@CurrentUser() user: AuthUser, @Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: TrierVpnDto, @ReqContext() ctx: RequestCtx) {
    return this.trier.vpnSet(user, tenantId, dto.endereco, ctx)
  }
}
