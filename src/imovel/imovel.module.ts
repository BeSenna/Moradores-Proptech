import { Module } from '@nestjs/common';
import { ImovelService } from './imovel.service';
import { ImovelController } from './imovel.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ImovelController],
  providers: [ImovelService],
  exports: [ImovelService],
})
export class ImovelModule {}
