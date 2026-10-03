import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EventsService } from './events.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_CLIENT',
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
            queue: 'ms_moradores_events',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
