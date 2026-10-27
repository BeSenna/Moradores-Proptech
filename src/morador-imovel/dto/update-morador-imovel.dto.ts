import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
import { CreateMoradorImovelDto } from './create-morador-imovel.dto';

export class UpdateMoradorImovelDto extends PartialType(
  OmitType(CreateMoradorImovelDto, ['moradorImovelDataFim'] as const),
) {
  // null reabre o vínculo (limpa a data de fim); ausente não altera
  @IsOptional()
  @IsDateString()
  moradorImovelDataFim?: string | null;
}

export class EncerrarMoradorImovelDto {
  @IsDateString()
  @IsNotEmpty()
  moradorImovelDataFim: string;
}
