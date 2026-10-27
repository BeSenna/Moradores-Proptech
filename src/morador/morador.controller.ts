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
  Query,
  UseGuards,
} from '@nestjs/common';
import { MoradorService } from './morador.service';
import { CreateMoradorDto } from './dto/create-morador.dto';
import { UpdateMoradorDto } from './dto/update-morador.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QueryInt } from '../common/decorators/query-params.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('morador')
export class MoradorController {
  constructor(private readonly moradorService: MoradorService) {}

  @Roles('SINDICO')
  @Post()
  create(@Body() dto: CreateMoradorDto) {
    return this.moradorService.create(dto);
  }

  // Lista com CPF, e-mail e telefone de todos os moradores: só o síndico (LGPD).
  @Roles('SINDICO')
  @Get()
  findAll(
    @QueryInt('page') page?: number,
    @QueryInt('pageSize') pageSize?: number,
    @QueryInt('status') status?: number,
    @Query('busca') busca?: string,
  ) {
    return this.moradorService.findAll({ page, pageSize, status, busca });
  }

  // O síndico lê qualquer morador; o morador lê apenas o próprio cadastro.
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    if (user.usuarioPerfil !== 'SINDICO' && user.moradorId !== id) {
      throw new ForbiddenException('Você só pode consultar o seu próprio cadastro.');
    }
    return this.moradorService.findOne(id);
  }

  @Roles('SINDICO')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMoradorDto) {
    return this.moradorService.update(id, dto);
  }

  @Roles('SINDICO')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.moradorService.remove(id);
  }
}
