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
import { MoradorService } from './morador.service';
import { CreateMoradorDto } from './dto/create-morador.dto';
import { UpdateMoradorDto } from './dto/update-morador.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('morador')
export class MoradorController {
  constructor(private readonly moradorService: MoradorService) {}

  @Roles('SINDICO')
  @Post()
  create(@Body() dto: CreateMoradorDto) {
    return this.moradorService.create(dto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('busca') busca?: string,
  ) {
    return this.moradorService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status !== undefined ? Number(status) : undefined,
      busca,
    });
  }

  
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
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
