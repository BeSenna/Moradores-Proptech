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
import { BlocoService } from './bloco.service';
import { CreateBlocoDto } from './dto/create-bloco.dto';
import { UpdateBlocoDto } from './dto/update-bloco.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bloco')
export class BlocoController {
  constructor(private readonly blocoService: BlocoService) {}

  @Roles('SINDICO')
  @Post()
  create(@Body() dto: CreateBlocoDto) {
    return this.blocoService.create(dto);
  }

  // GET /condominio/morador/bloco?page=1&pageSize=20&status=1&busca=torre
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('busca') busca?: string,
  ) {
    return this.blocoService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status !== undefined ? Number(status) : undefined,
      busca,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.blocoService.findOne(id);
  }

  @Roles('SINDICO')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBlocoDto) {
    return this.blocoService.update(id, dto);
  }

  // Soft-delete (muda bloco_status para 0) — mantém o histórico de imóveis vinculados
  @Roles('SINDICO')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.blocoService.remove(id);
  }
}
