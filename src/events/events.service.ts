import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

// Eventos publicados por este microsserviço (ver seção "Eventos RabbitMQ" da
// arquitetura do MS Moradores):
//   - morador.cadastrado       -> consumido pelo MS Serviços (cache local de nome)
//   - imovel.cadastrado        -> informativo para os demais serviços
//   - morador_imovel.vinculado -> consumido pelo MS Financeiro (habilita novas cobranças)
//
// MS Moradores só PUBLICA eventos, não consome nenhum — por isso só existe este
// client de emissão, sem @EventPattern/listener neste serviço.
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);

  constructor(@Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy) {}

  async onModuleDestroy() {
    await this.client.close();
  }

  publish(pattern: string, payload: Record<string, unknown>) {
    // emit() = "fire and forget", compatível com o padrão pub/sub documentado
    // (não esperamos resposta de quem consome o evento)
    this.client.emit(pattern, payload).subscribe({
      error: (err) =>
        this.logger.warn(
          `Falha ao publicar evento "${pattern}" no RabbitMQ: ${err?.message ?? err}`,
        ),
    });
  }
}
