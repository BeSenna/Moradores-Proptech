import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { BlocoModule } from './bloco/bloco.module';
import { ImovelModule } from './imovel/imovel.module';
import { MoradorModule } from './morador/morador.module';
import { UsuarioModule } from './usuario/usuario.module';
import { MoradorImovelModule } from './morador-imovel/morador-imovel.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    AuthModule,
    BlocoModule,
    ImovelModule,
    MoradorModule,
    UsuarioModule,
    MoradorImovelModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {
  constructor() {
    console.log("Aplicação iniciada!");
    console.log("Banco:", process.env.DATABASE_URL);
    console.log("API Key:", process.env.API_KEY);
    console.log("JWT Secret:", process.env.JWT_SECRET);   
  }
}
