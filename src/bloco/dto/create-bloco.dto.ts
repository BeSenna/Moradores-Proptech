import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlocoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  blocoNome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  blocoDescricao?: string;

  // 1 = ativo, 0 = inativo — segue o padrão dos demais campos *_status do schema
  @IsOptional()
  @IsIn([0, 1])
  blocoStatus?: number;
}
