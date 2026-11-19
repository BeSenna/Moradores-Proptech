import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MoradorImovelTipoRelacao, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateMoradorImovelDto } from './dto/create-morador-imovel.dto';
import { UpdateMoradorImovelDto, EncerrarMoradorImovelDto,} from './dto/update-morador-imovel.dto';
 
type EstadoRelacao = 'ATIVO' | 'ENCERRANDO' | 'ENCERRADO';
 
// Tipos de relação que habilitam cobrança — ver "Eventos RabbitMQ" na arquitetura
// do MS Moradores: o evento só é relevante para o MS Financeiro nestes dois casos.
const TIPOS_QUE_GERAM_COBRANCA: MoradorImovelTipoRelacao[] = ['PROPRIETARIO', 'INQUILINO'];

// Uma pessoa pode ter mais de uma relação ativa com o MESMO imóvel, mas a única soma
// de tipos permitida é PROPRIETARIO + MORADOR (o dono que também mora lá).
// Qualquer outra (dono + inquilino, dono + temporada, inquilino + morador...) é bloqueada.
const COMBINACAO_PERMITIDA: MoradorImovelTipoRelacao[] = ['PROPRIETARIO', 'MORADOR'];

const ROTULO_TIPO: Record<MoradorImovelTipoRelacao, string> = {
  PROPRIETARIO: 'Proprietário',
  INQUILINO: 'Inquilino',
  MORADOR: 'Morador',
  TEMPORADA: 'Temporada',
};
 
