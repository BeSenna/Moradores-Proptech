import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUsuarioDto } from './create-usuario.dto';
import { IsString, MinLength } from 'class-validator';

// Edição não troca a senha por aqui — isso tem endpoint próprio (ver ChangePasswordDto)
export class UpdateUsuarioDto extends PartialType(
  OmitType(CreateUsuarioDto, ['senha'] as const),
) {}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres.' })
  novaSenha: string;
}
