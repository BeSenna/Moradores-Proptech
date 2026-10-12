import { ImovelTipo } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateImovelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  imovelNumero!: string;

  @IsOptional()
  @IsInt()
  imovelAndar?: number;

  @IsInt()
  blocoId!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  imovelAreaM2?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  imovelMatricula?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  imovelIptu?: string;

  @IsEnum(ImovelTipo)
  imovelTipo!: ImovelTipo;

  @IsOptional()
  @IsInt()
  @Min(0)
  imovelGaragem?: number;

  @IsOptional()
  @IsIn([0, 1])
  imovelStatus?: number;
}
