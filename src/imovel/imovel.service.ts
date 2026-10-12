import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ImovelTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateImovelDto } from './dto/create-imovel.dto';
import { UpdateImovelDto } from './dto/update-imovel.dto';

@Injectable()
export class ImovelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateImovelDto) {
    // blocoId é obrigatório no DTO (@IsInt(), sem @IsOptional()) — a asserção
    // só documenta pro compilador o que a validação já garante em tempo de execução.
    await this.garantirBlocoExiste(dto.blocoId!);

    let imovel: Awaited<ReturnType<typeof this.prisma.imovel.create>>;
    try {
      imovel = await this.prisma.imovel.create({
        data: {
          imovelNumero: dto.imovelNumero!,
          imovelAndar: dto.imovelAndar,
          blocoId: dto.blocoId!,
          imovelAreaM2: dto.imovelAreaM2,
          imovelMatricula: dto.imovelMatricula,
          imovelIptu: dto.imovelIptu,
          imovelTipo: dto.imovelTipo!,
          imovelGaragem: dto.imovelGaragem,
          imovelStatus: dto.imovelStatus ?? 1,
        },
      });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }

    // Evento documentado na arquitetura do MS Moradores: informativo para os demais serviços.
    this.events.publish('imovel.cadastrado', {
      imovelId: imovel.imovelId,
      blocoId: imovel.blocoId,
      imovelNumero: imovel.imovelNumero,
      imovelTipo: imovel.imovelTipo,
    });

    return imovel;
  }

  // GET /api/imovel?blocoId=1&tipo=APARTAMENTO&page=1&pageSize=20
  async findAll(params: {
    page?: number;
    pageSize?: number;
    blocoId?: number;
    tipo?: ImovelTipo;
    status?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

    const where: Prisma.ImovelWhereInput = {
      ...(params.blocoId !== undefined ? { blocoId: params.blocoId } : {}),
      ...(params.tipo !== undefined ? { imovelTipo: params.tipo } : {}),
      ...(params.status !== undefined ? { imovelStatus: params.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.imovel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ blocoId: 'asc' }, { imovelNumero: 'asc' }],
        include: { bloco: { select: { blocoNome: true } } },
      }),
      this.prisma.imovel.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(imovelId: number) {
    const imovel = await this.prisma.imovel.findUnique({
      where: { imovelId },
      include: {
        bloco: true,
        moradorImoveis: { include: { morador: true } },
      },
    });
    if (!imovel) throw new NotFoundException(`Imóvel #${imovelId} não encontrado.`);
    return imovel;
  }

  async update(imovelId: number, dto: UpdateImovelDto) {
    await this.findOne(imovelId);
    if (dto.blocoId !== undefined) await this.garantirBlocoExiste(dto.blocoId);
    try {
      return await this.prisma.imovel.update({ where: { imovelId }, data: dto });
    } catch (e) {
      this.tratarErroUnicidade(e);
    }
  }

  async remove(imovelId: number) {
    await this.findOne(imovelId);
    return this.prisma.imovel.update({
      where: { imovelId },
      data: { imovelStatus: 0 },
    });
  }

  private async garantirBlocoExiste(blocoId: number) {
    const bloco = await this.prisma.bloco.findUnique({ where: { blocoId } });
    if (!bloco) throw new NotFoundException(`Bloco #${blocoId} não encontrado.`);
  }

  private tratarErroUnicidade(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Já existe um imóvel com esse número neste bloco.');
    }
    throw e;
  }
}