import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsCpf } from '../../common/validators/is-cpf.validator';

export class CreateMoradorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  moradorNome!: string;

  @IsString()
  @IsCpf()
  moradorCpf!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  moradorEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  moradorTelefone?: string;

  @IsOptional()
  @IsDateString()
  moradorDataNascimento?: string;

  
  @IsOptional()
  @IsIn([0, 1])
  moradorDeficienciaLocomocao?: number;

  @IsOptional()
  @IsIn([0, 1])
  moradorStatus?: number;
}
