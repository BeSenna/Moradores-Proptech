import { UsuarioPerfil } from '@prisma/client';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  usuarioLogin!: string;

  // senha em texto puro — o service faz o hash com bcrypt antes de persistir
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  senha!: string;

  @IsOptional()
  @IsEnum(UsuarioPerfil)
  usuarioPerfil?:UsuarioPerfil;

  @IsOptional()
  @IsIn([0, 1])
  usuarioStatus?: number;

  // Opcional: já vincula este usuário a uma relação morador_imovel existente na criação.
  @IsOptional()
  moradorImovelId?: number;
}
