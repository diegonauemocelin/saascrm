import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator'
import { CurrentUser, ReqContext, type RequestCtx, RequirePermission } from '../../common/decorators'
import type { AuthUser } from '../../common/types'
import { LISTING_TYPES, type ListingType } from './publicar'
import { PublicarService } from './publicar.service'

class PublicarConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() keepSynced?: boolean
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-50) @Max(300) markupPct?: number
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(60, { each: true }) medicineWords?: string[]
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(120, { each: true }) allowedDepartments?: string[]
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(120, { each: true }) allowedGroups?: string[]
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(120, { each: true }) allowedCategories?: string[]
  @ApiPropertyOptional() @IsOptional() @IsIn(LISTING_TYPES) listingType?: ListingType
}

class PublicarProdutosQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) busca?: string
  @ApiPropertyOptional() @IsOptional() @IsIn(['todos', 'sem_anuncio', 'publicados']) situacao?: 'todos' | 'sem_anuncio' | 'publicados'
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) pagina?: number
}

class PublicarPublicacoesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['RASCUNHO', 'PENDENTE', 'ENVIANDO', 'PUBLICADO', 'ERRO']) status?: string
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) pagina?: number
}

class PublicarRascunhoDto {
  @ApiProperty() @IsString() @Matches(/^\d{1,12}$/, { message: 'Código do produto inválido.' }) codigo!: string
}

class PublicarCategoriaQueryDto {
  @ApiProperty() @IsString() @MaxLength(120) q!: string
}

class PublicarAttrDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_]{2,60}$/) id!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) value_id?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) value_name?: string
}

class PublicarRascunhoPatchDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['catalogo', 'tradicional']) mode?: 'catalogo' | 'tradicional'
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^MLB\d{1,15}$/) catalogProductId?: string | null
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^MLB\d{1,12}$/) categoryId?: string | null
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50_000) description?: string | null
  @ApiPropertyOptional() @IsOptional() @IsIn(LISTING_TYPES) listingType?: ListingType
  @ApiPropertyOptional() @IsOptional() @IsBoolean() freeShipping?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() syncEnabled?: boolean
  @ApiPropertyOptional({ type: [PublicarAttrDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PublicarAttrDto) attributes?: PublicarAttrDto[]
}

class PublicarEnvioDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids!: string[]
}

class PublicarFotoParam {
  @IsUUID('all') id!: string
  @Matches(/^[A-Za-z0-9_-]{3,80}$/) foto!: string
}

/** Marketplaces › Publicar do ERP (Mercado Livre). */
@ApiTags('Marketplaces: publicar do ERP')
@Controller('marketplace-publicar')
export class PublicarController {
  constructor(private readonly pub: PublicarService) {}

  @Get('configuracao')
  @RequirePermission('marketplace_publicar', 'view')
  config(@CurrentUser() user: AuthUser) {
    return this.pub.configView(user)
  }

  @Put('configuracao')
  @RequirePermission('marketplace_publicar', 'edit')
  saveConfig(@CurrentUser() user: AuthUser, @Body() dto: PublicarConfigDto, @ReqContext() ctx: RequestCtx) {
    return this.pub.saveConfig(user, dto, ctx)
  }

  @Get('produtos')
  @RequirePermission('marketplace_publicar', 'view')
  candidates(@CurrentUser() user: AuthUser, @Query() q: PublicarProdutosQueryDto) {
    return this.pub.candidates(user, { term: q.busca, situacao: q.situacao, page: q.pagina })
  }

  @Get('publicacoes')
  @RequirePermission('marketplace_publicar', 'view')
  publications(@CurrentUser() user: AuthUser, @Query() q: PublicarPublicacoesQueryDto) {
    return this.pub.publications(user, { status: q.status, page: q.pagina })
  }

  @Get('categorias')
  @RequirePermission('marketplace_publicar', 'edit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  categories(@CurrentUser() user: AuthUser, @Query() q: PublicarCategoriaQueryDto) {
    return this.pub.predictCategories(user.tenantId, q.q)
  }

  @Post('rascunhos')
  @HttpCode(200)
  @RequirePermission('marketplace_publicar', 'edit')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  prepare(@CurrentUser() user: AuthUser, @Body() dto: PublicarRascunhoDto, @ReqContext() ctx: RequestCtx) {
    return this.pub.prepare(user, dto.codigo, ctx)
  }

  @Get('rascunhos/:id')
  @RequirePermission('marketplace_publicar', 'view')
  draft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pub.draftView(user, id)
  }

  @Put('rascunhos/:id')
  @RequirePermission('marketplace_publicar', 'edit')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicarRascunhoPatchDto, @ReqContext() ctx: RequestCtx) {
    return this.pub.updateDraft(user, id, dto, ctx)
  }

  @Delete('rascunhos/:id')
  @RequirePermission('marketplace_publicar', 'edit')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestCtx) {
    return this.pub.remove(user, id, ctx)
  }

  @Post('rascunhos/:id/fotos')
  @HttpCode(200)
  @RequirePermission('marketplace_publicar', 'edit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.pub.uploadPicture(user, id, file)
  }

  @Delete('rascunhos/:id/fotos/:foto')
  @RequirePermission('marketplace_publicar', 'edit')
  removePicture(@CurrentUser() user: AuthUser, @Param() p: PublicarFotoParam) {
    return this.pub.removePicture(user, p.id, p.foto)
  }

  @Post('publicar')
  @HttpCode(200)
  @RequirePermission('marketplace_publicar', 'edit')
  publish(@CurrentUser() user: AuthUser, @Body() dto: PublicarEnvioDto, @ReqContext() ctx: RequestCtx) {
    return this.pub.publish(user, dto.ids, ctx)
  }
}
