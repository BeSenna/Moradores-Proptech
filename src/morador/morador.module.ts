import { Module } from '@nestjs/common';
import { MoradorService } from './morador.service';
import { MoradorController } from './morador.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [MoradorController],
  providers: [MoradorService],
  exports: [MoradorService],
})
export class MoradorModule {}
