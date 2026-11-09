import { UsuarioPerfil } from '../../generated/prisma/client';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { IsSenhaForte } from '../../common/validators/senha-forte';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  usuarioLogin!: string;

  // senha em texto puro — o service faz o hash com bcrypt antes de persistir.
  // Política: 8 a 16 caracteres, com maiúscula, minúscula, número e caractere especial.
  @IsSenhaForte()
  senha!: string;

  @IsOptional()
  @IsEnum(UsuarioPerfil)
  usuarioPerfil?:UsuarioPerfil;

  @IsOptional()
  @IsIn([0, 1])
  usuarioStatus?: number;

  // Opcional: já vincula este usuário a uma relação morador_imovel existente na criação.
  @IsOptional()
  @IsInt()
  @Min(1)
  moradorImovelId?: number;
}
