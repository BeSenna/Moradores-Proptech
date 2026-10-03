import { Module } from '@nestjs/common';
import { BlocoService } from './bloco.service';
import { BlocoController } from './bloco.controller';

@Module({
  controllers: [BlocoController],
  providers: [BlocoService],
  exports: [BlocoService],
})
export class BlocoModule {}