@Injectable()
export class MoradorImovelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}
 
  async create(dto: CreateMoradorImovelDto) {
    await this.garantirMoradorExiste(dto.moradorId!);
    await this.garantirImovelExiste(dto.imovelId!);
 
    if (dto.moradorImovelDataFim && dto.moradorImovelDataFim < dto.moradorImovelDataInicio!) {
      throw new ConflictException(
        'morador_imovel_data_fim não pode ser anterior à data_inicio.',
      );
    }
 
    const status = dto.moradorImovelStatus ?? 1;
    if (this.estaVigente(status, dto.moradorImovelDataFim ?? null)) {
      await this.garantirCombinacaoPermitida(
        dto.moradorId!,
        dto.imovelId!,
        dto.moradorImovelTipoRelacao!,
      );
    }

    // O acesso ao portal é da pessoa, não da relação: se o morador já tem uma conta ativa
    // em outra relação, a nova relação herda a mesma conta (um único login para todos os imóveis).
    const usuarioId = await this.usuarioDoMorador(dto.moradorId!);

    let vinculo: Awaited<ReturnType<typeof this.prisma.moradorImovel.create>>;
    try {
      vinculo = await this.prisma.moradorImovel.create({
        data: {
          moradorId: dto.moradorId!,
          imovelId: dto.imovelId!,
          moradorImovelTipoRelacao: dto.moradorImovelTipoRelacao!,
          moradorImovelDataInicio: new Date(dto.moradorImovelDataInicio!),
          moradorImovelDataFim: dto.moradorImovelDataFim
            ? new Date(dto.moradorImovelDataFim)
            : undefined,
          moradorImovelStatus: status,
          ...(usuarioId !== null ? { usuarioId } : {}),
        },
      });
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
 
    // A conta de acesso fica amarrada à pessoa: trocar o morador de uma relação que já tem
    // login deixaria a conta apontando para duas pessoas diferentes.
    if (
      dto.moradorId !== undefined &&
      dto.moradorId !== atual.moradorId &&
      atual.usuarioId !== null &&
      atual.usuarioId !== undefined
    ) {
      throw new ConflictException(
        'Esta relação tem acesso ao portal e não pode ser transferida para outro morador. Crie uma nova relação.',
      );
    }

    // Valida a combinação de tipos com o estado que a relação terá depois da edição.
    const final = {
      moradorId: dto.moradorId ?? atual.moradorId,
      imovelId: dto.imovelId ?? atual.imovelId,
      tipo: dto.moradorImovelTipoRelacao ?? atual.moradorImovelTipoRelacao,
      status: dto.moradorImovelStatus ?? atual.moradorImovelStatus,
      dataFim:
        dto.moradorImovelDataFim === undefined
          ? atual.moradorImovelDataFim
          : dto.moradorImovelDataFim
            ? new Date(dto.moradorImovelDataFim)
            : null,
    };
    if (this.estaVigente(final.status, final.dataFim)) {
      await this.garantirCombinacaoPermitida(
        final.moradorId,
        final.imovelId,
        final.tipo,
        moradorImovelId,
      );
    }

    try {
      const vinculo = await this.prisma.moradorImovel.update({
        where: { moradorImovelId },
        data: {
          ...dto,
          moradorImovelDataInicio: dto.moradorImovelDataInicio
            ? new Date(dto.moradorImovelDataInicio)
            : undefined,
          moradorImovelDataFim: dto.moradorImovelDataFim
            ? new Date(dto.moradorImovelDataFim)
            : dto.moradorImovelDataFim === null
              ? null
              : undefined,
        },
      });
      return this.comEstadoDerivado(vinculo);
    } catch (e) {
      this.tratarErroUnicidade(e);
    }
  }
 
  async encerrar(moradorImovelId: number, dto: EncerrarMoradorImovelDto) {
    const vinculo = await this.findOne(moradorImovelId);
    if (dto.moradorImovelDataFim < vinculo.moradorImovelDataInicio.toISOString().slice(0, 10)) {
      throw new ConflictException(
        'morador_imovel_data_fim não pode ser anterior à data_inicio.',
      );
    }
    const atualizado = await this.prisma.moradorImovel.update({
      where: { moradorImovelId },
      data: { moradorImovelDataFim: new Date(dto.moradorImovelDataFim) },
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
 
  // Relação em vigor: ativa e sem data de fim, ou com fim ainda no futuro (ENCERRANDO).
  private estaVigente(status: number, dataFim: Date | string | null): boolean {
    if (status !== 1) return false;
    if (!dataFim) return true;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return new Date(dataFim) > hoje;
  }

  // Bloqueia, para o mesmo morador e o mesmo imóvel, qualquer soma de tipos que não seja
  // PROPRIETARIO + MORADOR. Só conta o que está em vigor: o histórico (relações encerradas
  // ou desativadas) não impede, por exemplo, que um ex-inquilino se torne proprietário.
  private async garantirCombinacaoPermitida(
    moradorId: number,
    imovelId: number,
    tipo: MoradorImovelTipoRelacao,
    ignorarId?: number,
  ) {
    const outras = await this.prisma.moradorImovel.findMany({
      where: {
        moradorId,
        imovelId,
        moradorImovelStatus: 1,
        ...(ignorarId !== undefined ? { moradorImovelId: { not: ignorarId } } : {}),
      },
      select: { moradorImovelTipoRelacao: true, moradorImovelDataFim: true },
    });

    for (const o of outras) {
      if (!this.estaVigente(1, o.moradorImovelDataFim)) continue;
      const outro = o.moradorImovelTipoRelacao;
      if (outro === tipo) continue; // a duplicata exata é barrada pelo índice único (P2002)
      const permitida = COMBINACAO_PERMITIDA.includes(tipo) && COMBINACAO_PERMITIDA.includes(outro);
      if (!permitida) {
        throw new ConflictException(
          `Este morador já tem uma relação ativa de ${ROTULO_TIPO[outro]} neste imóvel. ` +
            `A única combinação permitida no mesmo imóvel é Proprietário + Morador; ` +
            `encerre a relação atual antes de cadastrar ${ROTULO_TIPO[tipo]}.`,
        );
      }
    }
  }

  // Conta de acesso ativa que o morador já usa em outra relação (se houver).
  private async usuarioDoMorador(moradorId: number): Promise<number | null> {
    const existente = await this.prisma.moradorImovel.findFirst({
      where: { moradorId, usuarioId: { not: null }, usuario: { usuarioStatus: 1 } },
      orderBy: { moradorImovelId: 'asc' },
      select: { usuarioId: true },
    });
    return existente?.usuarioId ?? null;
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
