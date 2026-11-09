import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaModule é @Global, então o PrismaService já está disponível aqui.
@Module({ controllers: [HealthController] })
export class HealthModule {}
