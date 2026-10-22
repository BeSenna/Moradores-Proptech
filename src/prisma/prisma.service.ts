import 'dotenv/config';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

// Centraliza a conexão com o banco condominio_moradores.
// Injetado em todos os módulos de domínio (bloco, imovel, morador, usuario, morador-imovel).
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL não definida. Confira o arquivo .env.');
    }
    super({ adapter: new PrismaMariaDb(url) });
  }

  private readonly logger = new Logger(PrismaService.name);

  // O adapter só abre a conexão na primeira consulta, então um $connect() sozinho não detectaria
  // banco fora do ar (VPN caída, senha errada...). O SELECT 1 força a conexão agora: se falhar,
  // a API NÃO sobe e o motivo aparece no log, em vez de dar erro 500 só no primeiro login.
  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
    } catch (e) {
      this.logger.error(
        `Não foi possível conectar ao banco: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
