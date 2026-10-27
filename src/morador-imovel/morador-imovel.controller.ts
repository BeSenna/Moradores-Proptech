import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MoradorImovelTipoRelacao } from '../generated/prisma/client';
import { MoradorImovelService } from './morador-imovel.service';
import { CreateMoradorImovelDto } from './dto/create-morador-imovel.dto';
import {
  UpdateMoradorImovelDto,
  EncerrarMoradorImovelDto,
} from './dto/update-morador-imovel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QueryInt, QueryEnum } from '../common/decorators/query-params.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('morador-imovel')
export class MoradorImovelController {
  constructor(private readonly moradorImovelService: MoradorImovelService) {}

  @Roles('SINDICO')
  @Post()
  create(@Body() dto: CreateMoradorImovelDto) {
    return this.moradorImovelService.create(dto);
  }

  // GET /condominio/morador/morador-imovel?tipoRelacao=PROPRIETARIO&moradorId=5&imovelId=12
  // Lista de todas as relações: só o síndico. O morador consulta a sua em GET /morador/:id.
  @Roles('SINDICO')
  @Get()
  findAll(
    @QueryInt('page') page?: number,
    @QueryInt('pageSize') pageSize?: number,
    @QueryInt('moradorId') moradorId?: number,
    @QueryInt('imovelId') imovelId?: number,
    @QueryEnum({ nome: 'tipoRelacao', valores: Object.values(MoradorImovelTipoRelacao) })
    tipoRelacao?: MoradorImovelTipoRelacao,
    @QueryInt('status') status?: number,
  ) {
    return this.moradorImovelService.findAll({
      page,
      pageSize,
      moradorId,
      imovelId,
      tipoRelacao,
      status,
    });
  }

  // O síndico lê qualquer relação; o morador, apenas as próprias.
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    const vinculo = await this.moradorImovelService.findOne(id);
    if (user.usuarioPerfil !== 'SINDICO' && vinculo.moradorId !== user.moradorId) {
      throw new ForbiddenException('Você só pode consultar as suas próprias relações.');
    }
    return vinculo;
  }

  @Roles('SINDICO')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMoradorImovelDto) {
    return this.moradorImovelService.update(id, dto);
  }

  // Encerramento do vínculo (define data_fim); o estado ATIVO/ENCERRANDO/ENCERRADO
  // é sempre derivado da data, não gravado diretamente.
  @Roles('SINDICO')
  @Patch(':id/encerrar')
  encerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: EncerrarMoradorImovelDto) {
    return this.moradorImovelService.encerrar(id, dto);
  }

  @Roles('SINDICO')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.moradorImovelService.remove(id);
  }
}
