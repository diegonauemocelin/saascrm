import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import type { Response } from 'express'
import { CurrentUser, Public, ReqContext, type RequestCtx } from '../common/decorators'
import type { AuthUser } from '../common/types'
import { LojasService } from './lojas.service'

class LojaConfigDto {
  @ApiProperty() @IsBoolean() enabled!: boolean
  /** Campos da integração (os secretos em branco mantêm o valor guardado). */
  @ApiPropertyOptional() @IsOptional() @IsObject() values?: Record<string, string>
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importCustomers?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importOrders?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importCarts?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() importProducts?: boolean
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(72) abandonHours?: number
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[]
}

class LojaAppDto {
  /** Chaves do aplicativo da SG na plataforma (só a empresa dona). */
  @ApiProperty() @IsObject() values!: Record<string, string>
}

class LojaOauthQueryDto {
  @IsOptional() @IsString() @MaxLength(2000) code?: string
  @IsOptional() @IsString() @MaxLength(4000) state?: string
  @IsOptional() @IsString() @MaxLength(100) store?: string
  @IsOptional() @IsString() @MaxLength(300) api_address?: string
  @IsOptional() @IsString() @MaxLength(300) error?: string
}

/** Integrações com loja virtual (Tray, Nuvemshop, Loja Integrada): configuração, conexão e sincronização. */
@ApiTags('Integrações com loja virtual')
@Controller('lojas')
export class LojasController {
  constructor(private readonly lojas: LojasService) {}

  @Get(':loja')
  view(@CurrentUser() user: AuthUser, @Param('loja') loja: string) {
    return this.lojas.view(user, loja)
  }

  @Put(':loja')
  save(@CurrentUser() user: AuthUser, @Param('loja') loja: string, @Body() dto: LojaConfigDto, @ReqContext() ctx: RequestCtx) {
    return this.lojas.save(user, loja, dto, ctx)
  }

  @Put(':loja/aplicativo')
  saveApp(@CurrentUser() user: AuthUser, @Param('loja') loja: string, @Body() dto: LojaAppDto, @ReqContext() ctx: RequestCtx) {
    return this.lojas.saveApp(user, loja, dto.values, ctx)
  }

  @Post(':loja/testar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentUser() user: AuthUser, @Param('loja') loja: string) {
    return this.lojas.test(user, loja)
  }

  @Post(':loja/sincronizar')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  syncNow(@CurrentUser() user: AuthUser, @Param('loja') loja: string, @ReqContext() ctx: RequestCtx) {
    return this.lojas.syncNow(user, loja, ctx)
  }

  @Post(':loja/conectar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  authorize(@CurrentUser() user: AuthUser, @Param('loja') loja: string) {
    return this.lojas.authorize(user, loja)
  }

  /** Volta da autorização da loja (rota pública). O "state" criptografado diz a empresa; a resposta volta para ela. */
  @Public()
  @Get([':loja/oauth/retorno', ':loja/oauth/retorno/:state'])
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async oauthReturn(@Param('loja') loja: string, @Param('state') pathState: string | undefined, @Query() q: LojaOauthQueryDto, @Res() res: Response) {
    const params: Record<string, string> = {}
    for (const [k, v] of Object.entries(q)) if (typeof v === 'string') params[k] = v
    if (pathState) params.state = pathState
    try {
      const r = await this.lojas.oauthReturn(loja, params)
      const err = q.error ? 'A autorização foi recusada na loja.' : !q.code ? 'Autorização sem código. Clique em Conectar de novo.' : r.error
      return res.redirect(302, `${r.back}?${err ? `erro=${encodeURIComponent(err.slice(0, 200))}` : 'conectado=1'}`)
    } catch (e) {
      return res.status(400).type('text/plain; charset=utf-8').send((e as Error).message || 'Autorização inválida.')
    }
  }
}
