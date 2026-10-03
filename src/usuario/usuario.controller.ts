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
import { UsuarioService } from './usuario.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto, ChangePasswordDto } from './dto/update-usuario.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// Toda a gestão de contas (criar, listar, trocar senha, revogar) é restrita ao síndico.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SINDICO')
@Controller('usuario')
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  @Post()
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuarioService.create(dto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('perfil') perfil?: string,
  ) {
    return this.usuarioService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      perfil,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuarioService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUsuarioDto) {
    return this.usuarioService.update(id, dto);
  }

  @Patch(':id/senha')
  changePassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangePasswordDto) {
    return this.usuarioService.changePassword(id, dto.novaSenha);
  }

  // Soft-delete (usuario_status = 0) — revoga o acesso sem apagar o histórico
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usuarioService.remove(id);
  }
}
