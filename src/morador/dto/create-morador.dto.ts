import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateMoradorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  moradorNome!: string;

  @IsString()
  @Length(11, 11, { message: 'morador_cpf deve ter exatamente 11 dígitos (sem pontuação).' })
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

  // 1 = possui, 0 = não possui — mantém o mesmo padrão dos demais inteiros do schema
  @IsOptional()
  @IsIn([0, 1])
  moradorDeficienciaLocomocao?: number;

  @IsOptional()
  @IsIn([0, 1])
  moradorStatus?: number;
}
