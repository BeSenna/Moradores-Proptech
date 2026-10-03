import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MoradorImovelTipoRelacao, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateMoradorImovelDto } from './dto/create-morador-imovel.dto';
import {
  UpdateMoradorImovelDto,
  EncerrarMoradorImovelDto,
} from './dto/update-morador-imovel.dto';

type EstadoRelacao = 'ATIVO' | 'ENCERRANDO' | 'ENCERRADO';

// Tipos de relação que habilitam cobrança — ver "Eventos RabbitMQ" na arquitetura
// do MS Moradores: o evento só é relevante para o MS Financeiro nestes dois casos.
const TIPOS_QUE_GERAM_COBRANCA: MoradorImovelTipoRelacao[] = ['PROPRIETARIO', 'INQUILINO'];

@Injectable()
export class MoradorImovelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateMoradorImovelDto) {
    await this.garantirMoradorExiste(dto.moradorId);
    await this.garantirImovelExiste(dto.imovelId);

    if (dto.moradorImovelDataFim && dto.moradorImovelDataFim < dto.moradorImovelDataInicio) {
      throw new ConflictException(
        'morador_imovel_data_fim não pode ser anterior à data_inicio.',
      );
    }

    let vinculo: Awaited<ReturnType<typeof this.prisma.moradorImovel.create>>;
    try {
      vinculo = await this.prisma.moradorImovel.create({ data: dto });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }

    // Evento documentado na arquitetura: disparado ao vincular um morador como
    // PROPRIETARIO/INQUILINO; consumido pelo MS Financeiro para habilitar novas cobranças.
    if (TIPOS_QUE_GERAM_COBRANCA.includes(vinculo.moradorImovelTipoRelacao)) {
      this.events.publish('morador_imovel.vinculado', {
        moradorImovelId: vinculo.moradorImovelId,
        moradorId: vinculo.moradorId,
        imovelId: vinculo.imovelId,
        tipoRelacao: vinculo.moradorImovelTipoRelacao,
        dataInicio: vinculo.moradorImovelDataInicio,
      });
    }

    return this.comEstadoDerivado(vinculo);
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    moradorId?: number;
    imovelId?: number;
    tipoRelacao?: MoradorImovelTipoRelacao;
    status?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const where: Prisma.MoradorImovelWhereInput = {
      ...(params.moradorId !== undefined ? { moradorId: params.moradorId } : {}),
      ...(params.imovelId !== undefined ? { imovelId: params.imovelId } : {}),
      ...(params.tipoRelacao !== undefined
        ? { moradorImovelTipoRelacao: params.tipoRelacao }
        : {}),
      ...(params.status !== undefined ? { moradorImovelStatus: params.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.moradorImovel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { moradorImovelDataInicio: 'desc' },
        include: {
          morador: { select: { moradorId: true, moradorNome: true } },
          imovel: { select: { imovelId: true, imovelNumero: true, blocoId: true } },
        },
      }),
      this.prisma.moradorImovel.count({ where }),
    ]);

    return {
      data: data.map((v) => this.comEstadoDerivado(v)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(moradorImovelId: number) {
    const vinculo = await this.prisma.moradorImovel.findUnique({
      where: { moradorImovelId },
      include: { morador: true, imovel: { include: { bloco: true } } },
    });
    if (!vinculo)
      throw new NotFoundException(`Relação #${moradorImovelId} não encontrada.`);
    return this.comEstadoDerivado(vinculo);
  }

  async update(moradorImovelId: number, dto: UpdateMoradorImovelDto) {
    const atual = await this.findOne(moradorImovelId);
    if (dto.moradorId !== undefined) await this.garantirMoradorExiste(dto.moradorId);
    if (dto.imovelId !== undefined) await this.garantirImovelExiste(dto.imovelId);

    // mesma validação de create()/encerrar(): garante que PATCH não contorne a regra
    // de que data_fim nunca pode ficar antes de data_inicio
    if (dto.moradorImovelDataFim) {
      const dataInicio =
        dto.moradorImovelDataInicio ?? atual.moradorImovelDataInicio.toISOString().slice(0, 10);
      if (dto.moradorImovelDataFim < dataInicio) {
        throw new ConflictException(
          'morador_imovel_data_fim não pode ser anterior à data_inicio.',
        );
      }
    }

    try {
      const vinculo = await this.prisma.moradorImovel.update({
        where: { moradorImovelId },
        data: dto,
      });
      return this.comEstadoDerivado(vinculo);
    } catch (e) {
      this.tratarErroUnicidade(e);
    }
  }

  // Define a data de fim do vínculo. O estado (ATIVO / ENCERRANDO / ENCERRADO)
  // é sempre derivado comparando essa data com hoje — não existe uma coluna própria para isso.
  async encerrar(moradorImovelId: number, dto: EncerrarMoradorImovelDto) {
    const vinculo = await this.findOne(moradorImovelId);
    if (dto.moradorImovelDataFim < vinculo.moradorImovelDataInicio.toISOString().slice(0, 10)) {
      throw new ConflictException(
        'morador_imovel_data_fim não pode ser anterior à data_inicio.',
      );
    }
    const atualizado = await this.prisma.moradorImovel.update({
      where: { moradorImovelId },
      data: { moradorImovelDataFim: dto.moradorImovelDataFim },
    });
    return this.comEstadoDerivado(atualizado);
  }

  async remove(moradorImovelId: number) {
    await this.findOne(moradorImovelId);
    return this.prisma.moradorImovel.update({
      where: { moradorImovelId },
      data: { moradorImovelStatus: 0 },
    });
  }

  private comEstadoDerivado<T extends { moradorImovelDataFim: Date | null }>(
    vinculo: T,
  ): T & { estado: EstadoRelacao } {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let estado: EstadoRelacao = 'ATIVO';
    if (vinculo.moradorImovelDataFim) {
      estado = vinculo.moradorImovelDataFim <= hoje ? 'ENCERRADO' : 'ENCERRANDO';
    }
    return { ...vinculo, estado };
  }

  private async garantirMoradorExiste(moradorId: number) {
    const morador = await this.prisma.morador.findUnique({ where: { moradorId } });
    if (!morador) throw new NotFoundException(`Morador #${moradorId} não encontrado.`);
  }

  private async garantirImovelExiste(imovelId: number) {
    const imovel = await this.prisma.imovel.findUnique({ where: { imovelId } });
    if (!imovel) throw new NotFoundException(`Imóvel #${imovelId} não encontrado.`);
  }

  private tratarErroUnicidade(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(
        'Já existe uma relação com esse morador, imóvel e tipo de relação.',
      );
    }
    throw e;
  }
}
