import { Module } from '@nestjs/common';
import { MoradorImovelService } from './morador-imovel.service';
import { MoradorImovelController } from './morador-imovel.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [MoradorImovelController],
  providers: [MoradorImovelService],
  exports: [MoradorImovelService],
})
export class MoradorImovelModule {}
