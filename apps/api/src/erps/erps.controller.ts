import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import type { Response } from 'express'
import { CurrentUser, Public, ReqContext, type RequestCtx, ReqHost } from '../common/decorators'
import type { AuthUser } from '../common/types'
import { TenantService } from '../prisma/prisma.module'
import { ErpsService } from './erps.service'

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1'
const originOf = (host: string) => `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https'}://${host}`

class ErpConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean
  /** Campos da integração (os secretos em branco mantêm o valor guardado). */
  @ApiPropertyOptional() @IsOptional() @IsObject() values?: Record<string, string>
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importCost?: boolean
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) fullEveryHours?: number
}

class ErpListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) busca?: string
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() estoque?: boolean
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() inativos?: boolean
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pagina?: number
}

class ErpOauthQueryDto {
  @IsOptional() @IsString() @MaxLength(2000) code?: string
  @IsOptional() @IsString() @MaxLength(4000) state?: string
  @IsOptional() @IsString() @MaxLength(300) error?: string
}

/** Integrações com ERPs (Bling, Tiny, Omie, Linx, CIGAM): configuração, teste, cópia e produtos de cada uma. */
@ApiTags('Integrações com ERP')
@Controller('erps')
export class ErpsController {
  constructor(
    private readonly erps: ErpsService,
    private readonly tenants: TenantService,
  ) {}

  @Get(':erp')
  view(@CurrentUser() user: AuthUser, @Param('erp') erp: string, @ReqHost() host: string) {
    return this.erps.view(user, erp, originOf(host))
  }

  @Put(':erp')
  save(@CurrentUser() user: AuthUser, @Param('erp') erp: string, @Body() dto: ErpConfigDto, @ReqContext() ctx: RequestCtx) {
    return this.erps.save(user, erp, dto, ctx)
  }

  @Post(':erp/testar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentUser() user: AuthUser, @Param('erp') erp: string) {
    return this.erps.test(user, erp)
  }

  @Post(':erp/copiar-agora')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  syncNow(@CurrentUser() user: AuthUser, @Param('erp') erp: string, @ReqContext() ctx: RequestCtx) {
    return this.erps.syncNow(user, erp, ctx)
  }

  @Get(':erp/produtos')
  list(@CurrentUser() user: AuthUser, @Param('erp') erp: string, @Query() q: ErpListQueryDto) {
    return this.erps.list(user, erp, { term: q.busca, inStock: q.estoque, inactive: q.inativos, page: q.pagina })
  }

  @Post(':erp/conectar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  authorize(@CurrentUser() user: AuthUser, @Param('erp') erp: string, @ReqHost() host: string) {
    return this.erps.authorize(user, erp, originOf(host))
  }

  /** Volta do ERP depois da autorização (OAuth). A empresa sai do endereço acessado; o "state" confere a mesma. */
  @Public()
  @Get(':erp/oauth/retorno')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async oauthReturn(@Param('erp') erp: string, @Query() q: ErpOauthQueryDto, @ReqHost() host: string, @Res() res: Response) {
    const back = (msg: string | null) => res.redirect(302, `/erp/${encodeURIComponent(erp)}?${msg ? `erro=${encodeURIComponent(msg.slice(0, 200))}` : 'conectado=1'}`)
    try {
      if (q.error || !q.code || !q.state) return back(q.error ? 'A autorização foi recusada no ERP.' : 'Autorização sem código. Clique em Conectar de novo.')
      const tenantId = await this.tenants.requireFromHost(host)
      await this.erps.oauthReturn(tenantId, erp, q.code, q.state, originOf(host))
      return back(null)
    } catch (e) {
      return back((e as Error).message || 'Não foi possível concluir a autorização.')
    }
  }
}
