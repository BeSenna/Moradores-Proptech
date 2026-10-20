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
import { ImovelTipo } from '../generated/prisma/client';
import { ImovelService } from './imovel.service';
import { CreateImovelDto } from './dto/create-imovel.dto';
import { UpdateImovelDto } from './dto/update-imovel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('blocoId') blocoId?: string,
    @Query('tipo') tipo?: ImovelTipo,
    @Query('status') status?: string,
  ) {
    return this.imovelService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      blocoId: blocoId ? Number(blocoId) : undefined,
      tipo,
      status: status !== undefined ? Number(status) : undefined,
    });
  }

  
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.imovelService.findOne(id);
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
