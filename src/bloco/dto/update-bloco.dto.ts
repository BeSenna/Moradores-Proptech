import { PartialType } from '@nestjs/mapped-types';
import { CreateBlocoDto } from './create-bloco.dto';

export class UpdateBlocoDto extends PartialType(CreateBlocoDto) {}
