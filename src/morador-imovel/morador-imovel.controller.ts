import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { Roles } from '../auth/decorators/roles.decorator';

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
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('moradorId') moradorId?: string,
    @Query('imovelId') imovelId?: string,
    @Query('tipoRelacao') tipoRelacao?: MoradorImovelTipoRelacao,
    @Query('status') status?: string,
  ) {
    return this.moradorImovelService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      moradorId: moradorId ? Number(moradorId) : undefined,
      imovelId: imovelId ? Number(imovelId) : undefined,
      tipoRelacao,
      status: status !== undefined ? Number(status) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.moradorImovelService.findOne(id);
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
