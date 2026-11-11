import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TEMPO_MAXIMO_MS = 3000;

// GET /health — público (sem token), para Docker, Jenkins e balanceadores
// saberem se a API está de pé e conseguindo falar com o banco.
//   200  { "status": "Healthy",   "checks": { "api": "up", "database": "up" } }
//   503  { "status": "Unhealthy", "checks": { "api": "up", "database": "down" } }
// Não revela detalhes do erro (nome do banco, host, usuário): o motivo vai só para o log.
// O RabbitMQ não entra na checagem de propósito: sem ele a API continua atendendo (os eventos é que não saem).
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error(`banco sem resposta em ${TEMPO_MAXIMO_MS} ms`)), TEMPO_MAXIMO_MS).unref(),
        ),
      ]);
    } catch (e) {
      this.logger.error(`Health check falhou: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException({ status: 'Unhealthy', checks: { api: 'up', database: 'down' } });
    }
    return { status: 'Healthy', checks: { api: 'up', database: 'up' } };
  }
}
