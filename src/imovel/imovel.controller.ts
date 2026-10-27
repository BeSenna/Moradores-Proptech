import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ImovelTipo } from '../generated/prisma/client';
import { ImovelService } from './imovel.service';
import { CreateImovelDto } from './dto/create-imovel.dto';
import { UpdateImovelDto } from './dto/update-imovel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QueryInt, QueryEnum } from '../common/decorators/query-params.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imovel')
export class ImovelController {
  constructor(private readonly imovelService: ImovelService) {}

  @Roles('SINDICO')
  @Post()
  create(@Body() dto: CreateImovelDto) {
    return this.imovelService.create(dto);
  }

  @Get()
  findAll(
    @QueryInt('page') page?: number,
    @QueryInt('pageSize') pageSize?: number,
    @QueryInt('blocoId') blocoId?: number,
    @QueryEnum({ nome: 'tipo', valores: Object.values(ImovelTipo) }) tipo?: ImovelTipo,
    @QueryInt('status') status?: number,
  ) {
    return this.imovelService.findAll({ page, pageSize, blocoId, tipo, status });
  }

  
  // O detalhe traz os moradores vinculados (com CPF, e-mail e telefone). Para o síndico vai completo;
  // para um MORADOR, os vínculos mostram só id e nome dos outros moradores (LGPD).
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    const imovel = await this.imovelService.findOne(id);
    if (user.usuarioPerfil === 'SINDICO') return imovel;
    return {
      ...imovel,
      moradorImoveis: imovel.moradorImoveis.map((v) => ({
        ...v,
        morador: { moradorId: v.morador.moradorId, moradorNome: v.morador.moradorNome },
      })),
    };
  }

  @Roles('SINDICO')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImovelDto) {
    return this.imovelService.update(id, dto);
  }

  @Roles('SINDICO')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.imovelService.remove(id);
  }
}
