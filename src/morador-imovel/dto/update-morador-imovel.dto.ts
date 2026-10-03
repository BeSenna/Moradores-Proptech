import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsNotEmpty } from 'class-validator';
import { CreateMoradorImovelDto } from './create-morador-imovel.dto';

export class UpdateMoradorImovelDto extends PartialType(CreateMoradorImovelDto) {}

export class EncerrarMoradorImovelDto {
  @IsDateString()
  @IsNotEmpty()
  moradorImovelDataFim: string;
}
