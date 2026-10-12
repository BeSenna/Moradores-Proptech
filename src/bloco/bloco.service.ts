import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlocoDto } from './dto/create-bloco.dto';
import { UpdateBlocoDto } from './dto/update-bloco.dto';

@Injectable()
export class BlocoService {
  constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateBlocoDto) {
    try {
      return await this.prisma.bloco.create({
        data: {
          blocoNome: dto.blocoNome!,
          blocoDescricao: dto.blocoDescricao,
          blocoStatus: dto.blocoStatus ?? 1,
        },
      });
    } catch (e) {
      this.tratarErroUnicidade(e, 'Já existe um bloco com esse nome.');
    }
  }

  async findAll(params: { page?: number; pageSize?: number; status?: number; busca?: string }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const where: Prisma.BlocoWhereInput = {
      ...(params.status !== undefined ? { blocoStatus: params.status } : {}),
      ...(params.busca
        ? { blocoNome: { contains: params.busca } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.bloco.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { blocoNome: 'asc' },
        include: { _count: { select: { imoveis: true } } },
      }),
      this.prisma.bloco.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(blocoId: number) {
    const bloco = await this.prisma.bloco.findUnique({
      where: { blocoId },
      include: { imoveis: true },
    });
    if (!bloco) throw new NotFoundException(`Bloco #${blocoId} não encontrado.`);
    return bloco;
  }

  async update(blocoId: number, dto: UpdateBlocoDto) {
    await this.findOne(blocoId);
    try {
      return await this.prisma.bloco.update({ where: { blocoId }, data: dto });
    } catch (e) {
      this.tratarErroUnicidade(e, 'Já existe um bloco com esse nome.');
    }
  }

  async remove(blocoId: number) {
    await this.findOne(blocoId);
    // soft-delete, consistente com o padrão *_status do schema em vez de apagar a linha
    return this.prisma.bloco.update({
      where: { blocoId },
      data: { blocoStatus: 0 },
    });
  }

  private tratarErroUnicidade(e: unknown, mensagem: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(mensagem);
    }
    throw e;
  }
}
