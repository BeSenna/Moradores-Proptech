import { MoradorImovelTipoRelacao } from '../../generated/prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional } from 'class-validator';

export class CreateMoradorImovelDto {
  @IsInt()
  moradorId!: number;

  @IsInt()
  imovelId!: number;

  @IsEnum(MoradorImovelTipoRelacao)
  moradorImovelTipoRelacao!: MoradorImovelTipoRelacao;

  @IsDateString()
  moradorImovelDataInicio!: string;

  @IsOptional()
  @IsDateString()
  moradorImovelDataFim?: string;

  @IsOptional()
  @IsIn([0, 1])
  moradorImovelStatus?: number;
}
