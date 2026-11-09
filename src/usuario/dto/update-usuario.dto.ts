import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUsuarioDto } from './create-usuario.dto';
import { IsSenhaForte } from '../../common/validators/senha-forte';

// Edição não troca a senha por aqui — isso tem endpoint próprio (ver ChangePasswordDto)
export class UpdateUsuarioDto extends PartialType(
  OmitType(CreateUsuarioDto, ['senha'] as const),
) {}

export class ChangePasswordDto {
  @IsSenhaForte()
  novaSenha: string;
}
