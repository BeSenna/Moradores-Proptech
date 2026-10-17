import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateMoradorDto } from './dto/create-morador.dto';
import { UpdateMoradorDto } from './dto/update-morador.dto';

@Injectable()
export class MoradorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateMoradorDto) {
    let morador: Awaited<ReturnType<typeof this.prisma.morador.create>>;
    try {
      morador = await this.prisma.morador.create({
        data: {
          moradorNome: dto.moradorNome!,
          moradorCpf: dto.moradorCpf!,
          moradorEmail: dto.moradorEmail,
          moradorTelefone: dto.moradorTelefone,
          moradorDataNascimento: dto.moradorDataNascimento
          ? new Date(dto.moradorDataNascimento)
          : undefined,
          moradorDeficienciaLocomocao: dto.moradorDeficienciaLocomocao,
          moradorStatus: dto.moradorStatus ?? 1,
        },
      });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }

  
    this.events.publish('morador.cadastrado', {
      moradorId: morador.moradorId,
      moradorNome: morador.moradorNome,
      moradorStatus: morador.moradorStatus,
    });

    return morador;
  }

  // GET /api/morador?busca=ana&status=1&page=1&pageSize=20
  // "busca" procura em nome, CPF e e-mail
  async findAll(params: { page?: number; pageSize?: number; status?: number; busca?: string }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const where: Prisma.MoradorWhereInput = {
      ...(params.status !== undefined ? { moradorStatus: params.status } : {}),
      ...(params.busca
        ? {
            OR: [
              { moradorNome: { contains: params.busca } },
              { moradorCpf: { contains: params.busca } },
              { moradorEmail: { contains: params.busca } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.morador.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { moradorNome: 'asc' },
      }),
      this.prisma.morador.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(moradorId: number) {
    const morador = await this.prisma.morador.findUnique({
      where: { moradorId },
      include: {
        moradorImoveis: { include: { imovel: { include: { bloco: true } } } },
      },
    });
    if (!morador) throw new NotFoundException(`Morador #${moradorId} não encontrado.`);
    return morador;
  }

  async update(moradorId: number, dto: UpdateMoradorDto) {
    await this.findOne(moradorId);
    try {
      return await this.prisma.morador.update({
      where: { moradorId },
      data: {
        ...dto,
        moradorDataNascimento: dto.moradorDataNascimento
          ? new Date(dto.moradorDataNascimento)
          : undefined,
      },
    });
  } catch (e) {
    this.tratarErroUnicidade(e);
  }
}

  async remove(moradorId: number) {
    await this.findOne(moradorId);
    return this.prisma.morador.update({
      where: { moradorId },
      data: { moradorStatus: 0 },
    });
  }

  private tratarErroUnicidade(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const campo = (e.meta?.target as string[])?.join(', ') ?? 'campo único';
      throw new ConflictException(`Já existe um morador com esse(a) ${campo}.`);
    }
    throw e;
  }
}