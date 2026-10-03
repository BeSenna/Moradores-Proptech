import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  usuarioLogin: string;

  @IsString()
  @IsNotEmpty()
  senha: string;
}
