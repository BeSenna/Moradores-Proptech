import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: qualquer módulo que precisar do PrismaService só importa o PrismaModule uma vez (no AppModule)
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
